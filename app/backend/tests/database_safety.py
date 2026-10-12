"""Validate disposable test targets before importing the application or connecting."""
import re
import tempfile
from pathlib import Path

from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


def validate_test_database_url(value: str) -> str:
    value = value.strip()
    if not value:
        raise RuntimeError("TEST_DATABASE_URL must explicitly identify a disposable database")
    try:
        url = make_url(value)
    except (ArgumentError, ValueError):
        raise RuntimeError("Invalid TEST_DATABASE_URL") from None
    # libpq host/hostaddr/service parameters can override the visible hostname.
    # SQLite URI parameters can change the target or attach an existing file.
    if url.query:
        raise RuntimeError("Test database URL query parameters are not permitted")
    database = url.database or ""
    if url.drivername in {"sqlite", "sqlite+pysqlite"}:
        if url.host or url.username or url.password:
            raise RuntimeError("SQLite test URLs cannot include connection authority")
        path = Path(database)
        if not path.is_absolute() or not re.fullmatch(r"[A-Za-z0-9_-]+_test\.(db|sqlite)", path.name):
            raise RuntimeError("SQLite tests require an absolute temporary *_test.db or *_test.sqlite path")
        temporary_root = Path(tempfile.gettempdir()).resolve()
        if not path.resolve().is_relative_to(temporary_root):
            raise RuntimeError("SQLite test database must be inside the system temporary directory")
        if path.exists() or path.is_symlink():
            raise RuntimeError("SQLite test database already exists; refusing destructive reuse")
    elif url.drivername in {"postgresql", "postgresql+psycopg"}:
        if url.host not in {"localhost", "127.0.0.1", "::1"}:
            raise RuntimeError("Destructive PostgreSQL tests require an explicit loopback host")
        if not re.fullmatch(r"(?:test_[a-z0-9_]+|[a-z0-9_]+_test(?:_[a-z0-9_]+)?)", database):
            raise RuntimeError("PostgreSQL tests require a dedicated test_ or _test database name")
    else:
        raise RuntimeError("Unsupported TEST_DATABASE_URL driver")
    return value
