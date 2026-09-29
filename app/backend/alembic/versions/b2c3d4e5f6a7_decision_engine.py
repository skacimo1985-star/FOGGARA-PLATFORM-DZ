"""general decision engine (Contract §5..§11 — Phase 2)

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-09-29

محرك القرارات العام: gov_decisions, gov_decision_evidence, gov_decision_transitions,
x — طبقة مستقلة عن المجال،
بأنماط محمولة تعمل على PostgreSQL وSQLite معًا (القاعدة 9).
التنفيذ تسجيلي فقط — لا أوامر لأي معدات مادية.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'b2c3d4e5f6a7'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None

_ID = sa.BigInteger().with_variant(sa.Integer(), 'sqlite')
_JSON = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), 'postgresql')
_NOW = sa.text('CURRENT_TIMESTAMP')

_DOMAINS = "'water','energy','food','ecosystem','health','cross_domain'"
_STATUSES = "'PROPOSED','REVIEW_REQUIRED','APPROVED','EXECUTION_AUTHORIZED','EXECUTED','VERIFIED','CANCELLED'"
_LEVELS = "'low','medium','high','critical'"
_EVIDENCE = ("'measurement','sensor','manual_observation','calculation','rule',"
             "'model','document','inspection','satellite','expert_assessment'")


def upgrade() -> None:
    op.create_table(
        'gov_decisions',
        sa.Column('id', _ID, nullable=False),
        sa.Column('org_id', sa.BigInteger(), nullable=False),
        sa.Column('domain', sa.String(length=20), nullable=False),
        sa.Column('decision_type', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('status', sa.String(length=24), nullable=False),
        sa.Column('priority', sa.String(length=10), nullable=False),
        sa.Column('risk_level', sa.String(length=10), nullable=False),
        sa.Column('subject_type', sa.String(length=50), nullable=True),
        sa.Column('subject_id', sa.BigInteger(), nullable=True),
        sa.Column('source_type', sa.String(length=50), nullable=True),
        sa.Column('source_id', sa.String(length=100), nullable=True),
        sa.Column('proposed_by', sa.BigInteger(), nullable=False),
        sa.Column('reviewed_by', sa.BigInteger(), nullable=True),
        sa.Column('approved_by', sa.BigInteger(), nullable=True),
        sa.Column('authorized_by', sa.BigInteger(), nullable=True),
        sa.Column('executed_by', sa.BigInteger(), nullable=True),
        sa.Column('verified_by', sa.BigInteger(), nullable=True),
        sa.Column('proposed_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('authorized_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('executed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('valid_from', sa.DateTime(timezone=True), nullable=True),
        sa.Column('valid_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('expected_result', sa.Text(), nullable=True),
        sa.Column('actual_result', sa.Text(), nullable=True),
        sa.Column('metadata', _JSON, nullable=False),
        sa.Column('is_demo', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.CheckConstraint(f"domain IN ({_DOMAINS})", name='ck_gdecision_domain'),
        sa.CheckConstraint(f"status IN ({_STATUSES})", name='ck_gdecision_status'),
        sa.CheckConstraint(f"priority IN ({_LEVELS})", name='ck_gdecision_priority'),
        sa.CheckConstraint(f"risk_level IN ({_LEVELS})", name='ck_gdecision_risk'),
        sa.CheckConstraint("valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from",
                           name='ck_gdecision_validity_order'),
        sa.ForeignKeyConstraint(['org_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['proposed_by'], ['users.id']),
        sa.ForeignKeyConstraint(['reviewed_by'], ['users.id']),
        sa.ForeignKeyConstraint(['approved_by'], ['users.id']),
        sa.ForeignKeyConstraint(['authorized_by'], ['users.id']),
        sa.ForeignKeyConstraint(['executed_by'], ['users.id']),
        sa.ForeignKeyConstraint(['verified_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_gov_decisions_org_id', 'gov_decisions', ['org_id'])
    op.create_index('ix_gov_decisions_domain', 'gov_decisions', ['domain'])
    op.create_index('ix_gov_decisions_status', 'gov_decisions', ['status'])

    op.create_table(
        'gov_decision_evidence',
        sa.Column('id', _ID, nullable=False),
        sa.Column('decision_id', sa.BigInteger(), nullable=False),
        sa.Column('evidence_type', sa.String(length=30), nullable=False),
        sa.Column('source_type', sa.String(length=50), nullable=True),
        sa.Column('source_id', sa.String(length=100), nullable=True),
        sa.Column('value', sa.Numeric(precision=18, scale=4), nullable=True),
        sa.Column('unit', sa.String(length=30), nullable=True),
        sa.Column('observed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('quality', sa.String(length=20), nullable=True),
        sa.Column('metadata', _JSON, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.CheckConstraint(f"evidence_type IN ({_EVIDENCE})", name='ck_gevidence_type'),
        sa.ForeignKeyConstraint(['decision_id'], ['gov_decisions.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_gov_decision_evidence_decision_id', 'gov_decision_evidence', ['decision_id'])

    op.create_table(
        'gov_decision_transitions',
        sa.Column('id', _ID, nullable=False),
        sa.Column('decision_id', sa.BigInteger(), nullable=False),
        sa.Column('from_status', sa.String(length=24), nullable=False),
        sa.Column('to_status', sa.String(length=24), nullable=False),
        sa.Column('actor_id', sa.BigInteger(), nullable=False),
        sa.Column('actor_role', sa.String(length=20), nullable=False),
        sa.Column('reason', sa.Text(), nullable=True),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('metadata', _JSON, nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.ForeignKeyConstraint(['decision_id'], ['gov_decisions.id']),
        sa.ForeignKeyConstraint(['actor_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_gov_decision_transitions_decision_id', 'gov_decision_transitions', ['decision_id'])

    op.create_table(
        'gov_decision_executions',
        sa.Column('id', _ID, nullable=False),
        sa.Column('decision_id', sa.BigInteger(), nullable=False),
        sa.Column('execution_type', sa.String(length=50), nullable=False),
        sa.Column('execution_reference', sa.String(length=100), nullable=True),
        sa.Column('idempotency_key', sa.String(length=100), nullable=True),
        sa.Column('requested_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('executor_id', sa.BigInteger(), nullable=True),
        sa.Column('result', sa.Text(), nullable=True),
        sa.Column('result_code', sa.String(length=50), nullable=True),
        sa.Column('success', sa.Boolean(), nullable=True),
        sa.Column('failure_reason', sa.Text(), nullable=True),
        sa.Column('metadata', _JSON, nullable=False),
        sa.ForeignKeyConstraint(['decision_id'], ['gov_decisions.id']),
        sa.ForeignKeyConstraint(['executor_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('decision_id', 'idempotency_key', name='uq_gexecution_idempotency'),
    )
    op.create_index('ix_gov_decision_executions_decision_id', 'gov_decision_executions', ['decision_id'])

    op.create_table(
        'gov_decision_verifications',
        sa.Column('id', _ID, nullable=False),
        sa.Column('decision_id', sa.BigInteger(), nullable=False),
        sa.Column('verified_by', sa.BigInteger(), nullable=False),
        sa.Column('verification_status', sa.String(length=15), nullable=False),
        sa.Column('expected_result', sa.Text(), nullable=True),
        sa.Column('observed_result', sa.Text(), nullable=True),
        sa.Column('verification_method', sa.String(length=50), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('verified_at', sa.DateTime(timezone=True), server_default=_NOW, nullable=False),
        sa.CheckConstraint("verification_status IN ('PASSED','FAILED','PARTIAL','INCONCLUSIVE')",
                           name='ck_gverification_status'),
        sa.ForeignKeyConstraint(['decision_id'], ['gov_decisions.id']),
        sa.ForeignKeyConstraint(['verified_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_gov_decision_verifications_decision_id', 'gov_decision_verifications', ['decision_id'])


def downgrade() -> None:
    op.drop_index('ix_gov_decision_verifications_decision_id', table_name='gov_decision_verifications')
    op.drop_table('gov_decision_verifications')
    op.drop_index('ix_gov_decision_executions_decision_id', table_name='gov_decision_executions')
    op.drop_table('gov_decision_executions')
    op.drop_index('ix_gov_decision_transitions_decision_id', table_name='gov_decision_transitions')
    op.drop_table('gov_decision_transitions')
    op.drop_index('ix_gov_decision_evidence_decision_id', table_name='gov_decision_evidence')
    op.drop_table('gov_decision_evidence')
    op.drop_index('ix_gov_decisions_status', table_name='gov_decisions')
    op.drop_index('ix_gov_decisions_domain', table_name='gov_decisions')
    op.drop_index('ix_gov_decisions_org_id', table_name='gov_decisions')
    op.drop_table('gov_decisions')
