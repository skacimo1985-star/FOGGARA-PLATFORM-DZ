import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from . import config

# SQLite يحتاج check_same_thread=False مع خيوط FastAPI.
# PostgreSQL (Session Pooler): مهلة استعلام تحمي من استعلامات جامحة،
# وتجمع اتصالات محافظ مناسب لحدود الخطة المجانية، مع تدوير دوري.
_IS_SQLITE = config.DATABASE_URL.startswith("sqlite")
_connect_args = {"check_same_thread": False} if _IS_SQLITE else {}
_pool_kwargs: dict = {}
if not _IS_SQLITE:
    _timeout_ms = int(os.environ.get("DB_STATEMENT_TIMEOUT_MS", "30000"))
    _connect_args = {"options": f"-c statement_timeout={_timeout_ms}"}
    _pool_kwargs = {
        "pool_size": 5,
        "max_overflow": 5,
        "pool_recycle": 1800,
        "pool_timeout": 30,
    }

engine = create_engine(
    config.DATABASE_URL,
    pool_pre_ping=True,
    connect_args=_connect_args,
    **_pool_kwargs,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
