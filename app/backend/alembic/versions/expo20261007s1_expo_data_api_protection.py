"""Protect Expo tables from direct Data API access.

Revision ID: expo20261007s1
Revises: measparcel20261006a4

FastAPI owns these backend tables and enforces the public Expo flow. Supabase
Data API roles must never access visitor or feedback rows directly.
"""
from alembic import op
import sqlalchemy as sa

revision = "expo20261007s1"
down_revision = "measparcel20261006a4"
branch_labels = None
depends_on = None

EXPO_TABLES = ("expo_visits", "expo_feedback")
DATA_API_ROLES = ("anon", "authenticated", "service_role")


def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    quote = bind.dialect.identifier_preparer.quote
    existing_roles = [
        role
        for role in DATA_API_ROLES
        if bind.execute(
            sa.text("SELECT 1 FROM pg_roles WHERE rolname = :role"),
            {"role": role},
        ).scalar()
    ]

    for name in EXPO_TABLES:
        table = "public." + quote(name)
        op.execute(sa.text("ALTER TABLE " + table + " ENABLE ROW LEVEL SECURITY"))
        op.execute(sa.text("REVOKE ALL ON TABLE " + table + " FROM PUBLIC"))
        for role in existing_roles:
            op.execute(
                sa.text("REVOKE ALL ON TABLE " + table + " FROM " + quote(role))
            )

    for role in existing_roles:
        op.execute(
            sa.text(
                "REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM " + quote(role)
            )
        )


def downgrade():
    # Security privileges and RLS are deliberately not weakened by rollback.
    pass
