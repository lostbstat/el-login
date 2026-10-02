"""Firebase email/password REST client; credentials and tokens stay in Python."""
from __future__ import annotations

import base64
import json
import os
import shlex
import time
from pathlib import Path

import requests

BASE_URL = "https://identitytoolkit.googleapis.com/v1/accounts"
REFRESH_URL = "https://securetoken.googleapis.com/v1/token"
ERROR_MESSAGES = {
    "EMAIL_EXISTS": ("อีเมลนี้สมัครแล้ว กรุณาเข้าสู่ระบบด้วยบัญชีเดิม", "email_exists", 409),
    "OPERATION_NOT_ALLOWED": ("Firebase ยังไม่ได้เปิด Email/Password ใน Authentication → Sign-in method", "auth_not_configured", 503),
    "TOO_MANY_ATTEMPTS_TRY_LATER": ("ลองหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่", "rate_limited", 429),
    "EMAIL_NOT_FOUND": ("อีเมลหรือรหัสผ่านไม่ถูกต้อง", "invalid_credentials", 401),
    "INVALID_PASSWORD": ("อีเมลหรือรหัสผ่านไม่ถูกต้อง", "invalid_credentials", 401),
    "INVALID_LOGIN_CREDENTIALS": ("อีเมลหรือรหัสผ่านไม่ถูกต้อง", "invalid_credentials", 401),
    "USER_DISABLED": ("บัญชีนี้ถูกระงับการใช้งาน", "unauthorized", 401),
    "USER_NOT_FOUND": ("ไม่พบบัญชีนี้ กรุณาเข้าสู่ระบบใหม่", "unauthorized", 401),
    "INVALID_ID_TOKEN": ("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่", "unauthorized", 401),
    "TOKEN_EXPIRED": ("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่", "unauthorized", 401),
    "INVALID_REFRESH_TOKEN": ("เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่", "unauthorized", 401),
    "WEAK_PASSWORD": ("รหัสผ่านไม่ผ่านข้อกำหนดของ Firebase กรุณาใช้รหัสผ่านที่ยาวและซับซ้อนขึ้น", "weak_password", 400),
    "PASSWORD_DOES_NOT_MEET_REQUIREMENTS": ("รหัสผ่านไม่ผ่านข้อกำหนดของ Firebase", "weak_password", 400),
    "INVALID_EMAIL": ("รูปแบบอีเมลไม่ถูกต้อง", "invalid_email", 400),
    "API_KEY_INVALID": ("FIREBASE_API_KEY ไม่ถูกต้อง กรุณาใช้ Web API Key ของโปรเจกต์ Firebase", "auth_not_configured", 503),
    "PROJECT_NUMBER_MISMATCH": ("คีย์ Firebase ไม่ตรงกับโปรเจกต์ของบัญชี กรุณาตรวจ Secrets", "auth_not_configured", 503),
}


class FirebaseAuthError(RuntimeError):
    def __init__(self, message, code="auth_network", status=503):
        super().__init__(message)
        self.code, self.status = code, status


def get_secret(name):
    """Compatibility helper for the original register_user/login_user functions."""
    try:
        import streamlit as st
        value = st.secrets.get(name)
        if value:
            return str(value).strip()
    except (ImportError, FileNotFoundError, KeyError):
        pass
    if os.getenv(name):
        return os.getenv(name).strip()
    path = Path(__file__).resolve().parent / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            key, separator, value = line.strip().removeprefix("export ").partition("=")
            if separator and key.strip() == name:
                try:
                    return " ".join(shlex.split(value, comments=True))
                except ValueError:
                    raise FirebaseAuthError("เครื่องหมายคำพูดใน .env ไม่ครบ", "auth_not_configured") from None
    return ""


