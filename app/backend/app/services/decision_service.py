"""خدمة الانتقالات المركزية لمحرك القرارات العام (Contract §15/§28).

المصدر الوحيد لقواعد آلة الحالات — لا قواعد انتقال مبعثرة في النقاط الطرفية.
كل انتقال ناجح: يحدّث القرار + ينشئ سجل DecisionTransition + قيد تدقيق.
التنفيذ تسجيلي فقط — لا أوامر لأي معدات مادية إطلاقًا (R4).
"""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..deps import api_error
from ..models import (DECISION_TRANSITIONS, GovDecision,
                      GovDecisionExecution, GovDecisionTransition,
                      GovDecisionVerification, User)

# قواعد كل انتقال: الأدوار المسموحة + شروط إضافية.
# التقسيم الدقيق للصلاحيات (Contract §12):
#   create ← member+ | review/approve/verify ← reviewer,admin | authorize/execute ← admin
_TRANSITION_RULES = {
    ("PROPOSED", "REVIEW_REQUIRED"): {"roles": {"member", "reviewer", "admin"}},
    ("PROPOSED", "CANCELLED"): {"roles": {"member", "reviewer", "admin"}, "own_or_reviewer": True},
    ("REVIEW_REQUIRED", "APPROVED"): {"roles": {"reviewer", "admin"}, "not_proposer": True},
    ("REVIEW_REQUIRED", "CANCELLED"): {"roles": {"reviewer", "admin"}},
    ("APPROVED", "EXECUTION_AUTHORIZED"): {"roles": {"admin"}},
    ("APPROVED", "CANCELLED"): {"roles": {"reviewer", "admin"}},
    ("EXECUTION_AUTHORIZED", "EXECUTED"): {"roles": {"admin"}, "requires_execution": True},
    ("EXECUTION_AUTHORIZED", "CANCELLED"): {"roles": {"reviewer", "admin"}},
    ("EXECUTED", "VERIFIED"): {"roles": {"reviewer", "admin"}, "requires_verification": True},
}

# الحقلان (*_by / *_at) المختومان عند الوصول إلى كل حالة
_STAMPS = {
    "REVIEW_REQUIRED": ("reviewed_by", "reviewed_at"),
    "APPROVED": ("approved_by", "approved_at"),
    "EXECUTION_AUTHORIZED": ("authorized_by", "authorized_at"),
    "EXECUTED": ("executed_by", "executed_at"),
    "VERIFIED": ("verified_by", "verified_at"),
}


def perform_transition(db: Session, decision: GovDecision, to: str,
                       user: User, reason: str | None = None,
                       comment: str | None = None) -> GovDecision:
    """تنفيذ انتقال واحد مع كل الفحوص — 409/403 عند أي خرق، دون تعديل عند الفشل."""
    from_status = decision.status
    allowed = DECISION_TRANSITIONS.get(from_status, set())
    if to not in allowed:
        api_error(409, "INVALID_STATE_TRANSITION",
                  f"Transition {from_status} -> {to} is not allowed")

    rule = _TRANSITION_RULES[(from_status, to)]
    if user.role not in rule["roles"]:
        api_error(403, "ROLE_FORBIDDEN", "Your role cannot perform this transition")

    # فصل المهام: المقترح لا يعتمد اقتراحه بنفسه (Contract §13)
    if rule.get("not_proposer") and user.id == decision.proposed_by:
        api_error(403, "SEPARATION_OF_DUTIES",
                  "Proposer cannot approve their own decision")

    # إلغاء في PROPOSED: المقترح نفسه أو مراجع/مدير فقط
    if rule.get("own_or_reviewer") and user.role == "member" and user.id != decision.proposed_by:
        api_error(403, "ROLE_FORBIDDEN", "Only the proposer or a reviewer can cancel")

    # EXECUTED يتطلب سجل تنفيذ ناجحًا (تسجيلي، لا تحكم بمعدات)
    if rule.get("requires_execution"):
        ok = db.execute(
            select(GovDecisionExecution.id).where(
                GovDecisionExecution.decision_id == decision.id,
                GovDecisionExecution.success.is_(True))
        ).first()
        if ok is None:
            api_error(409, "EXECUTION_RECORD_REQUIRED",
                      "A successful execution record is required before EXECUTED")

    # VERIFIED لا يُبلغ إلا عبر سجل تحقق PASSED (Contract §11)
    if rule.get("requires_verification"):
        ok = db.execute(
            select(GovDecisionVerification.id).where(
                GovDecisionVerification.decision_id == decision.id,
                GovDecisionVerification.verification_status == "PASSED")
        ).first()
        if ok is None:
            api_error(409, "VERIFICATION_RECORD_REQUIRED",
                      "A PASSED verification record is required before VERIFIED")

    now = datetime.now(timezone.utc)
    decision.status = to
    stamp = _STAMPS.get(to)
    if stamp:
        setattr(decision, stamp[0], user.id)
        setattr(decision, stamp[1], now)
    if to == "CANCELLED":
        decision.cancelled_at = now

    db.add(GovDecisionTransition(
        decision_id=decision.id, from_status=from_status, to_status=to,
        actor_id=user.id, actor_role=user.role, reason=reason, comment=comment,
    ))
    audit(db, user, "transition", "gov_decision", entity_id=decision.id,
          meta={"from_status": from_status, "to": to})
    return decision
