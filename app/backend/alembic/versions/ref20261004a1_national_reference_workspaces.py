"""National source catalog and private laboratory/economic/AI snapshots."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "ref20261004a1"
down_revision = "int20261003s1"
branch_labels = None
depends_on = None
JSON = sa.JSON().with_variant(JSONB(), "postgresql")
ID = sa.BigInteger().with_variant(sa.Integer(), "sqlite")


def upgrade():
    op.create_table("national_wilayas", sa.Column("code", sa.String(2), primary_key=True),
                    *[sa.Column(k, sa.String(100), nullable=False) for k in ("ar", "fr", "en")],
                    sa.Column("version", sa.String(50), nullable=False), sa.Column("sources", JSON, nullable=False))
    op.create_table("reference_entries", sa.Column("code", sa.String(80), primary_key=True),
                    sa.Column("category", sa.String(20), nullable=False), sa.Column("domain", sa.String(20), nullable=False),
                    sa.Column("content", JSON, nullable=False), sa.Column("source_url", sa.Text(), nullable=False),
                    sa.Column("publisher", sa.String(100), nullable=False), sa.Column("version", sa.String(40), nullable=False),
                    sa.Column("checked_on", sa.String(10), nullable=False))
    for col in ("category", "domain"):
        op.create_index("ix_reference_entries_" + col, "reference_entries", [col])
    for table in ("economic_scenarios", "lab_water_analyses", "ai_analysis_runs"):
        common = [sa.Column("id", ID, primary_key=True),
                  sa.Column("org_id", ID, sa.ForeignKey("organizations.id"), nullable=False),
                  sa.Column("project_id", ID, sa.ForeignKey("projects.id"), nullable=False),
                  sa.Column("created_by", ID, sa.ForeignKey("users.id"), nullable=False),
                  sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.current_timestamp(), nullable=False)]
        if table == "lab_water_analyses":
            extra = [sa.Column("evidence_id", ID, sa.ForeignKey("evidences.id"), nullable=False),
                     sa.Column("source", sa.String(255), nullable=False),
                     sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False), sa.Column("content", JSON, nullable=False)]
        else:
            extra = [sa.Column("results", JSON, nullable=False), sa.Column("input_hash", sa.String(64), nullable=False)]
            if table == "economic_scenarios":
                extra += [sa.Column("title", sa.String(255), nullable=False), sa.Column("assumptions", JSON, nullable=False)]
            else:
                extra += [sa.Column("domain", sa.String(20), nullable=False), sa.Column("locale", sa.String(2), nullable=False),
                          sa.Column("status", sa.String(20), nullable=False),
                          sa.Column("question", sa.Text(), nullable=False), sa.Column("snapshot", JSON, nullable=False)]
        op.create_table(table, *common, *extra)
        for col in ("org_id", "project_id"):
            op.create_index("ix_" + table + "_" + col, table, [col])
        if table == "ai_analysis_runs":
            op.create_index("ix_ai_analysis_runs_status", table, ["status"])
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for table in ("national_wilayas", "reference_entries", "economic_scenarios", "lab_water_analyses", "ai_analysis_runs"):
            op.execute(sa.text("ALTER TABLE " + table + " ENABLE ROW LEVEL SECURITY"))
            op.execute(sa.text("REVOKE ALL ON TABLE " + table + " FROM PUBLIC"))
            for role in ("anon", "authenticated", "service_role"):
                if bind.execute(sa.text("SELECT 1 FROM pg_roles WHERE rolname=:role"), {"role": role}).scalar():
                    op.execute(sa.text("REVOKE ALL ON TABLE " + table + " FROM " + role))


def downgrade():
    for table in ("ai_analysis_runs", "lab_water_analyses", "economic_scenarios", "reference_entries", "national_wilayas"):
        op.drop_table(table)
