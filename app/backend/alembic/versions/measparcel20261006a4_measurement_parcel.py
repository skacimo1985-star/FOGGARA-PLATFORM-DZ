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
    # Batch mode keeps this migration portable to the SQLite staging gate while
    # emitting a normal ALTER/FK sequence on PostgreSQL production.
    with op.batch_alter_table("measurements") as batch:
        batch.add_column(sa.Column("parcel_id", sa.BigInteger(), nullable=True))
        batch.create_foreign_key(
            "fk_measurements_parcel_id_agri_parcels",
            "agri_parcels", ["parcel_id"], ["id"],
        )
        batch.create_index(
            "ix_measurements_parcel_series",
            ["org_id", "parcel_id", "parameter", "measured_at", "id"],
            unique=False,
        )


def downgrade():
    with op.batch_alter_table("measurements") as batch:
        batch.drop_index("ix_measurements_parcel_series")
        batch.drop_constraint("fk_measurements_parcel_id_agri_parcels", type_="foreignkey")
        batch.drop_column("parcel_id")
