"""Deny direct Data API access to backend-owned application tables.

FastAPI identity is separate from Supabase Auth; backend enforces tenant scope.
The database table owner bypasses RLS. No public Data API policies are installed.
"""
from alembic import op
import sqlalchemy as sa
revision = "int20261003s1"
down_revision = "int20261003m1"
branch_labels = None
depends_on = None
def upgrade():
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return
    quote = bind.dialect.identifier_preparer.quote
    roles = [role for role in ("anon", "authenticated", "service_role")
             if bind.execute(sa.text("SELECT 1 FROM pg_roles WHERE rolname = :role"), {"role": role}).scalar()]
    # Inspect tables present at this revision, not future application metadata.
    for name in sa.inspect(bind).get_table_names(schema="public"):
        table = "public." + quote(name)
        op.execute(sa.text("ALTER TABLE " + table + " ENABLE ROW LEVEL SECURITY"))
        op.execute(sa.text("REVOKE ALL ON TABLE " + table + " FROM PUBLIC"))
        for role in roles:
            op.execute(sa.text("REVOKE ALL ON TABLE " + table + " FROM " + quote(role)))
    for role in roles:
        op.execute(sa.text("REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM " + quote(role)))
        op.execute(sa.text("ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM " + quote(role)))
        op.execute(sa.text("ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM " + quote(role)))
def downgrade():
    # Security privileges are deliberately not restored by schema rollback.
    pass
