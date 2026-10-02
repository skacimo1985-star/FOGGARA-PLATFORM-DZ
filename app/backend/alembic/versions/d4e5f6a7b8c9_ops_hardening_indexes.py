"""ops hardening: composite indexes for proven hot query paths

Justification (from actual router query patterns, not speculation):
- audit_logs: كل صفحات التدقيق WHERE org_id=? ORDER BY id DESC — والجدول
  ينمو بلا حدود مع كل عملية، فالفهرس المركب يمنع فرزًا كاملًا متناميًا.
- gov_decisions: قائمة القرارات WHERE org_id=? [AND status=?] ORDER BY id DESC —
  فلترة الحالة مع عزل المستأجر نمط ثابت في واجهة القرارات.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
"""
from alembic import op

revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index("ix_audit_logs_org_id_desc", "audit_logs", ["org_id", "id"])
    op.create_index("ix_gov_decisions_org_status", "gov_decisions", ["org_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_gov_decisions_org_status", table_name="gov_decisions")
    op.drop_index("ix_audit_logs_org_id_desc", table_name="audit_logs")
