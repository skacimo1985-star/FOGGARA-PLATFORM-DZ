import os
from pathlib import Path
from urllib.parse import urlsplit, unquote
from sqlalchemy.engine import make_url

# Tests may destroy tables. Never inherit the application's DATABASE_URL.
_test_url = os.environ.get("TEST_DATABASE_URL", "").strip()
if not _test_url:
    raise RuntimeError(
        "TEST_DATABASE_URL must point to an isolated disposable test database; "
        "refusing to run destructive tests against DATABASE_URL."
    )

_parsed = urlsplit(_test_url.replace("postgresql+psycopg://", "postgresql://", 1))
_db_name = unquote(_parsed.path.rsplit("/", 1)[-1] or "").lower()
if _parsed.scheme.startswith("sqlite"):
    # In-memory SQLite is not reliable for a multi-connection test suite.
    # Require a named, disposable file rather than accepting an empty path.
    if _db_name in ("", ":memory:") or not (
        _db_name.endswith("_test.db") or _db_name.endswith("_test.sqlite")
    ):
        raise RuntimeError("SQLite tests require a disposable *_test.db or *_test.sqlite file")
    _sqlite_path = Path(make_url(_test_url).database)
    if _sqlite_path.exists():
        raise RuntimeError("SQLite test database already exists; refusing destructive reuse")
elif _parsed.scheme.startswith("postgresql"):
    if not (_db_name.endswith("_test") or _db_name.startswith("test_")):
        raise RuntimeError("PostgreSQL test database name must start with test_ or end with _test")
    if _parsed.hostname not in ("localhost", "127.0.0.1", "::1") and os.environ.get("ALLOW_DESTRUCTIVE_POSTGRES_TESTS") != "yes":
        raise RuntimeError("Set ALLOW_DESTRUCTIVE_POSTGRES_TESTS=yes for an explicitly disposable PostgreSQL database")
else:
    raise RuntimeError("Unsupported TEST_DATABASE_URL scheme")

os.environ["DATABASE_URL"] = _test_url
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
