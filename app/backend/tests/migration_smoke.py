"""Migration paths and SQL grants on disposable GitHub Actions PostgreSQL."""
import os
import subprocess
import sys
import psycopg
from psycopg import sql
def main():
    if os.environ.get("CI") != "true" or "localhost:5432/foggara_migration" not in os.environ.get("DATABASE_URL", ""):
        raise RuntimeError("Requires disposable GitHub Actions database")
    with psycopg.connect("postgresql://postgres:postgres@localhost:5432/postgres", autocommit=True) as conn:
        for role in ("anon", "authenticated", "service_role"):
            if not conn.execute("SELECT 1 FROM pg_roles WHERE rolname=%s", (role,)).fetchone():
                conn.execute(sql.SQL("CREATE ROLE {} NOLOGIN").format(sql.Identifier(role)))
            conn.execute(sql.SQL("ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO {}").format(sql.Identifier(role)))
        for i, start in enumerate(("base", "d4e5f6a7b8c9", "e5f6a7b8c9d0", "rc1agriops01")):
            database = f"foggara_path_{i}"
            conn.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
            env = dict(os.environ, DATABASE_URL=f"postgresql+psycopg://postgres:postgres@localhost:5432/{database}")
            def migrate(revision, direction="upgrade"):
                subprocess.run([sys.executable, "-m", "alembic", direction, revision], env=env, check=True)
            if start != "base":
                migrate(start)
            migrate("head")
            migrate("int20261003m1", "downgrade")
            migrate("head")
            with psycopg.connect(f"postgresql://postgres:postgres@localhost:5432/{database}") as check:
                assert check.execute("SELECT version_num FROM alembic_version").fetchone()[0] == "an20261004m1"
                tables = check.execute("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'").fetchall()
                assert tables and all(enabled for _, enabled in tables), tables
                for role in ("anon", "authenticated", "service_role"):
                    for name, _ in tables:
                        assert not check.execute("SELECT has_table_privilege(%s, %s, 'SELECT')", (role, "public."+name)).fetchone()[0], (role,name)
            print(f"MIGRATION_PATH_PASS={start}->an20261004m1; RLS/grants verified")
if __name__ == "__main__":
    main()
