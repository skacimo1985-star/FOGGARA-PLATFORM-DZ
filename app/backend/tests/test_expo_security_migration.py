from pathlib import Path


def test_expo_security_migration_keeps_data_api_closed():
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "expo20261007s1_expo_data_api_protection.py"
    )
    source = path.read_text(encoding="utf-8")

    assert 'down_revision = "measparcel20261006a4"' in source
    assert 'EXPO_TABLES = ("expo_visits", "expo_feedback")' in source
    assert "ENABLE ROW LEVEL SECURITY" in source
    assert "REVOKE ALL ON TABLE" in source
    assert '"anon", "authenticated", "service_role"' in source
    assert "FORCE ROW LEVEL SECURITY" not in source
    assert "DISABLE ROW LEVEL SECURITY" not in source


def test_expo_security_rollback_does_not_restore_public_access():
    path = (
        Path(__file__).resolve().parents[1]
        / "alembic"
        / "versions"
        / "expo20261007s1_expo_data_api_protection.py"
    )
    source = path.read_text(encoding="utf-8")

    downgrade = source.split("def downgrade():", 1)[1]
    assert "GRANT " not in downgrade
    assert "DISABLE ROW LEVEL SECURITY" not in downgrade
