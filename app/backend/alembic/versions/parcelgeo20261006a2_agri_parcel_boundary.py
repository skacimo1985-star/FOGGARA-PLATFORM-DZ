"""Store validated agricultural parcel boundaries.

Revision ID: parcelgeo20261006a2
Revises: expo20261006a1
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "parcelgeo20261006a2"
down_revision = "expo20261006a1"
branch_labels = None
depends_on = None

PortableJSON = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade():
    op.add_column("agri_parcels", sa.Column("boundary_geojson", PortableJSON, nullable=True))


def downgrade():
    op.drop_column("agri_parcels", "boundary_geojson")
