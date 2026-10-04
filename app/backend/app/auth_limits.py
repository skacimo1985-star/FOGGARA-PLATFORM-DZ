"""Atomic database-backed throttling; no raw IP addresses or credentials persist."""
import hashlib
import hmac
import time
import threading
from fastapi import HTTPException, Request
from sqlalchemy import case, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import SQLAlchemyError
from . import config
from .db import engine
from .platform_models import AuthThrottle

_cleanup_lock = threading.Lock()
_last_cleanup = 0.0


def limit_auth(request: Request):
    global _last_cleanup
    now = int(time.time())
    from .ratelimit import _client_key
    client = _client_key(request)
    route = request.url.path
    key = hmac.new(config.JWT_SECRET.encode(), (client + ":" + route).encode(), hashlib.sha256).hexdigest()
    limit = 5 if route == "/api/auth/register" else 30
    insert = pg_insert if engine.dialect.name == "postgresql" else sqlite_insert
    table = AuthThrottle.__table__
    fresh = table.c.window_start <= now - 900
    statement = insert(table).values(key=key, window_start=now, hits=1).on_conflict_do_update(
        index_elements=[table.c.key], set_={"hits": case((fresh, 1), else_=table.c.hits + 1),
                                            "window_start": case((fresh, now), else_=table.c.window_start)}).returning(table.c.hits, table.c.window_start)
    with _cleanup_lock:
        due = time.monotonic() - _last_cleanup >= 60
        if due:
            _last_cleanup = time.monotonic()
    try:
        with engine.begin() as conn:
            if due:
                conn.execute(delete(table).where(table.c.window_start < now - 86400))
            hits, window_start = conn.execute(statement).one()
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail={"code": "AUTH_BUSY", "message": "Authentication is temporarily unavailable"}, headers={"Retry-After": "5"}) from None
    if hits > limit:
        raise HTTPException(status_code=429, detail={"code": "RATE_LIMITED", "message": "Too many attempts; wait before retrying"}, headers={"Retry-After": str(max(1, 900 - (now - window_start)))})
