"""Persistent accounts; opaque login sessions stay on the Python server."""
from __future__ import annotations

import hashlib
import hmac
import re
import secrets
import sqlite3
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit

import requests
from firebase_auth import FirebaseAuth, FirebaseAuthError

ITERATIONS = 600_000
SESSION_SECONDS = 12 * 60 * 60


class AuthError(Exception):
    def __init__(self, message, code="auth_error", status=400):
        super().__init__(message)
        self.code, self.status = code, status


class AuthService:
    def __init__(self, directory, settings=None, *, cloud=False, request=None):
        settings = settings or {}
        self.url = str(settings.get("SUPABASE_URL", "")).strip().rstrip("/")
        self.key = str(settings.get("SUPABASE_PUBLISHABLE_KEY", "") or settings.get("SUPABASE_ANON_KEY", "")).strip()
        self.http = request or requests.request
        self.firebase = FirebaseAuth(settings.get("FIREBASE_API_KEY", ""), request=self.http)
        self.lock = threading.RLock()
        self.sessions, self.attempts = {}, {}
        self.mode = "supabase" if self.url and self.key else "unconfigured" if cloud or self.url or self.key else "sqlite"
        if self.firebase.api_key:
            self.mode = "firebase"
        if self.mode == "supabase" and (urlsplit(self.url).scheme != "https" or not urlsplit(self.url).hostname):
            self.mode = "unconfigured"
        self.db = Path(directory) / "accounts.db"
        if self.mode == "sqlite":
            with sqlite3.connect(self.db) as conn:
                conn.execute("""CREATE TABLE IF NOT EXISTS accounts (
                    id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL,
                    name TEXT NOT NULL, salt TEXT NOT NULL, password_hash TEXT NOT NULL,
                    created_at INTEGER NOT NULL)""")
            try:
                self.db.chmod(0o600)
            except OSError:
                pass

    def config(self, ticket=""):
        return {"enabled": self.mode != "unconfigured", "provider": self.mode,
                "user": self.user(ticket), "message": "" if self.mode != "unconfigured" else
                "กรุณาตั้งค่า FIREBASE_API_KEY ใน Secrets ก่อนใช้งานบัญชี"}

    def firebase_call(self, method, *args):
        try:
            return getattr(self.firebase, method)(*args)
        except FirebaseAuthError as exc:
            raise AuthError(str(exc), exc.code, exc.status) from None

    @staticmethod
    def firebase_user(value):
        return {"id": str(value["localId"]), "email": value.get("email", ""),
                "name": value.get("displayName") or value.get("email", "")}

    @staticmethod
    def check_firebase_user(value, remote, expected_id=None):
        try:
            revoked = int(value.get("validSince", 0)) > remote["auth_time"]
        except (TypeError, ValueError, KeyError):
            revoked = True
        if revoked or (expected_id is not None and value.get("localId") != expected_id):
            raise AuthError("เซสชันถูกยกเลิก กรุณาเข้าสู่ระบบใหม่", "unauthorized", 401)

    def check_config(self):
        if self.mode == "unconfigured":
            raise AuthError(self.config()["message"], "auth_not_configured", 503)

    def credentials(self, payload, registering=False):
        email, password = payload.get("email", ""), payload.get("password", "")
        if not isinstance(email, str) or not isinstance(password, str):
            raise AuthError("กรุณากรอกอีเมลและรหัสผ่าน")
        email = email.strip().lower()
        if len(email) > 254 or not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
            raise AuthError("กรุณากรอกอีเมลให้ถูกต้อง")
        minimum, maximum = (8, 128) if registering else (1, 4096)
        if not minimum <= len(password) <= maximum:
            raise AuthError("รหัสผ่านต้องมี 8–128 ตัวอักษร" if registering else "กรุณากรอกรหัสผ่านให้ถูกต้อง")
        name = payload.get("name", "")
        if registering and (not isinstance(name, str) or not 1 <= len(name.strip()) <= 80):
            raise AuthError("กรุณากรอกชื่อที่ใช้แสดง ไม่เกิน 80 ตัวอักษร")
        return email, password, name.strip() if isinstance(name, str) else ""

    def throttle(self, client, email):
        now = time.time()
        with self.lock:
            for key in list(self.attempts):
                self.attempts[key] = [t for t in self.attempts[key] if now - t < 300]
                if not self.attempts[key]:
                    del self.attempts[key]
            keys = ["client:" + client, "email:" + email]
            if any(len(self.attempts.get(key, [])) >= 15 for key in keys):
                raise AuthError("ลองเข้าสู่ระบบถี่เกินไป กรุณารอ 5 นาที", "rate_limited", 429)
            for key in keys:
                self.attempts.setdefault(key, []).append(now)

    @staticmethod
    def password_hash(password, salt):
        return hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), ITERATIONS).hex()

    @staticmethod
    def public_user(value):
        return {"id": str(value["id"]), "email": value.get("email", ""),
                "name": (value.get("user_metadata") or {}).get("name") or value.get("name") or value.get("email", "")}

    def remote(self, method, route, body=None, access=""):
        headers = {"apikey": self.key, "Content-Type": "application/json"}
        if access:
            headers["Authorization"] = "Bearer " + access
        try:
            response = self.http(method, self.url + "/auth/v1/" + route,
                                 headers=headers, json=body, timeout=(10, 30))
            value = response.json() if response.content else {}
        except (requests.RequestException, ValueError):
            raise AuthError("เชื่อมต่อระบบบัญชีไม่สำเร็จ กรุณาลองใหม่", "auth_network", 503) from None
        if not response.ok:
            code = value.get("error_code") or value.get("code") if isinstance(value, dict) else ""
            if response.status_code == 429:
                raise AuthError("ระบบบัญชีใช้งานถี่เกินไป กรุณาลองใหม่ภายหลัง", "rate_limited", 429)
            if code == "email_not_confirmed":
                raise AuthError("กรุณายืนยันอีเมลจากลิงก์ในกล่องจดหมายก่อนเข้าสู่ระบบ", "email_not_confirmed", 401)
            if route.startswith("token"):
                raise AuthError("อีเมลหรือรหัสผ่านไม่ถูกต้อง หรือเซสชันหมดอายุ", "invalid_credentials", 401)
            if route == "user":
                raise AuthError("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่", "unauthorized", 401)
            raise AuthError("สมัครไม่สำเร็จ ตรวจอีเมล รหัสผ่าน และการตั้งค่าระบบบัญชี", "auth_error")
        if not isinstance(value, dict):
            raise AuthError("ระบบบัญชีตอบกลับไม่ถูกต้อง", "auth_network", 503)
        return value

    def new_session(self, user, remote=None):
        ticket = secrets.token_urlsafe(32)
        with self.lock:
            now = time.time()
            for key in list(self.sessions):
                if self.sessions[key]["expires"] <= now:
                    del self.sessions[key]
            self.sessions[hashlib.sha256(ticket.encode()).hexdigest()] = {
                "user": user, "expires": now + SESSION_SECONDS,
                "remote": remote, "lock": threading.RLock()}
        return ticket

    def user(self, ticket, *, verify=False):
        if not isinstance(ticket, str) or not ticket:
            return None
        with self.lock:
            session = self.sessions.get(hashlib.sha256(ticket.encode()).hexdigest())
        if not session or session["expires"] <= time.time():
            return None
        if self.mode == "firebase" and verify:
            with session["lock"]:
                try:
                    data = session["remote"]
                    if data["expires_at"] <= time.time() + 30:
                        refreshed = self.firebase_call("refresh", data["refresh_token"])
                        data.update(self.firebase_call("token_data", refreshed))
                    value = self.firebase_call("lookup_user", data["access_token"])
                    self.check_firebase_user(value, data, session["user"]["id"])
                    session["user"] = self.firebase_user(value)
                except AuthError as exc:
                    if exc.status == 401:
                        with self.lock:
                            self.sessions.pop(hashlib.sha256(ticket.encode()).hexdigest(), None)
                    raise
        if self.mode == "supabase" and verify:
            with session["lock"]:
                data = session["remote"]
                if data["expires_at"] <= time.time() + 30:
                    refreshed = self.remote("POST", "token?grant_type=refresh_token", {"refresh_token": data["refresh_token"]})
                    data.update(self.token_data(refreshed))
                value = self.remote("GET", "user", access=data["access_token"])
                session["user"] = self.public_user(value)
        return session["user"]

    @staticmethod
    def token_data(value):
        if not value.get("access_token") or not value.get("refresh_token"):
            raise AuthError("ระบบบัญชีไม่มีข้อมูลเซสชัน กรุณาเข้าสู่ระบบอีกครั้ง", "auth_network", 503)
        return {"access_token": value["access_token"], "refresh_token": value["refresh_token"],
                "expires_at": time.time() + int(value.get("expires_in", 3600))}

    def require_user(self, ticket):
        user = self.user(ticket, verify=True)
        if not user:
            raise AuthError("กรุณาเข้าสู่ระบบก่อนใช้งาน", "unauthorized", 401)
        return user

    def handle(self, payload, ticket="", *, client="streamlit"):
        self.check_config()
        action = payload.get("action")
        if action == "auth.status":
            return {"user": self.user(ticket, verify=True)}, ticket
        if action == "auth.logout":
            with self.lock:
                session = self.sessions.pop(hashlib.sha256(ticket.encode()).hexdigest(), None)
            if session and self.mode == "supabase":
                try:
                    self.remote("POST", "logout?scope=local", access=session["remote"]["access_token"])
                except AuthError:
                    pass  # Local ticket has already been revoked.
            return {"user": None, "message": "ออกจากระบบแล้ว"}, ""
        if action not in ("auth.login", "auth.register"):
            raise AuthError("ไม่พบคำสั่งบัญชี", "invalid_request")
        registering = action == "auth.register"
        email, password, name = self.credentials(payload, registering)
        self.throttle(client, email)
        if self.mode == "firebase":
            value = self.firebase_call("register_user", email, password, name) if registering else self.firebase_call("login_user", email, password)
            remote = self.firebase_call("token_data", value)
            account = self.firebase_call("lookup_user", remote["access_token"])
            self.check_firebase_user(account, remote, value.get("localId"))
            user = self.firebase_user(account)
        elif self.mode == "supabase":
            value = self.remote("POST", "signup" if registering else "token?grant_type=password",
                                {"email": email, "password": password, **({"data": {"name": name}} if registering else {})})
            if registering and not value.get("access_token"):
                return {"user": None, "message": "ตรวจกล่องจดหมายเพื่อยืนยันอีเมล แล้วเข้าสู่ระบบด้วยบัญชีนี้ หากเคยสมัครแล้วให้ใช้หน้าเข้าสู่ระบบ"}, ticket
            remote = self.token_data(value)
            user = self.public_user(value["user"])
        else:
            remote = None
            with sqlite3.connect(self.db) as conn:
                conn.row_factory = sqlite3.Row
                if registering:
                    salt = secrets.token_hex(16)
                    try:
                        conn.execute("INSERT INTO accounts VALUES (?, ?, ?, ?, ?, ?)",
                                     (secrets.token_hex(16), email, name, salt, self.password_hash(password, salt), int(time.time())))
                    except sqlite3.IntegrityError:
                        raise AuthError("อีเมลนี้สมัครแล้ว กรุณาเข้าสู่ระบบด้วยบัญชีเดิม", "email_exists", 409) from None
                row = conn.execute("SELECT * FROM accounts WHERE email = ?", (email,)).fetchone()
                digest = self.password_hash(password, row["salt"] if row else "0" * 32)
                if not row or not hmac.compare_digest(digest, row["password_hash"]):
                    raise AuthError("อีเมลหรือรหัสผ่านไม่ถูกต้อง", "invalid_credentials", 401)
                user = {"id": row["id"], "email": row["email"], "name": row["name"]}
        # Rotate an existing session when signing in as a different account.
        with self.lock:
            self.sessions.pop(hashlib.sha256(ticket.encode()).hexdigest(), None)
        return {"user": user, "message": "สมัครสำเร็จ" if registering else "เข้าสู่ระบบแล้ว"}, self.new_session(user, remote)