class FirebaseAuth:
    def __init__(self, api_key, *, request=None):
        self.api_key = str(api_key or "").strip()
        self.http = request or requests.request

    def _post(self, action, payload, *, refresh=False):
        if not self.api_key:
            raise FirebaseAuthError("กรุณาตั้งค่า FIREBASE_API_KEY ใน Secrets", "auth_not_configured")
        url = REFRESH_URL if refresh else BASE_URL + ":" + action
        options = {"data" if refresh else "json": payload}
        try:
            response = self.http("POST", url, params={"key": self.api_key}, timeout=(10, 30), **options)
            data = response.json()
        except (requests.RequestException, ValueError):
            raise FirebaseAuthError("เชื่อมต่อ Firebase ไม่สำเร็จ กรุณาลองใหม่") from None
        if not isinstance(data, dict):
            raise FirebaseAuthError("Firebase ตอบกลับไม่ถูกต้อง กรุณาลองใหม่")
        if not response.ok:
            error = data.get("error") or {}
            message = str(error.get("message", "")) if isinstance(error, dict) else ""
            code = message.split(" : ", 1)[0]
            if message.startswith("API key not valid"):
                code = "API_KEY_INVALID"
            if response.status_code == 429:
                code = "TOO_MANY_ATTEMPTS_TRY_LATER"
            if response.status_code == 403 and code not in ERROR_MESSAGES:
                raise FirebaseAuthError("Firebase ปฏิเสธคีย์นี้ กรุณาตรวจ Web API Key และข้อจำกัดการใช้งานคีย์", "auth_not_configured")
            details = ERROR_MESSAGES.get(code, ("ระบบบัญชี Firebase เกิดข้อผิดพลาด กรุณาลองใหม่", "auth_error", 400))
            raise FirebaseAuthError(*details)
        return data

    def register_user(self, email, password, name=""):
        return self._post("signUp", {"email": email.strip(), "password": password,
                                     "displayName": name, "returnSecureToken": True})

    def login_user(self, email, password):
        return self._post("signInWithPassword", {"email": email.strip(), "password": password, "returnSecureToken": True})

    def refresh(self, refresh_token):
        return self._post("", {"grant_type": "refresh_token", "refresh_token": refresh_token}, refresh=True)

    def lookup_user(self, id_token):
        data = self._post("lookup", {"idToken": id_token})
        users = data.get("users")
        if not isinstance(users, list) or len(users) != 1 or not isinstance(users[0], dict) or not users[0].get("localId"):
            raise FirebaseAuthError("เซสชันใช้ไม่ได้ กรุณาเข้าสู่ระบบใหม่", "unauthorized", 401)
        if users[0].get("disabled"):
            raise FirebaseAuthError("บัญชีนี้ถูกระงับการใช้งาน", "unauthorized", 401)
        return users[0]

    @staticmethod
    def token_data(value):
        token = value.get("idToken") or value.get("id_token")
        refresh = value.get("refreshToken") or value.get("refresh_token")
        try:
            if not isinstance(token, str) or not isinstance(refresh, str) or not token or not refresh:
                raise ValueError()
            part = token.split(".")[1]
            claims = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))
            auth_time = int(claims["auth_time"])
            lifetime = int(value.get("expiresIn", value.get("expires_in", 3600)))
            if lifetime <= 0 or auth_time <= 0:
                raise ValueError()
        except (ValueError, TypeError, KeyError, IndexError, AttributeError):
            raise FirebaseAuthError("Firebase ไม่ได้ส่งข้อมูลเซสชันที่ถูกต้อง กรุณาเข้าสู่ระบบใหม่") from None
        # These tokens come only from Firebase HTTPS responses. lookup verifies them
        # remotely before protected requests; decoding here is not signature verification.
        return {"access_token": token, "refresh_token": refresh,
                "expires_at": time.time() + lifetime, "auth_time": auth_time}


def register_user(email, password, name=""):
    return FirebaseAuth(get_secret("FIREBASE_API_KEY")).register_user(email, password, name)


def login_user(email, password):
    return FirebaseAuth(get_secret("FIREBASE_API_KEY")).login_user(email, password)
