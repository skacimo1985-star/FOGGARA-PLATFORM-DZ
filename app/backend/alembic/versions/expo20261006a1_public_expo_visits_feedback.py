"""Public expo visits and feedback.

Revision ID: expo20261006a1
Revises: demo20261006a1
"""
from alembic import op
import sqlalchemy as sa

revision = "expo20261006a1"
down_revision = "demo20261006a1"
branch_labels = None
depends_on = None

BigId = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade():
    op.create_table(
        "expo_visits",
        sa.Column("id", BigId, primary_key=True),
        sa.Column("session_key", sa.String(64), nullable=False, unique=True),
        sa.Column("name", sa.String(120)),
        sa.Column("visitor_role", sa.String(120)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.current_timestamp()),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.current_timestamp()),
    )
    op.create_index("ix_expo_visits_session_key", "expo_visits", ["session_key"], unique=True)

    op.create_table(
        "expo_feedback",
        sa.Column("id", BigId, primary_key=True),
        sa.Column("visit_id", BigId, sa.ForeignKey("expo_visits.id"), nullable=False),
        sa.Column("rating", sa.Integer()),
        sa.Column("suggestion", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.current_timestamp()),
        sa.CheckConstraint("rating IS NULL OR (rating >= 1 AND rating <= 5)", name="ck_expo_feedback_rating"),
    )
    op.create_index("ix_expo_feedback_visit_id", "expo_feedback", ["visit_id"])


def downgrade():
    op.drop_index("ix_expo_feedback_visit_id", table_name="expo_feedback")
    op.drop_table("expo_feedback")
    op.drop_index("ix_expo_visits_session_key", table_name="expo_visits")
    op.drop_table("expo_visits")
