"""Group imported measurements by persistent batch reference.

Revision ID: measbatch20261006a3
Revises: parcelgeo20261006a2
"""
from alembic import op
import sqlalchemy as sa

revision = "measbatch20261006a3"
down_revision = "parcelgeo20261006a2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("measurements", sa.Column("import_batch_ref", sa.String(length=120), nullable=True))
    op.create_index(
        "ix_measurements_import_batch",
        "measurements",
        ["org_id", "project_id", "import_batch_ref", "quality_status"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_measurements_import_batch", table_name="measurements")
    op.drop_column("measurements", "import_batch_ref")
