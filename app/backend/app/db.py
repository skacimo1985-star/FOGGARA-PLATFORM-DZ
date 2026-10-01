from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from . import config

# SQLite يحتاج check_same_thread=False مع خيوط FastAPI؛ PostgreSQL لا يأخذ وسائط إضافية
_connect_args = (
    {"check_same_thread": False} if config.DATABASE_URL.startswith("sqlite")
    else {"options": f"-csearch_path={config.DATABASE_SCHEMA}", "connect_timeout": 15}
)
engine = create_engine(config.DATABASE_URL, pool_pre_ping=True, connect_args=_connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

