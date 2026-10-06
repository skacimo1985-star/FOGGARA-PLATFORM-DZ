"""Public AGRITECH Expo visitor flow.

No private organization data is exposed. Visitor identity fields are optional,
IP addresses are never stored, and public satellite browsing is restricted to
the Algeria viewport with bounded provider requests.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Annotated

import httpx
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import api_error, require_reviewer
from ..expo_models import ExpoFeedback, ExpoVisit
from ..models import User
from ..ratelimit import check_rate_limit
from .remote_sensing_catalog import (
    EARTH_SEARCH_SEARCH_URL,
    SENTINEL_COLLECTION,
    _parse_bbox,
    _scene_from_feature,
)

router = APIRouter(prefix="/api/expo", tags=["expo"])

ALGERIA_BOUNDS = (-8.8, 18.4, 12.2, 37.5)


class ExpoInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class VisitIn(ExpoInput):
    session_key: Annotated[str, StringConstraints(min_length=16, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")]
    name: str | None = Field(default=None, max_length=120)
    visitor_role: str | None = Field(default=None, max_length=120)


class FeedbackIn(ExpoInput):
    visit_id: int = Field(gt=0)
    rating: int | None = Field(default=None, ge=1, le=5)
    suggestion: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def has_feedback(self):
        if self.rating is None and not (self.suggestion or "").strip():
            raise ValueError("rating or suggestion is required")
        return self


def _counts(db: Session) -> dict:
    total = db.scalar(select(func.count()).select_from(ExpoVisit)) or 0
    feedback = db.scalar(select(func.count()).select_from(ExpoFeedback)) or 0
    return {"visitors": int(total), "feedback": int(feedback)}


@router.get("/stats")
def expo_stats(db: Session = Depends(get_db)):
    return _counts(db)


@router.post("/visit", status_code=201)
def expo_visit(payload: VisitIn, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(request, "expo:visit", "RATE_LIMIT_EXPO_VISIT_MAX", "RATE_LIMIT_EXPO_VISIT_WINDOW", 30, 60)
    row = db.scalar(select(ExpoVisit).where(ExpoVisit.session_key == payload.session_key))
    if row is None:
        row = ExpoVisit(
            session_key=payload.session_key,
            name=payload.name or None,
            visitor_role=payload.visitor_role or None,
        )
        db.add(row)
        db.flush()
    else:
        if payload.name:
            row.name = payload.name
        if payload.visitor_role:
            row.visitor_role = payload.visitor_role
        row.last_seen_at = datetime.now(timezone.utc)
    db.commit()
    counts = _counts(db)
    return {
        "visit_id": row.id,
        "name": row.name,
        "visitor_role": row.visitor_role,
        **counts,
    }


@router.post("/feedback", status_code=201)
def expo_feedback(payload: FeedbackIn, request: Request, db: Session = Depends(get_db)):
    check_rate_limit(request, "expo:feedback", "RATE_LIMIT_EXPO_FEEDBACK_MAX", "RATE_LIMIT_EXPO_FEEDBACK_WINDOW", 5, 600)
    visit = db.get(ExpoVisit, payload.visit_id)
    if visit is None:
        api_error(404, "EXPO_VISIT_NOT_FOUND", "Expo visit not found")
    row = ExpoFeedback(
        visit_id=visit.id,
        rating=payload.rating,
        suggestion=(payload.suggestion or "").strip() or None,
    )
    db.add(row)
    db.commit()
    return {"feedback_id": row.id, "status": "received", **_counts(db)}




@router.get("/insights")
def expo_insights(
    _user: User = Depends(require_reviewer),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    last_24h = now - timedelta(hours=24)

    visitors = db.scalar(select(func.count()).select_from(ExpoVisit)) or 0
    feedback_total = db.scalar(select(func.count()).select_from(ExpoFeedback)) or 0
    visitors_24h = db.scalar(
        select(func.count()).select_from(ExpoVisit).where(ExpoVisit.created_at >= last_24h)
    ) or 0
    average_rating = db.scalar(
        select(func.avg(ExpoFeedback.rating)).where(ExpoFeedback.rating.is_not(None))
    )

    rating_rows = db.execute(
        select(ExpoFeedback.rating, func.count(ExpoFeedback.id))
        .where(ExpoFeedback.rating.is_not(None))
        .group_by(ExpoFeedback.rating)
        .order_by(ExpoFeedback.rating)
    ).all()
    rating_distribution = {
        str(int(rating)): int(count)
        for rating, count in rating_rows
        if rating is not None
    }

    role_expr = func.nullif(func.trim(ExpoVisit.visitor_role), "")
    role_rows = db.execute(
        select(role_expr.label("visitor_role"), func.count(ExpoVisit.id).label("count"))
        .where(role_expr.is_not(None))
        .group_by(role_expr)
        .order_by(func.count(ExpoVisit.id).desc(), role_expr.asc())
        .limit(12)
    ).all()
    role_distribution = [
        {"visitor_role": str(role), "count": int(count)}
        for role, count in role_rows
    ]

    recent_rows = db.execute(
        select(
            ExpoFeedback.id,
            ExpoFeedback.rating,
            ExpoFeedback.suggestion,
            ExpoFeedback.created_at,
            ExpoVisit.name,
            ExpoVisit.visitor_role,
        )
        .join(ExpoVisit, ExpoVisit.id == ExpoFeedback.visit_id)
        .order_by(ExpoFeedback.id.desc())
        .limit(50)
    ).all()
    recent_feedback = [
        {
            "id": int(feedback_id),
            "rating": int(rating) if rating is not None else None,
            "suggestion": suggestion,
            "created_at": created_at,
            "name": name,
            "visitor_role": visitor_role,
        }
        for feedback_id, rating, suggestion, created_at, name, visitor_role in recent_rows
    ]

    return {
        "visitors": int(visitors),
        "visitors_last_24h": int(visitors_24h),
        "feedback": int(feedback_total),
        "average_rating": round(float(average_rating), 2) if average_rating is not None else None,
        "rating_distribution": rating_distribution,
        "role_distribution": role_distribution,
        "recent_feedback": recent_feedback,
    }


@router.get("/satellite/scenes")
def expo_satellite_scenes(
    request: Request,
    bbox: str = Query(default="-8.8,18.4,12.2,37.5", min_length=7, max_length=160),
    start: date = Query(...),
    end: date = Query(...),
    cloud_cover_lte: float = Query(default=30, ge=0, le=100),
    limit: int = Query(default=8, ge=1, le=12),
):
    check_rate_limit(request, "expo:satellite", "RATE_LIMIT_EXPO_SATELLITE_MAX", "RATE_LIMIT_EXPO_SATELLITE_WINDOW", 10, 60)
    if start > end:
        api_error(422, "INVALID_DATE_RANGE", "start date must not be after end date")
    if (end - start).days > 31:
        api_error(422, "DATE_RANGE_TOO_LARGE", "public expo satellite search is limited to 31 days")

    west, south, east, north = _parse_bbox(bbox)
    aw, ass, ae, an = ALGERIA_BOUNDS
    if west < aw or east > ae or south < ass or north > an or west >= east:
        api_error(422, "EXPO_BBOX_OUTSIDE_ALGERIA", "public expo search is limited to Algeria")

    payload = {
        "collections": [SENTINEL_COLLECTION],
        "bbox": [west, south, east, north],
        "datetime": f"{start.isoformat()}T00:00:00Z/{end.isoformat()}T23:59:59Z",
        "query": {"eo:cloud_cover": {"lte": cloud_cover_lte}},
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
        "limit": limit,
    }

    try:
        timeout = httpx.Timeout(10.0, connect=4.0)
        with httpx.Client(timeout=timeout, follow_redirects=False) as client:
            response = client.post(
                EARTH_SEARCH_SEARCH_URL,
                json=payload,
                headers={"Accept": "application/geo+json", "User-Agent": "FOGGARA-DZ/expo"},
            )
            response.raise_for_status()
            body = response.json()
    except (httpx.HTTPError, ValueError):
        api_error(502, "REMOTE_PROVIDER_UNAVAILABLE", "Satellite catalogue provider is unavailable")

    features = body.get("features") if isinstance(body, dict) else None
    if not isinstance(features, list):
        api_error(502, "REMOTE_PROVIDER_INVALID_RESPONSE", "Satellite catalogue returned an invalid response")
    scenes = [_scene_from_feature(feature) for feature in features if isinstance(feature, dict)]
    scenes = [scene for scene in scenes if scene["id"] and scene["geometry"] is not None]
    return {
        "provider": "Element 84 Earth Search",
        "collection": SENTINEL_COLLECTION,
        "live": True,
        "count": len(scenes),
        "scenes": scenes,
    }
