"""Harden Expo tables against direct Supabase Data API access.

Revision ID: exposec20261007a1
Revises: measparcel20261006a4

FOGGARA serves Expo traffic through FastAPI. The Expo tables were created
after the earlier private-table hardening migration, so explicitly apply the
same RLS/privilege posture here. No public RLS policies are installed.
"""
from alembic import op
import sqlalchemy as sa

revision = "exposec20261007a1"
down_revision = "measparcel20261006a4"
branch_labels = None
depends_on = None

TABLES = ("expo_visits", "expo_feedback")
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

    for name in TABLES:
        table = "public." + quote(name)
        op.execute(sa.text("ALTER TABLE " + table + " ENABLE ROW LEVEL SECURITY"))
        op.execute(sa.text("REVOKE ALL ON TABLE " + table + " FROM PUBLIC"))
        for role in existing_roles:
            op.execute(
                sa.text("REVOKE ALL ON TABLE " + table + " FROM " + quote(role))
            )

        sequence = bind.execute(
            sa.text("SELECT pg_get_serial_sequence(:table_name, 'id')"),
            {"table_name": f"public.{name}"},
        ).scalar()
        if sequence:
            quoted_sequence = ".".join(quote(part) for part in str(sequence).split("."))
            op.execute(sa.text("REVOKE ALL ON SEQUENCE " + quoted_sequence + " FROM PUBLIC"))
            for role in existing_roles:
                op.execute(
                    sa.text(
                        "REVOKE ALL ON SEQUENCE "
                        + quoted_sequence
                        + " FROM "
                        + quote(role)
                    )
                )


def downgrade():
    # Security posture is intentionally not weakened by schema rollback.
    pass
