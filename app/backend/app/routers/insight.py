from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user, require_reviewer
from ..models import (Action, Decision, Evidence, Indicator, Recommendation,
                      User)
from ..schemas import (ActionIn, ActionOut, ActionUpdate, DecisionIn,
                       DecisionOut, IndicatorOut, IndicatorValueOut,
                       RecommendationOut)
from ..services.indicators import (INDICATOR_CODE,
                                   MIN_MEASUREMENTS, build_recommendation,
                                   compute_flow_avg, ensure_default_indicator)
from .core import get_project_or_404

router = APIRouter(prefix="/api", tags=["insight"])


# ---------- Indicators ----------
@router.get("/indicators", response_model=list[IndicatorOut])
def list_indicators(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(Indicator).order_by(Indicator.id)).scalars().all()


@router.get("/projects/{project_id}/indicators/{code}", response_model=IndicatorValueOut)
def indicator_value(project_id: int, code: str,
                    window_from: Optional[datetime] = Query(default=None),
                    window_to: Optional[datetime] = Query(default=None),
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, project_id)
    ind = db.execute(select(Indicator).where(Indicator.code == code)).scalar_one_or_none()
    if ind is None:
        api_error(404, "NOT_FOUND", "Indicator not found")
    if ind.valid_from and ind.valid_to and not (ind.valid_from <= datetime.now(ind.valid_from.tzinfo) <= ind.valid_to):
        api_error(409, "INDICATOR_EXPIRED", "Indicator validity window has passed")
    if code == INDICATOR_CODE:
        value, unit, wfrom, wto, n, ids = compute_flow_avg(db, user.org_id, project_id, window_from, window_to)
    else:
        api_error(409, "INDICATOR_NOT_IMPLEMENTED", "Indicator has no computation routine yet")
    sufficient = value is not None
    return IndicatorValueOut(
        indicator_code=code, value=value, unit=unit,
        window_from=wfrom, window_to=wto,
        n_measurements=n, sufficient=sufficient,
        measurement_ids=ids,  # مصادر البيانات: قياسات validated فقط (داخل compute_flow_avg)
        name_ar=ind.name_ar, name_fr=ind.name_fr, name_en=ind.name_en,
        formula=ind.formula, source=ind.source,
        valid_from=ind.valid_from, valid_to=ind.valid_to,
        message=None if sufficient else "INSUFFICIENT_DATA",
        params={"threshold": None, "acceptance_rule": "not_configured", "min_measurements": MIN_MEASUREMENTS,
                "parameter": "flow_rate", "accepted_unit": "L/s",
                "default_window_days": 30},
    )


# ---------- Recommendations ----------
@router.post("/projects/{project_id}/recommendations/generate", response_model=RecommendationOut, status_code=201)
def generate_recommendation(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, project_id)
    ind = ensure_default_indicator(db)
    value, unit, wfrom, wto, n, ids = compute_flow_avg(db, user.org_id, project_id, None, None)
    if value is None:
        api_error(422, "INSUFFICIENT_DATA", "Insufficient validated measurements to compute the indicator")
    ev_ids = [e.id for e in db.execute(
        select(Evidence).where(Evidence.project_id == project_id, Evidence.status == "verified")).scalars().all()]
    basis, ar, fr, en = build_recommendation(ind, value, n, wfrom, wto, ev_ids)
    rec = Recommendation(org_id=user.org_id, project_id=project_id, indicator_code=ind.code,
                         basis=basis, evidence_ids=ev_ids, text_ar=ar, text_fr=fr, text_en=en)
    db.add(rec)
    db.flush()
    audit(db, user, "generate", "recommendation", entity_id=rec.id, project_id=project_id,
          meta={"indicator": ind.code, "value": value})
    db.commit()
    return rec


@router.get("/projects/{project_id}/recommendations", response_model=list[RecommendationOut])
def list_recommendations(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, project_id)
    return db.execute(select(Recommendation).where(Recommendation.project_id == project_id)
                      .order_by(Recommendation.id.desc())).scalars().all()


# ---------- Decisions (human only) ----------
@router.post("/recommendations/{rec_id}/decisions", response_model=DecisionOut, status_code=201)
def decide(rec_id: int, payload: DecisionIn, user: User = Depends(require_reviewer), db: Session = Depends(get_db)):
    rec = db.get(Recommendation, rec_id)
    if rec is None or rec.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Recommendation not found")
    if rec.status != "proposed":
        api_error(409, "ALREADY_DECIDED", "Recommendation already decided")
    dec = Decision(org_id=user.org_id, recommendation_id=rec_id, decided_by=user.id, **payload.model_dump())
    rec.status = {"approved": "accepted", "rejected": "rejected", "modified": "accepted"}[payload.decision]
    db.add(dec)
    db.flush()
    audit(db, user, "decide", "recommendation", entity_id=rec_id, project_id=rec.project_id,
          meta={"decision": payload.decision})
    db.commit()
    return dec


# ---------- Actions ----------
@router.post("/actions", response_model=ActionOut, status_code=201)
def create_action(payload: ActionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, payload.project_id)
    if payload.decision_id is not None:
        dec = db.get(Decision, payload.decision_id)
        if dec is None or dec.org_id != user.org_id:
            api_error(404, "NOT_FOUND", "Decision not found")
        rec = db.get(Recommendation, dec.recommendation_id)
        if rec is None or rec.project_id != payload.project_id:
            api_error(404, "NOT_FOUND", "Decision not found")
    a = Action(org_id=user.org_id, created_by=user.id, **payload.model_dump())
    db.add(a)
    db.flush()
    audit(db, user, "create", "action", entity_id=a.id, project_id=a.project_id, meta={"title": a.title})
    db.commit()
    return a


@router.patch("/actions/{action_id}", response_model=ActionOut)
def update_action(action_id: int, payload: ActionUpdate,
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.get(Action, action_id)
    if a is None or a.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Action not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(a, k, v)
    audit(db, user, "update", "action", entity_id=a.id, project_id=a.project_id, meta={"fields": sorted(data.keys())})
    db.commit()
    return a


@router.get("/projects/{project_id}/actions", response_model=list[ActionOut])
def list_actions(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, project_id)
    return db.execute(select(Action).where(Action.project_id == project_id)
                      .order_by(Action.id.desc())).scalars().all()

