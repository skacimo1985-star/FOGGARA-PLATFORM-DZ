"""Georeference agricultural parcels without requiring PostGIS.

Revision ID: gis20261006p1
Revises: an20261004m1
"""
from alembic import op
import sqlalchemy as sa

revision = "gis20261006p1"
down_revision = "an20261004m1"
branch_labels = None
depends_on = None

ID = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade():
    with op.batch_alter_table("agri_parcels") as batch:
        batch.add_column(sa.Column("site_id", ID, nullable=True))
        batch.add_column(sa.Column("lat", sa.Numeric(9, 6), nullable=True))
        batch.add_column(sa.Column("lon", sa.Numeric(9, 6), nullable=True))
        batch.create_foreign_key("fk_agri_parcels_site", "sites", ["site_id"], ["id"])
        batch.create_index("ix_agri_parcels_site_id", ["site_id"])
        batch.create_check_constraint(
            "ck_agri_parcel_coordinate_pair",
            "(lat IS NULL AND lon IS NULL) OR (lat IS NOT NULL AND lon IS NOT NULL)",
        )
        batch.create_check_constraint(
            "ck_agri_parcel_lat",
            "lat IS NULL OR (lat >= -90 AND lat <= 90)",
        )
        batch.create_check_constraint(
            "ck_agri_parcel_lon",
            "lon IS NULL OR (lon >= -180 AND lon <= 180)",
        )


def downgrade():
    with op.batch_alter_table("agri_parcels") as batch:
        batch.drop_constraint("ck_agri_parcel_lon", type_="check")
        batch.drop_constraint("ck_agri_parcel_lat", type_="check")
        batch.drop_constraint("ck_agri_parcel_coordinate_pair", type_="check")
        batch.drop_index("ix_agri_parcels_site_id")
        batch.drop_constraint("fk_agri_parcels_site", type_="foreignkey")
        batch.drop_column("lon")
        batch.drop_column("lat")
        batch.drop_column("site_id")
