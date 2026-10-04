"""Bound credential work before JSON parsing, database access and password hashing.

The admission cap is per worker; durable attempt counters remain in auth_limits.
No credentials or raw request bodies are retained after a request completes.
"""
import asyncio
import threading

from fastapi import HTTPException, Request
from starlette.responses import JSONResponse

from .ratelimit import _env_int, check_login_rate, check_rate_limit

AUTH_PATHS = frozenset({"/api/auth/login", "/api/auth/register", "/api/auth/password",
                        "/api/org/invitations/accept"})
MAX_AUTH_BODY = 16 * 1024


class AuthAdmissionMiddleware:
    def __init__(self, app):
        self.app = app
        self._active = 0
        self._lock = threading.Lock()

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "").rstrip("/")
        if scope["type"] != "http" or scope.get("method") != "POST" or path not in AUTH_PATHS:
            await self.app(scope, receive, send)
            return

        async def reject(status, code, message, retry=None):
            headers = {"Retry-After": str(retry)} if retry else {}
            await JSONResponse({"detail": {"code": code, "message": message}},
                               status_code=status, headers=headers)(scope, receive, send)

        lengths = [v for k, v in scope.get("headers", []) if k.lower() == b"content-length"]
        try:
            if len(lengths) > 1 or (lengths and int(lengths[0]) < 0):
                raise ValueError("Invalid length")
            if lengths and int(lengths[0]) > MAX_AUTH_BODY:
                await reject(413, "PAYLOAD_TOO_LARGE", "Credential request is too large")
                return
        except ValueError:
            await reject(400, "VALIDATION_ERROR", "Invalid request length")
            return

        # Avoid opening a database connection for repeated requests already denied locally.
        try:
            request = Request(scope)
            if path == "/api/auth/login":
                check_login_rate(request)
            else:
                check_rate_limit(request, "auth:" + path, "RATE_LIMIT_AUTH_MAX",
                                 "RATE_LIMIT_AUTH_WINDOW", 10, 60)
        except HTTPException:
            await reject(429, "RATE_LIMITED", "Too many attempts", 60)
            return

        with self._lock:
            admitted = self._active < min(_env_int("AUTH_MAX_CONCURRENT", 2), 16)
            if admitted:
                self._active += 1
        if not admitted:
            await reject(503, "AUTH_BUSY", "Authentication is busy; retry shortly", 5)
            return
        try:
            body = bytearray()

            async def read_bounded():
                while True:
                    event = await receive()
                    if event["type"] == "http.disconnect":
                        return False
                    chunk = event.get("body", b"")
                    if len(body) + len(chunk) > MAX_AUTH_BODY:
                        await reject(413, "PAYLOAD_TOO_LARGE", "Credential request is too large")
                        return False
                    body.extend(chunk)
                    if not event.get("more_body", False):
                        return True

            try:
                ready = await asyncio.wait_for(read_bounded(), timeout=10)
            except TimeoutError:
                await reject(408, "REQUEST_TIMEOUT", "Request body timed out")
                return
            if not ready:
                return
            delivered = False

            async def replay():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {"type": "http.request", "body": bytes(body), "more_body": False}
                return await receive()

            await self.app(scope, replay, send)
        finally:
            with self._lock:
                self._active -= 1
