"""Versioned dynamic decision matrices."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = 'df20260930a1'
down_revision = 'faf59a70abb1'
branch_labels = None
depends_on = None


def upgrade():
    big = sa.BigInteger().with_variant(sa.Integer(), 'sqlite')
    content = sa.JSON().with_variant(postgresql.JSONB(), 'postgresql')
    op.create_table('decision_matrix_runs',
        sa.Column('id', big, primary_key=True),
        sa.Column('org_id', big, sa.ForeignKey('organizations.id'), nullable=False),
        sa.Column('project_id', big, sa.ForeignKey('projects.id'), nullable=False),
        sa.Column('decision_id', big, sa.ForeignKey('gov_decisions.id'), nullable=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('inputs', content, nullable=False),
        sa.Column('results', content, nullable=False),
        sa.Column('created_by', big, sa.ForeignKey('users.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.current_timestamp(), nullable=False))
    op.create_index('ix_decision_matrix_runs_org_id', 'decision_matrix_runs', ['org_id'])
    op.create_index('ix_decision_matrix_runs_project_id', 'decision_matrix_runs', ['project_id'])


def downgrade():
    op.drop_table('decision_matrix_runs')
