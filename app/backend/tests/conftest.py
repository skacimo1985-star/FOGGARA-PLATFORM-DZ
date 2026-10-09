import os
import re
from pathlib import Path
from sqlalchemy.engine import make_url

# The autouse fixtures below DROP ALL TABLES. Validate target *before* loading
# app.db or importing anything that creates the SQLAlchemy engine.
if os.environ.get("ENV", "").strip().lower() == "prod":
    raise RuntimeError("Refusing destructive pytest fixtures when ENV=prod")

_test_database_url = (
    os.environ.get("TEST_DATABASE_URL")
    or os.environ.get("DATABASE_URL")
    or "postgresql+psycopg://postgres@/foggara_test?host=/tmp/pgdata"
)
parsed_url = make_url(_test_database_url)
engine_kind = parsed_url.get_backend_name()
if engine_kind == "postgresql":
    database = (parsed_url.database or "").strip()
    if not re.fullmatch(r"foggara_test(?:_[a-z0-9_]+)?", database):
        raise RuntimeError("Pytest is allowed only on dedicated foggara_test databases")
    if parsed_url.host not in (None, "localhost", "127.0.0.1"):
        raise RuntimeError("Refusing destructive pytest fixtures against nonlocal PostgreSQL hosts")
elif engine_kind == "sqlite":
    database = parsed_url.database or ""
    if database not in ("", ":memory:") and not re.fullmatch(
        r"(?:foggara_test|test_foggara)(?:_[a-z0-9_-]+)?\.(?:db|sqlite|sqlite3)",
        Path(database).name,
    ):
        raise RuntimeError("Refusing destructive pytest fixtures against non-test SQLite files")
else:
    raise RuntimeError(f"Unsupported pytest database engine: {engine_kind}")

# Never allow the application to inherit the operator's production DB URL.
os.environ["DATABASE_URL"] = _test_database_url

os.environ["JWT_SECRET"] = "test-secret-0123456789abcdef0123456789"

import pytest
from fastapi.testclient import TestClient

from app.db import Base, engine, SessionLocal
from app.main import app
from app.models import Organization, User
from app.security import hash_password
from app.services.indicators import ensure_default_indicator


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture(autouse=True)
def _reset_rate_limiter():
    """عزل الاختبارات: عدّادات تحديد المعدل تُصفَّر قبل كل اختبار."""
    from app.ratelimit import limiter
    limiter.reset()
    from app.platform_models import AuthThrottle
    with engine.begin() as connection:
        connection.execute(AuthThrottle.__table__.delete())
    yield


@pytest.fixture()
def db():
    s = SessionLocal()
    try:
        for table in reversed(Base.metadata.sorted_tables):
            s.execute(table.delete())
        s.commit()
        yield s
    finally:
        s.close()


@pytest.fixture()
def world(db):
    org1 = Organization(code="T-ORG1", name_ar="م1", name_fr="O1", name_en="O1", is_demo=True)
    org2 = Organization(code="T-ORG2", name_ar="م2", name_fr="O2", name_en="O2", is_demo=True)
    db.add_all([org1, org2])
    db.flush()
    users = {}
    for org, prefix in ((org1, "o1"), (org2, "o2")):
        users[f"{prefix}_member"] = User(org_id=org.id, email=f"{prefix}m@t.dz",
                                         password_hash=hash_password("pass#1"),
                                         full_name=f"{prefix} member", role="member")
        users[f"{prefix}_reviewer"] = User(org_id=org.id, email=f"{prefix}r@t.dz",
                                           password_hash=hash_password("pass#1"),
                                           full_name=f"{prefix} reviewer", role="reviewer")
    db.add_all(users.values())
    db.flush()
    ensure_default_indicator(db)
    db.commit()
    return {"org1": org1, "org2": org2, **users}


@pytest.fixture()
def client():
    return TestClient(app)


def login(client, email):
    r = client.post("/api/auth/login", json={"email": email, "password": "pass#1"})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}
