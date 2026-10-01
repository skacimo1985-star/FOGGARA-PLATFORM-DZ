"""agriculture operational layer for RC1

Revision ID: rc1agriops01
Revises: df20260930a1
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "rc1agriops01"
down_revision = "df20260930a1"
branch_labels = None
depends_on = None

ID = sa.BigInteger().with_variant(sa.Integer(), "sqlite")
JSON = sa.JSON().with_variant(JSONB(), "postgresql")

def common():
    return [
        sa.Column("id", ID, primary_key=True),
        sa.Column("org_id", ID, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("created_by", ID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.current_timestamp()),
    ]

def parcel_ref():
    return sa.Column("parcel_id", ID, sa.ForeignKey("agri_parcels.id"), nullable=False)

def upgrade():
    op.create_table("agri_parcels", *common(),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("crop", sa.String(80), nullable=False),
        sa.Column("area_ha", sa.Numeric(12,4), nullable=False),
        sa.Column("location", sa.String(160), nullable=False),
        sa.Column("stage", sa.String(30), nullable=False, server_default="initial"),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.CheckConstraint("area_ha > 0", name="ck_agri_area"))
    op.create_table("agri_observations", *common(), parcel_ref(),
        sa.Column("metric", sa.String(30), nullable=False),
        sa.Column("value", sa.Numeric(16,6), nullable=False),
        sa.Column("unit", sa.String(30), nullable=False),
        sa.Column("source_type", sa.String(30), nullable=False),
        sa.Column("source_ref", sa.String(300), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("evidence_status", sa.String(20), nullable=False),
        sa.Column("verified_by", ID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("evidence_status IN ('OBSERVED','INFERRED','VERIFIED')", name="ck_agri_evidence"))
    op.create_table("agri_plans", *common(), parcel_ref(),
        sa.Column("inputs", JSON, nullable=False), sa.Column("result", JSON, nullable=False))
    op.create_table("agri_tasks", *common(), parcel_ref(),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("due_date", sa.String(10), nullable=False),
        sa.Column("completed", sa.Boolean(), nullable=False, server_default=sa.false()))
    for name in ("agri_parcels","agri_observations","agri_plans","agri_tasks"):
        op.create_index(f"ix_{name}_org_id", name, ["org_id"])
        if name != "agri_parcels":
            op.create_index(f"ix_{name}_parcel_id", name, ["parcel_id"])

def downgrade():
    for name in ("agri_tasks","agri_plans","agri_observations","agri_parcels"):
        op.drop_table(name)
