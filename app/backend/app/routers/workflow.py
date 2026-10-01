from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user, require_reviewer
from ..models import (Action, Asset, Evidence, HumanDecision, Instrument,
                      Measurement, Recommendation, Review, User)
from ..schemas import (EvidenceIn, EvidenceOut, HumanDecisionIn,
                       HumanDecisionOut, MeasurementIn, MeasurementOut,
                       ReviewIn, ReviewOut)
from ..services.indicators import canonical_unit, validate_measurement
from ..services.metrology import instrument_has_valid_calibration
from .core import get_project_or_404

router = APIRouter(prefix="/api", tags=["workflow"])


# ---------- Measurements ----------
@router.get("/projects/{project_id}/measurements", response_model=list[MeasurementOut])
def list_measurements(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, project_id)
    return db.execute(select(Measurement).where(Measurement.project_id == project_id)
                      .order_by(Measurement.measured_at.desc())).scalars().all()


@router.post("/measurements", response_model=MeasurementOut, status_code=201)
def create_measurement(payload: MeasurementIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, payload.project_id)
    validate_measurement(payload.parameter, payload.value, payload.unit)
    if payload.resource_id is not None:
        from ..models import WaterResource
        r = db.get(WaterResource, payload.resource_id)
        if r is None or r.org_id != user.org_id:
            api_error(404, "NOT_FOUND", "Resource not found")
    if payload.instrument_id is not None:
        inst = db.get(Instrument, payload.instrument_id)
        if inst is None or inst.org_id != user.org_id:
            api_error(404, "NOT_FOUND", "Instrument not found")
    if payload.asset_id is not None:
        a = db.get(Asset, payload.asset_id)
        if a is None or a.org_id != user.org_id:
            api_error(404, "NOT_FOUND", "Asset not found")
    data = payload.model_dump()
    data["unit"] = canonical_unit(payload.parameter, payload.unit)  # تخزين قياسي موحّد
    m = Measurement(org_id=user.org_id, submitted_by=user.id, **data)
    db.add(m)
    db.flush()
    audit(db, user, "create", "measurement", entity_id=m.id, project_id=m.project_id,
          meta={"parameter": m.parameter, "value": str(m.value), "unit": m.unit,
                "source_type": m.source_type, "instrument_id": m.instrument_id})
    db.commit()
    return m


