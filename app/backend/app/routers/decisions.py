"""محرك القرارات العام (Contract §14) — المرحلة 2.

طبقة قرارات مستقلة عن المجال تشير إلى الكيانات القائمة (subject_type/subject_id)
دون استبدالها. كل الصلاحيات تُفرض في الخادم (§12)، والعزل بـ org_id من
هوية المستخدم فقط (R6). سجلات التنفيذ تسجيلية — لا أوامر لمعدات (§10).
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from ..audit import audit
from ..db import get_db
from ..deps import paginate, pagination, api_error, get_current_user
from ..models import (GovDecision, GovDecisionEvidence,
                      GovDecisionExecution, GovDecisionTransition,
                      GovDecisionVerification, User)
from ..schemas import (DecisionEvidenceIn, DecisionEvidenceOut, Page,
                       DecisionExecutionIn, DecisionExecutionOut, GovDecisionIn,
                       GovDecisionOut, GovDecisionPatchIn, DecisionTransitionIn,
                       DecisionTransitionOut, DecisionVerificationIn,
                       DecisionVerificationOut)
from ..services.decision_service import perform_transition

router = APIRouter(prefix="/api/decisions", tags=["decisions"])


def _owned_decision(db: Session, org_id: int, decision_id: int) -> GovDecision:
    """جلب قرار مع عزل المستأجر — 404 عند الغياب أو الانتساب لمؤسسة أخرى (§17/§18)."""
    d = db.get(GovDecision, decision_id)
    if d is None or d.org_id != org_id:
        api_error(404, "NOT_FOUND", "Decision not found")
    return d


# ---------- القرارات: قائمة / إنشاء / عرض / تعديل ----------
@router.get("", response_model=Page[GovDecisionOut])
def list_decisions(domain: Optional[str] = Query(default=None),
                   status: Optional[str] = Query(default=None),
                   risk_level: Optional[str] = Query(default=None),
                   pg: tuple[int, int] = Depends(pagination),
                   user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    q = select(GovDecision).where(GovDecision.org_id == user.org_id)
    if domain:
        q = q.where(GovDecision.domain == domain)
    if status:
        q = q.where(GovDecision.status == status)
    if risk_level:
        q = q.where(GovDecision.risk_level == risk_level)
    page, page_size = pg
    items, total, pages = paginate(db, q.order_by(GovDecision.id.desc()), page, page_size)
    return Page(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.post("", response_model=GovDecisionOut, status_code=201)
def create_decision(payload: GovDecisionIn, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    d = GovDecision(org_id=user.org_id, proposed_by=user.id, status="PROPOSED",
                 **payload.model_dump())
    db.add(d)
    db.flush()
    db.add(GovDecisionTransition(decision_id=d.id, from_status="", to_status="PROPOSED",
                              actor_id=user.id, actor_role=user.role,
                              reason=payload.reason))
    audit(db, user, "create", "gov_decision", entity_id=d.id,
          meta={"domain": d.domain, "decision_type": d.decision_type})
    db.commit()
    return d


@router.get("/{decision_id}", response_model=GovDecisionOut)
def get_decision(decision_id: int, user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    return _owned_decision(db, user.org_id, decision_id)


@router.patch("/{decision_id}", response_model=GovDecisionOut)
def patch_decision(decision_id: int, payload: GovDecisionPatchIn,
                   user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    d = _owned_decision(db, user.org_id, decision_id)
    # التعديل مسموح فقط في PROPOSED ومن المقترح أو المدير
    if d.status != "PROPOSED":
        api_error(409, "DECISION_LOCKED", "Only PROPOSED decisions can be edited")
    if user.role != "admin" and user.id != d.proposed_by:
        api_error(403, "ROLE_FORBIDDEN", "Only the proposer or an admin can edit")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(d, field, value)
    audit(db, user, "update", "gov_decision", entity_id=d.id)
    db.commit()
    return d


# ---------- الانتقالات (عبر الخدمة المركزية فقط) ----------
@router.post("/{decision_id}/transition", response_model=GovDecisionOut)
def transition_decision(decision_id: int, payload: DecisionTransitionIn,
                        user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    d = _owned_decision(db, user.org_id, decision_id)
    perform_transition(db, d, payload.to, user, payload.reason, payload.comment)
    db.commit()
    return d


@router.get("/{decision_id}/transitions", response_model=list[DecisionTransitionOut])
def list_transitions(decision_id: int, user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    d = _owned_decision(db, user.org_id, decision_id)
    return db.execute(
        select(GovDecisionTransition).where(GovDecisionTransition.decision_id == d.id)
        .order_by(GovDecisionTransition.id)).scalars().all()


# ---------- الأدلة ----------
@router.get("/{decision_id}/evidence", response_model=list[DecisionEvidenceOut])
def list_evidence(decision_id: int, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    d = _owned_decision(db, user.org_id, decision_id)
    return db.execute(
        select(GovDecisionEvidence).where(GovDecisionEvidence.decision_id == d.id)
        .order_by(GovDecisionEvidence.id)).scalars().all()


@router.post("/{decision_id}/evidence", response_model=DecisionEvidenceOut, status_code=201)
def add_evidence(decision_id: int, payload: DecisionEvidenceIn,
                 user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    d = _owned_decision(db, user.org_id, decision_id)
    if d.status in ("VERIFIED", "CANCELLED"):
        api_error(409, "DECISION_CLOSED", "Cannot add evidence to a closed decision")
    ev = GovDecisionEvidence(decision_id=d.id, **payload.model_dump())
    db.add(ev)
    db.flush()
    audit(db, user, "create", "gov_decision_evidence", entity_id=ev.id,
          meta={"decision_id": d.id, "evidence_type": ev.evidence_type})
    db.commit()
    return ev


# ---------- سجلات التنفيذ (تسجيلية فقط — لا تحكم بمعدات) ----------
@router.get("/{decision_id}/execution", response_model=list[DecisionExecutionOut])
def list_executions(decision_id: int, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    d = _owned_decision(db, user.org_id, decision_id)
    return db.execute(
        select(GovDecisionExecution).where(GovDecisionExecution.decision_id == d.id)
        .order_by(GovDecisionExecution.id)).scalars().all()


@router.post("/{decision_id}/execution", response_model=DecisionExecutionOut, status_code=201)
def record_execution(decision_id: int, payload: DecisionExecutionIn,
                     response: Response,
                     idempotency_key: Optional[str] = Header(default=None),
                     user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    d = _owned_decision(db, user.org_id, decision_id)
    # decision:execute ← admin فقط (§12)
    if user.role != "admin":
        api_error(403, "ROLE_FORBIDDEN", "Admin role required to record execution")
    if d.status not in ("EXECUTION_AUTHORIZED", "EXECUTED"):
        api_error(409, "EXECUTION_STATE_REQUIRED",
                  "Execution records require EXECUTION_AUTHORIZED status")

    # الحماية من التكرار (§16): المفتاح نفسه يعيد السجل القائم دون نسخة ثانية
    if idempotency_key:
        existing = db.execute(
            select(GovDecisionExecution).where(
                GovDecisionExecution.decision_id == d.id,
                GovDecisionExecution.idempotency_key == idempotency_key)
        ).scalar_one_or_none()
        if existing is not None:
            response.status_code = 200
            return existing

    now = datetime.now(timezone.utc)
    ex = GovDecisionExecution(decision_id=d.id, idempotency_key=idempotency_key,
                           executor_id=user.id, started_at=now, completed_at=now,
                           **payload.model_dump())
    db.add(ex)
    db.flush()
    audit(db, user, "create", "gov_decision_execution", entity_id=ex.id,
          meta={"decision_id": d.id, "success": payload.success})
    db.commit()
    return ex


# ---------- سجلات التحقق ----------
@router.get("/{decision_id}/verification", response_model=list[DecisionVerificationOut])
def list_verifications(decision_id: int, user: User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    d = _owned_decision(db, user.org_id, decision_id)
    return db.execute(
        select(GovDecisionVerification).where(GovDecisionVerification.decision_id == d.id)
        .order_by(GovDecisionVerification.id)).scalars().all()


@router.post("/{decision_id}/verification", response_model=DecisionVerificationOut, status_code=201)
def record_verification(decision_id: int, payload: DecisionVerificationIn,
                        user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    d = _owned_decision(db, user.org_id, decision_id)
    # decision:verify ← reviewer/admin (§12)
    if user.role not in ("reviewer", "admin"):
        api_error(403, "ROLE_FORBIDDEN", "Reviewer role required to record verification")
    if d.status not in ("EXECUTED", "VERIFIED"):
        api_error(409, "VERIFICATION_STATE_REQUIRED",
                  "Verification records require EXECUTED status")
    v = GovDecisionVerification(decision_id=d.id, verified_by=user.id,
                             **payload.model_dump())
    db.add(v)
    db.flush()
    audit(db, user, "create", "gov_decision_verification", entity_id=v.id,
          meta={"decision_id": d.id, "verification_status": v.verification_status})
    db.commit()
    return v
