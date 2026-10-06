from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user, require_reviewer
from ..models import (Action, Asset, Evidence, HumanDecision, Instrument,
                      Measurement, Recommendation, Review, User, WaterResource)
from ..schemas import (EvidenceIn, EvidenceOut, HumanDecisionIn,
                       HumanDecisionOut, MeasurementBatchIn, MeasurementBatchReviewIn,
                       MeasurementIn, MeasurementOut, ReviewIn, ReviewOut)
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


def _validate_measurement_links(db: Session, user: User, *, resource_id, instrument_id, asset_id):
    if resource_id is not None:
        resource = db.get(WaterResource, resource_id)
        if resource is None or resource.org_id != user.org_id:
            api_error(404, "NOT_FOUND", "Resource not found")
    if instrument_id is not None:
        instrument = db.get(Instrument, instrument_id)
        if instrument is None or instrument.org_id != user.org_id:
            api_error(404, "NOT_FOUND", "Instrument not found")
    if asset_id is not None:
        asset = db.get(Asset, asset_id)
        if asset is None or asset.org_id != user.org_id:
            api_error(404, "NOT_FOUND", "Asset not found")


@router.post("/measurements", response_model=MeasurementOut, status_code=201)
def create_measurement(payload: MeasurementIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, payload.project_id)
    validate_measurement(payload.parameter, payload.value, payload.unit)
    _validate_measurement_links(
        db, user,
        resource_id=payload.resource_id,
        instrument_id=payload.instrument_id,
        asset_id=payload.asset_id,
    )
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