@router.get("/measurements/{measurement_id}", response_model=MeasurementOut)
def get_measurement(measurement_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = db.get(Measurement, measurement_id)
    if m is None or m.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Measurement not found")
    return m


# ---------- Evidence ----------
@router.get("/projects/{project_id}/evidences", response_model=list[EvidenceOut])
def list_evidences(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, project_id)
    return db.execute(select(Evidence).where(Evidence.project_id == project_id)
                      .order_by(Evidence.id.desc())).scalars().all()


@router.post("/evidences", response_model=EvidenceOut, status_code=201)
def create_evidence(payload: EvidenceIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, payload.project_id)
    if payload.measurement_id is not None:
        m = db.get(Measurement, payload.measurement_id)
        if m is None or m.org_id != user.org_id or m.project_id != payload.project_id:
            api_error(404, "NOT_FOUND", "Measurement not found")
    # الحالة دائمًا submitted عند الإنشاء — لا يمكن للمستخدم فرض verified
    e = Evidence(org_id=user.org_id, submitted_by=user.id, status="submitted", **payload.model_dump())
    db.add(e)
    db.flush()
    audit(db, user, "create", "evidence", entity_id=e.id, project_id=e.project_id, meta={"title": e.title})
    db.commit()
    return e


@router.get("/evidences/{evidence_id}", response_model=EvidenceOut)
def get_evidence(evidence_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    e = db.get(Evidence, evidence_id)
    if e is None or e.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Evidence not found")
    return e


# ---------- Reviews ----------
@router.get("/reviews/pending")
def pending_reviews(user: User = Depends(require_reviewer), db: Session = Depends(get_db)):
    ms = db.execute(select(Measurement).where(Measurement.org_id == user.org_id,
                                              Measurement.quality_status == "pending")).scalars().all()
    es = db.execute(select(Evidence).where(Evidence.org_id == user.org_id,
                                           Evidence.status == "submitted")).scalars().all()
    return {
        "measurements": [MeasurementOut.model_validate(m) for m in ms],
        "evidences": [EvidenceOut.model_validate(e) for e in es],
    }


@router.post("/reviews", response_model=ReviewOut, status_code=201)
def create_review(payload: ReviewIn, user: User = Depends(require_reviewer), db: Session = Depends(get_db)):
    if payload.target_type == "measurement":
        target = db.get(Measurement, payload.target_id)
        if target is None or target.org_id != user.org_id:
            api_error(404, "NOT_FOUND", "Measurement not found")
    else:
        target = db.scalar(select(Evidence).where(Evidence.id == payload.target_id).with_for_update())
        if target is None or target.org_id != user.org_id:
            api_error(404, "NOT_FOUND", "Evidence not found")

    # المراجع لا يراجع ما قدّمه بنفسه
    if target.submitted_by == user.id:
        api_error(403, "SELF_REVIEW_FORBIDDEN", "You cannot review your own submission")

    if payload.target_type == "measurement":
        if target.quality_status != "pending":
            api_error(409, "ALREADY_REVIEWED", "Measurement already reviewed")
    else:
        if target.status != "submitted":
            api_error(409, "ALREADY_REVIEWED", "Evidence already reviewed")

    # قاعدة مترولوجية: قياس من أداة بلا معايرة سارية لا يُعتمد validated
    if payload.target_type == "measurement" and payload.decision == "accepted" \
            and target.instrument_id is not None \
            and not instrument_has_valid_calibration(db, target.instrument_id):
        api_error(409, "CALIBRATION_REQUIRED",
                  "Cannot validate measurement: instrument has no currently valid (passed) calibration")

    review = Review(org_id=user.org_id, reviewer_id=user.id, **payload.model_dump())
    db.add(review)

    if payload.target_type == "measurement":
        if payload.decision == "accepted":
            target.quality_status = "validated"
            target.verification_status = "verified"
        elif payload.decision == "rejected":
            target.quality_status = "rejected"
            target.verification_status = "rejected"
        # request_clarification: يبقى pending ويُعاد تقديمه للمراجعة
    else:
        target.resolution = payload.decision
        if payload.decision == "accepted":
            target.status = "verified"
        elif payload.decision == "rejected":
            target.status = "rejected"
        else:  # request_clarification — يبقى submitted ويُعاد فتحه للمراجعة بعد التوضيح
            target.status = "submitted"
            target.clarification_note = payload.note

    db.flush()
    audit(db, user, "review", payload.target_type, entity_id=target.id,
          project_id=target.project_id,
          meta={"decision": payload.decision, "reason": payload.reason})
    db.commit()
    return review


@router.get("/projects/{project_id}/reviews", response_model=list[ReviewOut])
def list_reviews(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, project_id)
    m_ids = [m.id for m in db.execute(select(Measurement).where(Measurement.project_id == project_id)).scalars().all()]
    e_ids = [e.id for e in db.execute(select(Evidence).where(Evidence.project_id == project_id)).scalars().all()]
    reviews = db.execute(select(Review).where(Review.org_id == user.org_id)).scalars().all()
    return [r for r in reviews
            if (r.target_type == "measurement" and r.target_id in m_ids)
            or (r.target_type == "evidence" and r.target_id in e_ids)]


# ---------- Human decisions (governance) ----------
@router.post("/human-decisions", response_model=HumanDecisionOut, status_code=201)
def create_human_decision(payload: HumanDecisionIn, user: User = Depends(require_reviewer),
                          db: Session = Depends(get_db)):
    project = get_project_or_404(db, user, payload.project_id)
    # لا يجوز أن يقرر المراجع فيما قدّمه/أنشأه هو
    if project.created_by == user.id:
        api_error(403, "SELF_DECISION_FORBIDDEN",
                  "You cannot decide on a project you created yourself")
    if payload.recommendation_id is not None:
        rec = db.get(Recommendation, payload.recommendation_id)
        if rec is None or rec.org_id != user.org_id:
            api_error(404, "NOT_FOUND", "Recommendation not found")
    if payload.action_id is not None:
        act = db.get(Action, payload.action_id)
        if act is None or act.org_id != user.org_id:
            api_error(404, "NOT_FOUND", "Action not found")
        if act.created_by == user.id:
            api_error(403, "SELF_DECISION_FORBIDDEN",
                      "You cannot decide on an action you created yourself")
    # الأدلة المرتبطة يجب أن تكون من نفس المؤسسة
    for ev_id in payload.evidence_ids:
        ev = db.get(Evidence, ev_id)
        if ev is None or ev.org_id != user.org_id:
            api_error(404, "NOT_FOUND", f"Evidence {ev_id} not found")
    dec = HumanDecision(org_id=user.org_id, decided_by=user.id, **payload.model_dump())
    db.add(dec)
    db.flush()
    audit(db, user, "decide", "human_decision", entity_id=dec.id, project_id=payload.project_id,
          meta={"decision": payload.decision, "recommendation_id": payload.recommendation_id,
                "action_id": payload.action_id})
    db.commit()
    return dec


@router.get("/projects/{project_id}/human-decisions", response_model=list[HumanDecisionOut])
def list_human_decisions(project_id: int, user: User = Depends(get_current_user),
                         db: Session = Depends(get_db)):
    get_project_or_404(db, user, project_id)
    return db.execute(select(HumanDecision).where(HumanDecision.project_id == project_id)
                      .order_by(HumanDecision.id.desc())).scalars().all()
