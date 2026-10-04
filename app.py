"""Gemini REST adapter. Credentials stay in the Python process."""
from __future__ import annotations

import base64
import binascii
from urllib.parse import quote

import requests

DEFAULT_MODEL = "gemini-3.5-flash-lite"
MAX_IMAGES = 4
MAX_IMAGE_BYTES = 3 * 1024 * 1024
IMAGE_TYPES = ("image/png", "image/jpeg", "image/webp", "image/heic", "image/heif")
PUBLIC_ASSETS = ("index.html", "script.js", "style.css", "login.html", "login.js", "bridge.js", "butterflies.js", "weather.js")


class GeminiError(Exception):
    def __init__(self, message: str, code: str = "api_error"):
        super().__init__(message)
        self.code = code


def public_config(api_key: str) -> dict:
    return {
        "configured": bool(api_key),
        "images": {"maxCount": MAX_IMAGES, "maxBytes": MAX_IMAGE_BYTES, "mimeTypes": list(IMAGE_TYPES)},
    }


def build_request(payload: dict) -> dict:
    if not isinstance(payload, dict):
        raise GeminiError("รูปแบบคำขอไม่ถูกต้อง", "invalid_request")
    messages = payload.get("messages")
    prompt = payload.get("prompt")
    if messages is not None:
        if not isinstance(messages, list) or not 1 <= len(messages) <= 16:
            raise GeminiError("รูปแบบประวัติสนทนาไม่ถูกต้อง", "invalid_request")
        contents = []
        for message in messages:
            if (not isinstance(message, dict) or message.get("role") not in ("user", "assistant")
                    or not isinstance(message.get("content"), str) or not message["content"].strip()):
                raise GeminiError("รูปแบบประวัติสนทนาไม่ถูกต้อง", "invalid_request")
            contents.append({"role": "model" if message["role"] == "assistant" else "user", "parts": [{"text": message["content"]}]})
    else:
        if not isinstance(prompt, str) or not prompt.strip():
            raise GeminiError("กรุณาระบุคำถาม", "invalid_request")
        contents = [{"role": "user", "parts": [{"text": prompt}]}]
    if sum(len(part["text"]) for content in contents for part in content["parts"]) > 160_000:
        raise GeminiError("ข้อความยาวเกินไป กรุณาย่อข้อมูลแล้วลองใหม่", "invalid_request")
    images = payload.get("images", [])
    if not isinstance(images, list) or len(images) > MAX_IMAGES:
        raise GeminiError(f"ส่งรูปได้ครั้งละไม่เกิน {MAX_IMAGES} รูป", "image_rejected")
    for image in images:
        if (not isinstance(image, dict) or image.get("mimeType") not in IMAGE_TYPES
                or not isinstance(image.get("data"), str) or not image["data"]
                or len(image["data"]) > 4 * ((MAX_IMAGE_BYTES + 2) // 3)):
            raise GeminiError("รูปต้องเป็น PNG, JPEG, WebP, HEIC หรือ HEIF และขนาดไม่เกิน 3 MB", "image_rejected")
        try:
            raw = base64.b64decode(image["data"], validate=True)
        except (ValueError, binascii.Error):
            raise GeminiError("ข้อมูลรูปไม่ถูกต้อง กรุณาเลือกรูปใหม่", "image_rejected") from None
        if not raw or len(raw) > MAX_IMAGE_BYTES:
            raise GeminiError("รูปต้องมีขนาดไม่เกิน 3 MB", "image_rejected")
        contents[-1]["parts"].append({"inlineData": {"mimeType": image["mimeType"], "data": image["data"]}})
    generation = {"maxOutputTokens": 8192}
    if payload.get("json"):
        generation["responseMimeType"] = "application/json"
    return {"contents": contents, "generationConfig": generation}


def generate(payload: dict, *, api_key: str, model: str = DEFAULT_MODEL, post=None) -> str:
    if not api_key:
        raise GeminiError("กรุณาใส่ GEMINI_API_KEY ใน .env หรือ Secrets ของ Streamlit", "not_configured")
    body = build_request(payload)
    model = model.removeprefix("models/")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{quote(model, safe='')}:generateContent"
    try:
        response = (post or requests.post)(url, headers={"Content-Type": "application/json", "x-goog-api-key": api_key}, json=body, timeout=(10, 90))
        result = response.json()
    except requests.Timeout:
        raise GeminiError("Gemini ใช้เวลานานเกินไป กรุณาลองใหม่", "timeout") from None
    except (requests.RequestException, ValueError):
        raise GeminiError("เชื่อมต่อ Gemini ไม่สำเร็จ กรุณาลองใหม่", "network_error") from None
    if not isinstance(result, dict):
        raise GeminiError("Gemini ตอบกลับในรูปแบบที่อ่านไม่ได้", "invalid_response")
    if not response.ok:
        error = result.get("error", {})
        details = str(error.get("message", "Gemini API error") if isinstance(error, dict) else error).replace(api_key, "[hidden]")
        if response.status_code == 429:
            raise GeminiError(f"Gemini ใช้งานเกินโควตา กรุณาลองใหม่ภายหลัง: {details}", "rate_limited")
        if response.status_code == 404:
            raise GeminiError(f"ไม่พบโมเดล กรุณาตรวจ GEMINI_MODEL ใน Secrets: {details}", "model_not_found")
        raise GeminiError(f"Gemini ไม่สามารถตอบได้ กรุณาตรวจ API key และสิทธิ์โมเดล: {details}")
    candidates = result.get("candidates") or []
    if not candidates or not isinstance(candidates[0], dict):
        raise GeminiError("Gemini ไม่มีข้อความตอบกลับ กรุณาลองใหม่", "invalid_response")
    candidate = candidates[0]
    parts = (candidate.get("content") or {}).get("parts", [])
    text = "".join(part.get("text", "") for part in parts if isinstance(part, dict) and not part.get("thought") and isinstance(part.get("text", ""), str))
    if not text or candidate.get("finishReason") == "MAX_TOKENS":
        raise GeminiError("Gemini ตอบไม่ครบ กรุณาลองใหม่", "invalid_response")
    return text




import hashlib
import json
import os
import re
import shlex
import secrets
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit
from http.cookies import SimpleCookie

from auth import AuthError, AuthService, SESSION_SECONDS


def run_streamlit():
    import streamlit as st
    import streamlit.components.v1 as components
    st.set_page_config(page_title="Electricity AI Assistant", page_icon="⚡", layout="wide", initial_sidebar_state="collapsed")


    def setting(name, default=""):
        """Cloud Secrets or environment variables; never pass secrets to the component."""
        try:
            value = st.secrets.get(name, os.environ.get(name, default))
        except (FileNotFoundError, KeyError):
            value = os.environ.get(name, default)
        return str(value).strip()


    api_key = setting("GEMINI_API_KEY")
    model = setting("GEMINI_MODEL", DEFAULT_MODEL) or DEFAULT_MODEL
    @st.cache_resource
    def account_service(firebase_key, url, key):
        return AuthService(Path(__file__).resolve().parent,
                           {"FIREBASE_API_KEY": firebase_key, "SUPABASE_URL": url, "SUPABASE_PUBLISHABLE_KEY": key}, cloud=True)

    auth = account_service(setting("FIREBASE_API_KEY"), setting("SUPABASE_URL"), setting("SUPABASE_PUBLISHABLE_KEY") or setting("SUPABASE_ANON_KEY"))
    if "auth_ticket" not in st.session_state:
        st.session_state.auth_ticket = ""
        st.session_state.auth_client = secrets.token_urlsafe(16)
    if not st.session_state.auth_ticket:
        # F5 creates a new Streamlit connection. Its browser cookie can restore
        # a verified session before the frontend renders the login screen.
        try:
            stored = json.loads(unquote(st.context.cookies.get("electricity_remembered_session", "null")))
            ticket = stored.get("ticket", "") if isinstance(stored, dict) else ""
            if isinstance(ticket, str) and 0 < len(ticket) <= 256:
                auth.require_user(ticket)
                st.session_state.auth_ticket = ticket
        except (AttributeError, KeyError, ValueError, TypeError, AuthError):
            pass  # The component can still restore from its own storage.
    @st.cache_resource
    def public_assets(*texts):
        # Only these public assets are served by the component.
        # app.py and the Secrets files remain outside the public directory.
        directory = Path(tempfile.mkdtemp(prefix="electricity-component-"))
        digest = hashlib.sha256("".join(texts).encode()).hexdigest()[:12]
        for name, text in zip(PUBLIC_ASSETS, texts):
            if name.endswith(".html"):
                text = re.sub(r'(src|href)="(script\.js|login\.js|bridge\.js|butterflies\.js|style\.css)(?:\?[^"]*)?"',
                              lambda match: f'{match[1]}="{match[2]}?v={digest}"', text)
            (directory / name).write_text(text, encoding="utf-8")
        return str(directory)


    source = Path(__file__).resolve().parent
    try:
        assets = public_assets(*((source / name).read_text(encoding="utf-8") for name in PUBLIC_ASSETS))
    except OSError:
        st.error("กรุณาวาง index.html, login.html, script.js, login.js, bridge.js, butterflies.js และ style.css ไว้ข้าง app.py")
        st.stop()
    frontend = components.declare_component("electricity_frontend", path=assets)

    if "gemini_response" not in st.session_state:
        st.session_state.gemini_response = None
        st.session_state.gemini_last_request = None

    account_config = auth.config(st.session_state.auth_ticket)
    account_config["rememberedSession"] = auth.remembered_session(st.session_state.auth_ticket)
    account_config["sessionPersistenceVersion"] = 2
    request = frontend(
        config={**public_config(api_key), "auth": account_config},
        response=st.session_state.gemini_response,
        key="electricity-ui",
        default=None,
    )

    if isinstance(request, dict):
        request_id = request.get("id")
        if isinstance(request_id, str) and 0 < len(request_id) <= 100 and request_id != st.session_state.gemini_last_request:
            # Mark before calling Gemini: Streamlit reruns must not bill for the same request twice.
            st.session_state.gemini_last_request = request_id
            try:
                payload = request.get("payload")
                if not isinstance(payload, dict):
                    raise AuthError("รูปแบบคำขอไม่ถูกต้อง", "invalid_request")
                action = str(payload.get("action", ""))
                candidate = payload.get("_session", "")
                candidate = candidate if isinstance(candidate, str) and len(candidate) <= 256 else ""
                if action.startswith("auth."):
                    # A browser ticket is checked by AuthService before restoring a new WebSocket session.
                    ticket = (candidate or st.session_state.auth_ticket) if action == "auth.status" else (st.session_state.auth_ticket or candidate)
                    result, ticket = auth.handle(payload, ticket, client=st.session_state.auth_client)
                    st.session_state.auth_ticket = ticket
                    result["rememberedSession"] = auth.remembered_session(ticket)
                else:
                    ticket = st.session_state.auth_ticket or candidate
                    auth.require_user(ticket)
                    st.session_state.auth_ticket = ticket
                    result = {"text": generate(payload, api_key=api_key, model=model)}
                answer = {"id": request_id, "ok": True, "result": result}
            except AuthError as exc:
                answer = {"id": request_id, "ok": False, "error": str(exc), "code": exc.code}
            except GeminiError as exc:
                answer = {"id": request_id, "ok": False, "error": str(exc), "code": exc.code}
            except Exception:
                answer = {"id": request_id, "ok": False, "error": "เกิดข้อผิดพลาด กรุณาลองใหม่", "code": "api_error"}
            st.session_state.gemini_response = answer
            st.rerun()



def local_settings(directory):
    values = {}
    env_file = directory / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8-sig").splitlines():
            key, separator, value = line.strip().removeprefix("export ").partition("=")
            if separator and key.strip() in ("GEMINI_API_KEY", "GEMINI_MODEL", "PORT", "FIREBASE_API_KEY", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"):
                try:
                    values[key.strip()] = " ".join(shlex.split(value, comments=True))
                except ValueError:
                    raise RuntimeError("ไฟล์ .env มีเครื่องหมายคำพูดไม่ครบ กรุณาตรวจสอบ") from None
    secrets_file = directory / ".streamlit" / "secrets.toml"
    if secrets_file.exists():
        try:
            import tomllib
            values.update(tomllib.loads(secrets_file.read_text(encoding="utf-8")))
        except ImportError:
            pass
    for name in ("GEMINI_API_KEY", "GEMINI_MODEL", "PORT", "FIREBASE_API_KEY", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"):
        if name in os.environ:
            values[name] = os.environ[name]
    return values


def create_server(directory, port=3000, settings=None):
    directory = Path(directory)
    settings = settings if settings is not None else local_settings(directory)
    api_key = str(settings.get("GEMINI_API_KEY", "")).strip()
    model = str(settings.get("GEMINI_MODEL", DEFAULT_MODEL)).strip() or DEFAULT_MODEL
    auth = AuthService(directory, settings)
    public_files = {"/": ("index.html", "text/html; charset=utf-8"), **{
        "/" + name: (name, ("text/html" if name.endswith(".html") else "text/css" if name.endswith(".css") else "application/json" if name.endswith(".json") else "application/javascript") + "; charset=utf-8")
        for name in PUBLIC_ASSETS}}

    class Handler(BaseHTTPRequestHandler):
        def ticket(self):
            cookie = SimpleCookie()
            try:
                cookie.load(self.headers.get("Cookie", ""))
                return cookie["electricity_session"].value if "electricity_session" in cookie else ""
            except Exception:
                return ""

        def reply(self, status, value, ticket=None):
            body = json.dumps(value, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            if ticket is not None:
                self.send_header("Set-Cookie", f"electricity_session={ticket}; HttpOnly; SameSite=Strict; Path=/; Max-Age={SESSION_SECONDS if ticket else 0}")
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_GET(self):
            route = urlsplit(self.path).path
            if route == "/api/config":
                return self.reply(200, {**public_config(api_key), "runtime": "python", "auth": auth.config(self.ticket())})
            if route not in public_files:
                return self.reply(404, {"error": "Not found"})
            filename, content_type = public_files[route]
            try:
                body = (directory / filename).read_bytes()
            except OSError:
                return self.reply(404, {"error": f"ไม่พบ {filename} กรุณาวางไฟล์ข้าง app.py"})
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_POST(self):
            if urlsplit(self.path).path != "/api/ai":
                return self.reply(404, {"error": "Not found"})
            origin = self.headers.get("Origin")
            if origin and origin != "http://" + self.headers.get("Host", ""):
                return self.reply(403, {"error": "แหล่งคำขอไม่ถูกต้อง"})
            if not self.headers.get("Content-Type", "").startswith("application/json"):
                return self.reply(415, {"error": "กรุณาส่งข้อมูลแบบ JSON"})
            try:
                size = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                return self.reply(400, {"error": "ขนาดคำขอไม่ถูกต้อง"})
            if not 0 < size <= 20 * 1024 * 1024:
                return self.reply(413, {"error": "คำขอใหญ่เกินไป กรุณาลดขนาดรูป"})
            try:
                payload = json.loads(self.rfile.read(size))
            except (ValueError, UnicodeDecodeError):
                return self.reply(400, {"error": "ข้อมูล JSON ไม่ถูกต้อง"})
            try:
                if not isinstance(payload, dict):
                    raise AuthError("รูปแบบคำขอไม่ถูกต้อง", "invalid_request")
                ticket = self.ticket()
                if str(payload.get("action", "")).startswith("auth."):
                    result, new_ticket = auth.handle(payload, ticket, client=self.client_address[0])
                    self.reply(200, result, new_ticket)
                else:
                    auth.require_user(ticket)
                    self.reply(200, {"text": generate(payload, api_key=api_key, model=model)})
            except AuthError as exc:
                self.reply(exc.status, {"error": str(exc), "code": exc.code})
            except GeminiError as exc:
                status = 429 if exc.code == "rate_limited" else 400 if exc.code in ("invalid_request", "image_rejected") else 503 if exc.code == "not_configured" else 502
                self.reply(status, {"error": str(exc), "code": exc.code})
            except Exception:
                self.reply(500, {"error": "เกิดข้อผิดพลาด กรุณาลองใหม่"})

        def log_message(self, format, *args):
            pass

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def run_python():
    directory = Path(__file__).resolve().parent
    settings = local_settings(directory)
    port = int(settings.get("PORT", 3000))
    with create_server(directory, port, settings) as server:
        print(f"เปิดที่ http://localhost:{server.server_address[1]}", flush=True)
        print("หยุดเซิร์ฟเวอร์ด้วย Ctrl+C", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


def is_streamlit():
    try:
        from streamlit.runtime.scriptrunner_utils.script_run_context import get_script_run_ctx
    except ImportError:
        return False
    return get_script_run_ctx(suppress_warning=True) is not None


if is_streamlit():
    run_streamlit()
elif __name__ == "__main__":
    run_python()
