from pathlib import Path


def _migration_source() -> str:
    return (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "exposec20261007a1_harden_expo_data_api.py"
    ).read_text(encoding="utf-8")


def test_expo_security_migration_is_nonblocking_and_idempotent():
    source = _migration_source()
    assert "relrowsecurity" in source
    assert "SET LOCAL lock_timeout = '5s'" in source
    assert "if not rls_enabled:" in source
    assert "ENABLE ROW LEVEL SECURITY" in source
    assert "REVOKE ALL ON TABLE" in source


def test_expo_security_migration_never_weakens_rls_on_rollback():
    source = _migration_source()
    downgrade = source.split("def downgrade():", 1)[1]
    assert "DISABLE ROW LEVEL SECURITY" not in downgrade
    assert "GRANT " not in downgrade
    assert "FORCE ROW LEVEL SECURITY" not in source
