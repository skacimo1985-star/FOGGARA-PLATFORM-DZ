import os
import subprocess

import pytest

from scripts import postgres_recovery as recovery


def test_connection_decodes_password_and_keeps_tls_and_sockets(monkeypatch):
    monkeypatch.setenv("PGPASSWORD", "unrelated-secret")
    monkeypatch.setenv("PGHOST", "unrelated-host")
    settings = recovery.connection_settings("postgresql+psycopg://operator:p%40ss%3A%2F%25@host:6543/foggara?sslmode=verify-full&sslrootcert=/cert.pem")
    env = recovery.command_environment(settings)
    assert env["PGPASSWORD"] == "p@ss:/%"
    assert env["PGSSLMODE"] == "verify-full"
    assert env["PGSSLROOTCERT"] == "/cert.pem"
    assert env["PGPORT"] == "6543" and env["PGHOST"] == "host"
    socket = recovery.connection_settings("postgresql://operator@/foggara?host=/tmp/socket")
    assert recovery.command_environment(socket)["PGHOST"] == "/tmp/socket"
    assert "PGPASSWORD" not in recovery.command_environment(socket)


@pytest.mark.parametrize("url", [None, "sqlite:///x.db", "postgresql://host/db", "postgresql://operator@host/postgresql%3A%2F%2Fother%2Fdb"])
def test_implicit_or_redirected_connections_are_refused(url):
    with pytest.raises(ValueError):
        recovery.connection_settings(url)


def test_command_failure_does_not_expose_private_diagnostics(monkeypatch):
    captured = []
    def fail(argv, **kwargs):
        captured.append((argv, kwargs))
        return subprocess.CompletedProcess(argv, 1, stderr=b"password/private-row/private-host")
    monkeypatch.setattr(recovery.subprocess, "run", fail)
    settings = recovery.connection_settings("postgresql://operator:private-secret@host/foggara")
    with pytest.raises(RuntimeError) as error:
        recovery.run_tool(["pg_dump", "--format=custom"], settings)
    assert "private" not in str(error.value)
    assert "private-secret" not in str(captured[0][0])
    assert captured[0][1]["env"]["PGPASSWORD"] == "private-secret"


def test_corrupted_archive_is_rejected_before_database_access(tmp_path, monkeypatch):
    import json
    archive = tmp_path / "backup.dump"
    archive.write_bytes(b"corrupt")
    archive.with_suffix(".manifest.json").write_text(json.dumps({"format": 1, "archive_sha256": "wrong", "inventory": {"alembic": "release"}}))
    monkeypatch.setattr(recovery.psycopg, "connect", lambda **kwargs: pytest.fail("No database access before checksum"))
    with pytest.raises(RuntimeError, match="checksum"):
        recovery.restore("postgresql://operator@host/empty", archive, "release")


def test_failed_dump_removes_partial_and_manifest(tmp_path, monkeypatch):
    class Connection:
        def __enter__(self): return self
        def __exit__(self, *args): return False
        def execute(self, *args): return self
        def fetchone(self): return ("snapshot",)
    monkeypatch.setattr(recovery.psycopg, "connect", lambda **kwargs: Connection())
    monkeypatch.setattr(recovery, "inventory", lambda c: {"alembic": "release", "tables": {}})
    def fail(*args): raise RuntimeError("dump failed")
    monkeypatch.setattr(recovery, "run_tool", fail)
    with pytest.raises(RuntimeError, match="dump failed"):
        recovery.backup("postgresql://operator@host/foggara", tmp_path)
    assert list(tmp_path.iterdir()) == []


def test_nonempty_or_active_restore_target_is_refused():
    class Connection:
        def __init__(self, counts): self.counts = iter(counts)
        def execute(self, *args): return self
        def fetchone(self): return (next(self.counts),)
    for counts in ((1, 0), (0, 1)):
        with pytest.raises(RuntimeError, match="empty isolated"):
            recovery.require_empty(Connection(counts))
    recovery.require_empty(Connection((0, 0)))


def test_legacy_backup_does_not_publish_success_when_dump_fails(tmp_path):
    from pathlib import Path
    executable = tmp_path / "pg_dump"
    executable.write_text("#!/bin/sh\nexit 17\n")
    executable.chmod(0o700)
    destination = tmp_path / "output"
    script = Path(__file__).parents[1] / "scripts" / "backup.sh"
    result = subprocess.run(["bash", str(script)], env={**os.environ,
        "DATABASE_URL": "postgresql://operator:secret@host/db", "BACKUP_DIR": str(destination),
        "PATH": str(tmp_path) + os.pathsep + os.environ["PATH"]}, capture_output=True, text=True)
    assert result.returncode != 0
    assert "backup written" not in result.stdout
    assert not list(destination.iterdir())
    assert "secret" not in result.stdout + result.stderr


def test_restore_preserves_existing_public_schema_and_other_entries():
    contents = b'; Archive metadata\n5; 2615 2200 SCHEMA - public owner\n6; 1259 900 TABLE public organizations owner\n7; 0 0 COMMENT - SCHEMA public owner\n'
    filtered = recovery.restore_entries(contents)
    assert '5; 2615 2200 SCHEMA - public owner' not in filtered
    assert 'TABLE public organizations owner' in filtered
    assert 'COMMENT - SCHEMA public owner' in filtered
