import os
import sys
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import config as app_config  # noqa: E402
from app.db import Base  # noqa: E402
from app import models  # noqa: E402,F401
from app import platform_models  # noqa: E402,F401

alembic_cfg = context.config
alembic_cfg.set_main_option("sqlalchemy.url", app_config.DATABASE_URL)

if alembic_cfg.config_file_name is not None:
    fileConfig(alembic_cfg.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline():
    context.configure(url=app_config.DATABASE_URL, target_metadata=target_metadata,
                      literal_binds=True, dialect_opts={"paramstyle": "named"})
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    section = alembic_cfg.get_section(alembic_cfg.config_ini_section, {})
    section["sqlalchemy.url"] = app_config.DATABASE_URL
    connectable = engine_from_config(section, prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
