"""Prepare an isolated schema for the pilot; never logs credentials.
Run only with the deployment database owner, before Alembic.
"""
from sqlalchemy import text
from . import config
from .db import engine

def prepare():
    if engine.dialect.name != 'postgresql' or config.DATABASE_SCHEMA == 'public':
        return
    schema = config.DATABASE_SCHEMA  # Validated identifier in config.
    with engine.begin() as conn:
        conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        conn.execute(text(f'REVOKE ALL ON SCHEMA "{schema}" FROM PUBLIC'))
        # Supabase API roles are absent on ordinary PostgreSQL installations.
        for role in ('anon', 'authenticated'):
            if conn.scalar(text('SELECT 1 FROM pg_roles WHERE rolname = :role'), {'role': role}):
                conn.execute(text(f'REVOKE ALL ON SCHEMA "{schema}" FROM "{role}"'))
    print('Application schema prepared.')

if __name__ == '__main__':
    prepare()
