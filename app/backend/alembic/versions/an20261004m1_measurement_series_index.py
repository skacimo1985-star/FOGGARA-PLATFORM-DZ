"""Index bounded tenant-scoped measurement series without altering records."""
from alembic import op

revision = "an20261004m1"
down_revision = "int20261003s1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_index("ix_measurements_series", "measurements",
                    ["org_id", "project_id", "parameter", "unit", "measured_at", "id"])


def downgrade():
    op.drop_index("ix_measurements_series", table_name="measurements")
