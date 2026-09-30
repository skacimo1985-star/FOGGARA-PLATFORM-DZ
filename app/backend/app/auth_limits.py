"""Atomic database-backed throttling; no raw IP addresses or credentials persist."""
import hashlib
import hmac
import time
from fastapi import HTTPException, Request
from sqlalchemy import case, delete
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from . import config
from .db import engine
from .platform_models import AuthThrottle


def limit_auth(request: Request):
    now = int(time.time())
    client = request.client.host if request.client else "unknown"
    route = request.url.path
    key = hmac.new(config.JWT_SECRET.encode(), (client + ":" + route).encode(), hashlib.sha256).hexdigest()
    limit = 5 if route == "/api/auth/register" else 30
    insert = pg_insert if engine.dialect.name == "postgresql" else sqlite_insert
    table = AuthThrottle.__table__
    fresh = table.c.window_start < now - 900
    statement = insert(table).values(key=key, window_start=now, hits=1).on_conflict_do_update(
        index_elements=[table.c.key], set_={"hits": case((fresh, 1), else_=table.c.hits + 1),
                                            "window_start": case((fresh, now), else_=table.c.window_start)}).returning(table.c.hits)
    with engine.begin() as conn:
        conn.execute(delete(table).where(table.c.window_start < now - 86400))
        hits = conn.execute(statement).scalar_one()
    if hits > limit:
        raise HTTPException(status_code=429, detail={"code": "RATE_LIMITED", "message": "Too many attempts; wait fifteen minutes"}, headers={"Retry-After": "900"})
