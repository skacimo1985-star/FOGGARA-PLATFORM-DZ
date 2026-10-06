"""Add explicit demo provenance to agriculture operational records.

Revision ID: demo20261006a1
Revises: gis20261006p1
"""
from alembic import op
import sqlalchemy as sa

revision = "demo20261006a1"
down_revision = "gis20261006p1"
branch_labels = None
depends_on = None

TABLES = ("agri_parcels", "agri_observations", "agri_plans", "agri_tasks")


def upgrade():
    for table in TABLES:
        with op.batch_alter_table(table) as batch:
            batch.add_column(
                sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false())
            )


def downgrade():
    for table in reversed(TABLES):
        with op.batch_alter_table(table) as batch:
            batch.drop_column("is_demo")