@router.post("/projects/{project_id}/measurements/import", status_code=201)
def import_measurements(project_id: int, payload: MeasurementBatchIn,
                        user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Atomically import up to 500 field/lab measurements.

    Re-importing the same exact observation is idempotent. Imported records
    remain pending/unverified; the batch endpoint never promotes evidence.
    """
    get_project_or_404(db, user, project_id)
    normalized = []
    seen = set()
    skipped_duplicates = 0

    for row in payload.rows:
        validate_measurement(row.parameter, row.value, row.unit)
        _validate_measurement_links(
            db, user,
            resource_id=row.resource_id,
            instrument_id=row.instrument_id,
            asset_id=row.asset_id,
        )
        unit = canonical_unit(row.parameter, row.unit)
        key = (
            project_id, row.resource_id, row.parameter, float(row.value), unit,
            row.measured_at, row.source, row.method, row.instrument_id, row.asset_id,
        )
        if key in seen:
            skipped_duplicates += 1
            continue
        seen.add(key)
        existing = db.scalar(select(Measurement.id).where(
            Measurement.org_id == user.org_id,
            Measurement.project_id == project_id,
            Measurement.resource_id == row.resource_id,
            Measurement.parameter == row.parameter,
            Measurement.value == row.value,
            Measurement.unit == unit,
            Measurement.measured_at == row.measured_at,
            Measurement.source == row.source,
            Measurement.method == row.method,
            Measurement.instrument_id == row.instrument_id,
            Measurement.asset_id == row.asset_id,
        ))
        if existing is not None:
            skipped_duplicates += 1
            continue
        normalized.append((row, unit))

    created = []
    for row, unit in normalized:
        data = row.model_dump()
        data["unit"] = unit
        measurement = Measurement(
            org_id=user.org_id,
            project_id=project_id,
            submitted_by=user.id,
            source_type="imported",
            import_batch_ref=payload.batch_reference,
            quality_status="pending",
            verification_status="unverified",
            is_demo=False,
            **data,
        )
        db.add(measurement)
        db.flush()
        audit(
            db, user, "import", "measurement",
            entity_id=measurement.id, project_id=project_id,
            meta={
                "batch_reference": payload.batch_reference,
                "parameter": measurement.parameter,
                "unit": measurement.unit,
                "source_type": "imported",
                "instrument_id": measurement.instrument_id,
            },
        )
        created.append(measurement)

    audit(
        db, user, "measurement_batch_import", "project",
        entity_id=project_id, project_id=project_id,
        meta={
            "batch_reference": payload.batch_reference,
            "received": len(payload.rows),
            "created": len(created),
            "skipped_duplicates": skipped_duplicates,
        },
    )
    db.commit()
    return {
        "project_id": project_id,
        "batch_reference": payload.batch_reference,
        "received": len(payload.rows),
        "created_count": len(created),
        "skipped_duplicates": skipped_duplicates,
        "created": [
            {
                "id": row.id,
                "parameter": row.parameter,
                "value": float(row.value),
                "unit": row.unit,
                "measured_at": row.measured_at,
                "quality_status": row.quality_status,
                "verification_status": row.verification_status,
            }
            for row in created
        ],
    }


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
                                              Measurement.quality_status == "pending")
                    .order_by(Measurement.project_id, Measurement.import_batch_ref, Measurement.id)).scalars().all()
    es = db.execute(select(Evidence).where(Evidence.org_id == user.org_id,
                                           Evidence.status == "submitted")).scalars().all()
    grouped = {}
    for measurement in ms:
        if measurement.source_type != "imported" or not measurement.import_batch_ref:
            continue
        key = (measurement.project_id, measurement.import_batch_ref)
        summary = grouped.setdefault(key, {
            "project_id": measurement.project_id,
            "batch_reference": measurement.import_batch_ref,
            "count": 0,
            "parameters": set(),
            "submitter_ids": set(),
            "instrument_ids": set(),
            "measurement_ids": [],
        })
        summary["count"] += 1
        summary["parameters"].add(measurement.parameter)
        summary["submitter_ids"].add(measurement.submitted_by)
        if measurement.instrument_id is not None:
            summary["instrument_ids"].add(measurement.instrument_id)
        summary["measurement_ids"].append(measurement.id)
    batches = [{
        **summary,
        "parameters": sorted(summary["parameters"]),
        "submitter_ids": sorted(summary["submitter_ids"]),
        "instrument_ids": sorted(summary["instrument_ids"]),
    } for summary in grouped.values()]
    return {
        "measurements": [MeasurementOut.model_validate(m) for m in ms],
        "measurement_batches": batches,
        "evidences": [EvidenceOut.model_validate(e) for e in es],
    }


def _apply_measurement_review(db: Session, user: User, target: Measurement,
                              *, decision: str, note: str, reason: str) -> Review:
    if target.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Measurement not found")
    if target.submitted_by == user.id:
        api_error(403, "SELF_REVIEW_FORBIDDEN", "You cannot review your own submission")
    if target.quality_status != "pending":
        api_error(409, "ALREADY_REVIEWED", "Measurement already reviewed")
    if decision == "accepted" and target.instrument_id is not None \
            and not instrument_has_valid_calibration(db, target.instrument_id):
        api_error(409, "CALIBRATION_REQUIRED",
                  "Cannot validate measurement: instrument has no currently valid (passed) calibration")
    review = Review(
        org_id=user.org_id,
        reviewer_id=user.id,
        target_type="measurement",
        target_id=target.id,
        decision=decision,
        note=note,
        reason=reason,
    )
    db.add(review)
    if decision == "accepted":
        target.quality_status = "validated"
        target.verification_status = "verified"
    elif decision == "rejected":
        target.quality_status = "rejected"
        target.verification_status = "rejected"
    audit(db, user, "review", "measurement", entity_id=target.id,
          project_id=target.project_id, meta={"decision": decision, "reason": reason})
    return review


@router.post("/reviews", response_model=ReviewOut, status_code=201)
def create_review(payload: ReviewIn, user: User = Depends(require_reviewer), db: Session = Depends(get_db)):
    if payload.target_type == "measurement":
        target = db.scalar(select(Measurement).where(
            Measurement.id == payload.target_id,
            Measurement.org_id == user.org_id,
        ).with_for_update())
        if target is None:
            api_error(404, "NOT_FOUND", "Measurement not found")
        review = _apply_measurement_review(
            db, user, target,
            decision=payload.decision, note=payload.note, reason=payload.reason,
        )
        db.flush()
        db.commit()
        return review

    target = db.scalar(select(Evidence).where(Evidence.id == payload.target_id).with_for_update())
    if target is None or target.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Evidence not found")
    if target.submitted_by == user.id:
        api_error(403, "SELF_REVIEW_FORBIDDEN", "You cannot review your own submission")
    if target.status != "submitted":
        api_error(409, "ALREADY_REVIEWED", "Evidence already reviewed")

    review = Review(org_id=user.org_id, reviewer_id=user.id, **payload.model_dump())
    db.add(review)
    target.resolution = payload.decision
    if payload.decision == "accepted":
        target.status = "verified"
    elif payload.decision == "rejected":
        target.status = "rejected"
    else:
        target.status = "submitted"
        target.clarification_note = payload.note

    db.flush()
    audit(db, user, "review", "evidence", entity_id=target.id,
          project_id=target.project_id,
          meta={"decision": payload.decision, "reason": payload.reason})
    db.commit()
    return review


@router.post("/reviews/measurement-batches", status_code=201)
def review_measurement_batch(payload: MeasurementBatchReviewIn,
                             user: User = Depends(require_reviewer),
                             db: Session = Depends(get_db)):
    get_project_or_404(db, user, payload.project_id)
    measurements = list(db.scalars(
        select(Measurement).where(
            Measurement.org_id == user.org_id,
            Measurement.project_id == payload.project_id,
            Measurement.source_type == "imported",
            Measurement.import_batch_ref == payload.batch_reference,
            Measurement.quality_status == "pending",
        ).order_by(Measurement.id).with_for_update()
    ))
    if not measurements:
        api_error(404, "BATCH_NOT_FOUND", "No pending imported measurements found for this batch")
    if any(row.submitted_by == user.id for row in measurements):
        api_error(403, "SELF_REVIEW_FORBIDDEN", "You cannot review a batch containing your own submissions")

    # Validate the entire batch before mutating any row so acceptance is atomic.
    if payload.decision == "accepted":
        invalid_instruments = sorted({
            row.instrument_id for row in measurements
            if row.instrument_id is not None
            and not instrument_has_valid_calibration(db, row.instrument_id)
        })
        if invalid_instruments:
            api_error(409, "CALIBRATION_REQUIRED",
                      "Batch contains measurements from instruments without current passed calibration")

    reviews = [
        _apply_measurement_review(
            db, user, row,
            decision=payload.decision, note=payload.note, reason=payload.reason,
        )
        for row in measurements
    ]
    db.flush()
    audit(
        db, user, "measurement_batch_review", "project",
        entity_id=payload.project_id, project_id=payload.project_id,
        meta={
            "batch_reference": payload.batch_reference,
            "decision": payload.decision,
            "measurement_count": len(measurements),
            "measurement_ids": [row.id for row in measurements],
        },
    )
    db.commit()
    return {
        "project_id": payload.project_id,
        "batch_reference": payload.batch_reference,
        "decision": payload.decision,
        "reviewed_count": len(reviews),
        "measurement_ids": [row.id for row in measurements],
    }


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
