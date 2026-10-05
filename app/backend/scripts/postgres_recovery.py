"""Snapshot-consistent PostgreSQL backup and verified restore to an empty database.

Connection secrets stay in the environment. Never restore an untrusted archive:
PostgreSQL archives contain SQL. This covers the application's public schema;
object storage, global roles and managed-provider schemas need separate backups.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import uuid

import psycopg
from psycopg import pq, sql
from psycopg.conninfo import conninfo_to_dict

EXPOSED_ROLES = ("anon", "authenticated", "service_role")
REQUIRED_TABLES = {"alembic_version", "organizations", "users", "projects"}


def connection_settings(value):
    """Use libpq's own decoder, preserving percent encoding, sockets and TLS."""
    if not value:
        raise ValueError("A PostgreSQL connection environment variable is required")
    if value.startswith("postgresql+psycopg://"):
        value = "postgresql://" + value[len("postgresql+psycopg://"):]
    if not value.startswith(("postgresql://", "postgres://")):
        raise ValueError("Only explicit PostgreSQL URLs are accepted")
    settings = conninfo_to_dict(value)
    if not all(settings.get(key) for key in ("dbname", "user")) or not (settings.get("host") or settings.get("hostaddr")):
        raise ValueError("Explicit database, user and host/socket are required")
    # A libpq dbname can itself be a URI/connection string. Refuse indirection.
    if any(character in settings["dbname"] for character in ("=", ":", "/", "?")):
        raise ValueError("Database names must not contain connection strings")
    settings.setdefault("connect_timeout", "10")
    return settings


def command_environment(settings):
    env = {key: value for key, value in os.environ.items() if not key.startswith("PG")}
    mappings = {item.keyword.decode(): item.envvar.decode()
                for item in pq.Conninfo.get_defaults() if item.envvar}
    for key, value in settings.items():
        if key not in mappings:
            raise ValueError("Connection option is not supported by PostgreSQL CLI environment")
        env[mappings[key]] = str(value)
    return env


def run_tool(arguments, settings):
    # Do not echo stderr: connection failures may expose connection identifiers.
    result = subprocess.run(arguments, env=command_environment(settings),
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=False)
    if result.returncode:
        raise RuntimeError(f"{Path(arguments[0]).name} failed (exit {result.returncode}); operation incomplete")


