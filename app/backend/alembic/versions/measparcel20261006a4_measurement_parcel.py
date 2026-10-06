"""Link measurements to agricultural parcels for verified soil analysis.

Revision ID: measparcel20261006a4
Revises: measbatch20261006a3
"""
from alembic import op
import sqlalchemy as sa

revision = "measparcel20261006a4"
down_revision = "measbatch20261006a3"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("measurements", sa.Column("parcel_id", sa.BigInteger(), nullable=True))
    op.create_foreign_key(
        "fk_measurements_parcel_id_agri_parcels",
        "measurements", "agri_parcels",
        ["parcel_id"], ["id"],
    )
    op.create_index(
        "ix_measurements_parcel_series",
        "measurements",
        ["org_id", "parcel_id", "parameter", "measured_at", "id"],
        unique=False,
    )


def downgrade():
    op.drop_index("ix_measurements_parcel_series", table_name="measurements")
    op.drop_constraint("fk_measurements_parcel_id_agri_parcels", "measurements", type_="foreignkey")
    op.drop_column("measurements", "parcel_id")