def file_digest(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def inventory(connection):
    names = connection.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").fetchall()
    if not REQUIRED_TABLES.issubset({row[0] for row in names}):
        raise RuntimeError("Application tables are missing")
    heads = [row[0] for row in connection.execute("SELECT version_num FROM public.alembic_version ORDER BY version_num")]
    if len(heads) != 1:
        raise RuntimeError("Expected one Alembic release head")
    tables = {}
    for (name,) in names:
        count = 0
        digest = hashlib.sha256()
        # Server cursor bounds memory; C collation makes row ordering portable.
        with connection.cursor(name="recovery_" + uuid.uuid4().hex) as cursor:
            cursor.execute(sql.SQL("SELECT to_jsonb(t)::text FROM public.{} t ORDER BY to_jsonb(t)::text COLLATE \"C\"").format(sql.Identifier(name)))
            for (row,) in cursor:
                data = row.encode("utf-8")
                digest.update(len(data).to_bytes(8, "big"))
                digest.update(data)
                count += 1
        security = connection.execute("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid=%s::regclass", ("public." + name,)).fetchone()
        policies = connection.execute("SELECT policyname, permissive, roles::text, cmd, qual, with_check FROM pg_policies WHERE schemaname='public' AND tablename=%s ORDER BY policyname", (name,)).fetchall()
        columns = connection.execute("SELECT column_name, data_type, udt_name, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position", (name,)).fetchall()
        constraints = connection.execute("SELECT conname, pg_get_constraintdef(oid), convalidated FROM pg_constraint WHERE conrelid=%s::regclass ORDER BY conname", ("public." + name,)).fetchall()
        indexes = connection.execute("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename=%s ORDER BY indexname", (name,)).fetchall()
        tables[name] = {"rows": count, "sha256": digest.hexdigest(), "rls": list(security),
                        "policies": [list(row) for row in policies], "columns": [list(row) for row in columns],
                        "constraints": [list(row) for row in constraints], "indexes": [list(row) for row in indexes]}
    return {"alembic": heads[0], "tables": tables}


def backup(database_url, output_dir):
    settings = connection_settings(database_url)
    directory = Path(output_dir)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    identifier = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    archive = directory / ("foggara-" + identifier + ".dump")
    manifest = archive.with_suffix(".manifest.json")
    partial = archive.with_suffix(".partial")
    try:
        # Pre-create with private permissions before pg_dump writes any bytes.
        with partial.open("xb"):
            pass
        partial.chmod(0o600)
        with psycopg.connect(**settings) as connection:
            connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            connection.execute("SET LOCAL TIME ZONE 'UTC'")
            snapshot = connection.execute("SELECT pg_export_snapshot()").fetchone()[0]
            captured = inventory(connection)
            run_tool(["pg_dump", "--format=custom", "--no-owner", "--no-privileges",
                      "--schema=public", "--snapshot=" + snapshot, "--file=" + str(partial)], settings)
        if partial.stat().st_size < 1024:
            raise RuntimeError("Backup archive is unexpectedly small")
        run_tool(["pg_restore", "--list", str(partial)], settings)
        document = {"format": 1, "created_at": datetime.now(timezone.utc).isoformat(),
                    "archive_sha256": file_digest(partial), "inventory": captured}
        with manifest.open("x", encoding="utf-8") as stream:
            manifest.chmod(0o600)
            json.dump(document, stream, ensure_ascii=False, sort_keys=True)
        partial.replace(archive)
        return archive
    except BaseException:
        partial.unlink(missing_ok=True)
        manifest.unlink(missing_ok=True)
        raise


def require_empty(connection):
    relations = connection.execute("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname <> 'information_schema'").fetchone()[0]
    sessions = connection.execute("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()").fetchone()[0]
    if relations or sessions:
        raise RuntimeError("Restore requires an empty isolated database with no other sessions")


def restrict_data_api(connection):
    roles = {row[0] for row in connection.execute("SELECT rolname FROM pg_roles")}
    for role in EXPOSED_ROLES:
        if role in roles:
            connection.execute(sql.SQL("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM {}").format(sql.Identifier(role)))
            connection.execute(sql.SQL("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM {}").format(sql.Identifier(role)))
    # PUBLIC grants would also be inherited by every API role.
    connection.execute("REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC")
    connection.execute("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC")
    for role in EXPOSED_ROLES:
        if role in roles:
            for (table,) in connection.execute("SELECT tablename FROM pg_tables WHERE schemaname='public'"):
                denied = connection.execute("SELECT has_table_privilege(%s,%s,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')", (role, "public." + table)).fetchone()[0]
                if denied:
                    raise RuntimeError("Restored Data API privileges are not denied")


def restore(target_url, archive, expected_head):
    settings = connection_settings(target_url)
    archive = Path(archive)
    document = json.loads(archive.with_suffix(".manifest.json").read_text(encoding="utf-8"))
    if document.get("format") != 1 or document["inventory"]["alembic"] != expected_head:
        raise RuntimeError("Manifest format or expected Alembic head does not match")
    if file_digest(archive) != document["archive_sha256"]:
        raise RuntimeError("Archive checksum does not match; restore refused")
    run_tool(["pg_restore", "--list", str(archive)], settings)
    with psycopg.connect(**settings, autocommit=True) as guard:
        guard.execute("SELECT pg_advisory_lock(70620261005)")
        require_empty(guard)
        run_tool(["pg_restore", "--dbname=" + settings["dbname"], "--single-transaction",
                  "--exit-on-error", "--no-owner", "--no-privileges", str(archive)], settings)
        # Commit access restrictions before verification: a mismatch must never
        # roll back the denial of inherited managed-provider API grants.
        restrict_data_api(guard)
        with guard.transaction():
            guard.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ")
            guard.execute("SET LOCAL TIME ZONE 'UTC'")
            actual = inventory(guard)
            if actual != document["inventory"]:
                raise RuntimeError("Restored data/schema/security differs from the source snapshot; keep target offline")
    return {"status": "verified", "alembic": expected_head, "tables": len(actual["tables"]),
            "rows": sum(table["rows"] for table in actual["tables"].values())}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    backup_parser = commands.add_parser("backup")
    backup_parser.add_argument("--output-dir", required=True)
    restore_parser = commands.add_parser("restore")
    restore_parser.add_argument("--archive", required=True)
    restore_parser.add_argument("--expected-head", required=True)
    args = parser.parse_args()
    try:
        if args.command == "backup":
            result = {"status": "complete", "archive": str(backup(os.environ.get("DATABASE_URL"), args.output_dir))}
        else:
            result = restore(os.environ.get("TARGET_DATABASE_URL"), args.archive, args.expected_head)
        print(json.dumps(result))
        return 0
    except Exception:
        # No traceback/URL/SQL/row data in logs. Operators can investigate privately.
        print("Recovery operation failed; no verified success. Check configuration, permissions and trusted archive privately.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
