"""Public AGRITECH Expo visitor flow.

No private organization data is exposed. Visitor identity fields are optional,
IP addresses are never stored, and public satellite browsing is restricted to
the Algeria viewport with bounded provider requests.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import math
from typing import Annotated, Literal

import httpx
from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import api_error, require_reviewer
from ..expo_models import ExpoFeedback, ExpoVisit
from ..models import AgriObservation, AgriParcel, Project, Site, User, WaterResource
from ..ratelimit import check_rate_limit
from .remote_sensing_catalog import (
    EARTH_SEARCH_SEARCH_URL,
    _earth_search_features,
    _study_pixel_budget,
    SENTINEL_COLLECTION,
    _parse_bbox,
    _scene_from_feature,
)
from ..services.parcel_geometry import normalize_parcel_boundary, ParcelGeometryError
from ..services.remote_sensing_processing import build_processing_plan, ProcessingPlanError
from ..services.remote_sensing_raster import (
    compute_index_statistics, validate_analysis_bbox, RasterCapacityError, RasterStatisticsError,
)

router = APIRouter(prefix="/api/expo", tags=["expo"])

ALGERIA_BOUNDS = (-8.8, 18.4, 12.2, 37.5)


class ExpoInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


SessionKey = Annotated[
    str,
    StringConstraints(min_length=16, max_length=64, pattern=r"^[A-Za-z0-9_-]+$"),
]


class VisitIn(ExpoInput):
    session_key: SessionKey
    name: str | None = Field(default=None, max_length=120)
    visitor_role: str | None = Field(default=None, max_length=120)


class FeedbackIn(ExpoInput):
    visit_id: int = Field(gt=0)
    session_key: SessionKey
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
    # Bind feedback to the same browser session that created/refreshed the
    # visit. Returning the same 404 for a missing ID or a mismatched key avoids
    # leaking whether another visitor's numeric ID exists.
    visit = db.scalar(
        select(ExpoVisit).where(
            ExpoVisit.id == payload.visit_id,
            ExpoVisit.session_key == payload.session_key,
        )
    )
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




@router.get("/demo-data")
def expo_demo_data(db: Session = Depends(get_db)):
    """Public read-only aggregate of rows explicitly marked as DEMO.

    This endpoint never exposes non-demo organization data or user records.
    """
    sites = db.scalars(
        select(Site)
        .where(
            Site.is_demo.is_(True),
            Site.lat.is_not(None),
            Site.lon.is_not(None),
        )
        .order_by(Site.id)
        .limit(120)
    ).all()

    site_ids = [site.id for site in sites]
    projects = db.scalars(
        select(Project).where(Project.is_demo.is_(True), Project.site_id.in_(site_ids))
    ).all() if site_ids else []
    resources = db.scalars(
        select(WaterResource).where(
            WaterResource.is_demo.is_(True),
            WaterResource.site_id.in_(site_ids),
        )
    ).all() if site_ids else []

    projects_by_site: dict[int, list[dict]] = {}
    for row in projects:
        projects_by_site.setdefault(row.site_id, []).append({
            "id": row.id,
            "title": row.title,
            "domain": row.domain,
            "status": row.status,
        })

    resources_by_site: dict[int, list[dict]] = {}
    for row in resources:
        resources_by_site.setdefault(row.site_id, []).append({
            "id": row.id,
            "type": row.type,
            "name": row.name,
            "status": row.status,
        })

    gis_sites = [{
        "site": {
            "id": site.id,
            "name": site.name,
            "wilaya": site.wilaya,
            "commune": site.commune,
            "lat": float(site.lat),
            "lon": float(site.lon),
            "is_demo": True,
        },
        "projects": projects_by_site.get(site.id, []),
        "resources": resources_by_site.get(site.id, []),
        "assets": [],
        "service_requests": [],
    } for site in sites]

    return {
        "demo": True,
        "label": "SYNTHETIC_DEMO_DATA",
        "sites": gis_sites,
        "counts": {
            "sites": int(db.scalar(select(func.count()).select_from(Site).where(Site.is_demo.is_(True))) or 0),
            "projects": int(db.scalar(select(func.count()).select_from(Project).where(Project.is_demo.is_(True))) or 0),
            "parcels": int(db.scalar(select(func.count()).select_from(AgriParcel).where(AgriParcel.is_demo.is_(True))) or 0),
            "observations": int(db.scalar(select(func.count()).select_from(AgriObservation).where(AgriObservation.is_demo.is_(True))) or 0),
        },
    }


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


class PublicFieldPreviewIn(ExpoInput):
    """Bounded public *non-persistent* analysis; never accesses private parcels."""
    boundary_geojson: dict
    start: date
    end: date
    index: Literal["ndvi", "ndmi"] = "ndvi"
    scene_id: str | None = Field(default=None, min_length=6, max_length=180)


@router.post("/satellite/ndvi-preview")
def expo_field_ndvi_preview(payload: PublicFieldPreviewIn, request: Request):
    """Actual Sentinel-2 NDVI within a visitor-drawn polygon on FOGGARA's own map.

    Strict limit protects the free web worker from arbitrary public raster workloads.
    Not evidence of soil chemistry, crop identity or field verification.
    """
    check_rate_limit(
        request, "expo:ndvi-preview",
        "RATE_LIMIT_EXPO_NDVI_PREVIEW_MAX", "RATE_LIMIT_EXPO_NDVI_PREVIEW_WINDOW",
        3, 300,
    )
    if payload.start > payload.end or (payload.end - payload.start).days > 31:
        api_error(422, "INVALID_DATE_RANGE", "Select a period of up to 31 days")
    if payload.end > datetime.now(timezone.utc).date():
        api_error(422, "FUTURE_DATE", "Future satellite acquisitions cannot be requested")
    try:
        polygon, meta = normalize_parcel_boundary(payload.boundary_geojson)
    except ParcelGeometryError as exc:
        api_error(422, "INVALID_PREVIEW_POLYGON", str(exc))
    bbox = list(meta["bbox"])
    west, south, east, north = bbox
    aw, ass, ae, an = ALGERIA_BOUNDS
    if not (aw <= west < east <= ae and ass <= south < north <= an):
        api_error(422, "PREVIEW_OUTSIDE_ALGERIA", "FOGGARA public previews are limited to Algeria")
    try:
        validate_analysis_bbox(bbox)
    except RasterStatisticsError as exc:
        api_error(422, "INVALID_PREVIEW_AREA", str(exc))
    if _study_pixel_budget(bbox) > 1600:
        api_error(422, "PREVIEW_TOO_LARGE", "Select a smaller polygon (maximum 1,600 estimated Sentinel pixels)")

    features = _earth_search_features(bbox, payload.start, payload.end, 35.0, 8)
    # Select only a scene returned by the trusted fixed STAC provider and
    # within this AOI/date/cloud query. No arbitrary asset URL accepted.
    if payload.scene_id:
        features = [feature for feature in features if feature.get("id") == payload.scene_id]
    skipped = []
    for feature in features:
        scene = _scene_from_feature(feature)
        if not scene.get("id") or scene.get("geometry") is None:
            continue
        try:
            plan = build_processing_plan(feature, payload.index)
        except ProcessingPlanError:
            skipped.append({"scene_id": scene["id"], "reason": "required_bands_unavailable"})
            continue
        try:
            # The raster engine applies Sentinel-2 SCL quality masks and
            # clips to this polygon; it never returns neighbouring field pixels.
            result = compute_index_statistics(plan, bbox, geometry_wgs84=polygon)
        except RasterCapacityError:
            api_error(429, "PUBLIC_ANALYSIS_BUSY", "FOGGARA raster engine is busy; retry later")
        except RasterStatisticsError:
            skipped.append({"scene_id": scene["id"], "reason": "remote_raster_unavailable"})
            continue
        # Never publish a numerical field result if the polygon mask did not run.
        if not result.get("mask", {}).get("geometry_mask_applied"):
            skipped.append({"scene_id": scene["id"], "reason": "polygon_mask_not_applied"})
            continue
        valid = int(result.get("pixels", {}).get("valid") or 0)
        mean = result.get("statistics", {}).get("mean")
        if valid == 0 or not isinstance(mean, (int, float)) or not math.isfinite(mean) or not (-1 <= mean <= 1):
            skipped.append({"scene_id": scene["id"], "reason": "no_valid_index_pixels"})
            continue
        return {
            "status": "READY",
            "product": f"FOGGARA FIELD / {payload.index.upper()} PREVIEW",
            "index": payload.index,
            "scene": {
                "id": scene["id"], "datetime": scene.get("datetime"),
                "cloud_cover_pct": scene.get("cloud_cover_pct"),
                "provider": scene.get("provider"),
            },
            "bbox_wgs84": bbox,
            "area_ha_estimated": meta["estimated_area_ha"],
            "geometry_mask_applied": bool(result.get("mask", {}).get("geometry_mask_applied")),
            "indices": {payload.index: {
                "statistics": result.get("statistics"),
                "pixels": result.get("pixels"),
                "mask": result.get("mask"),
            }},
            "evidence": {"scene": "OBSERVED", payload.index: "COMPUTED", "verified": False},
            "persisted": False,
            "interpretation": ("NDVI estimates spectral vegetation greenness, not yield, plant disease or soil chemistry." if payload.index == "ndvi" else "NDMI is a vegetation-canopy moisture proxy, not measured soil moisture, irrigation requirement or groundwater availability."),
            "limitations": ["Visitor preview is not saved to an organization.", "Remote imagery may not be available for the requested period."],
        }
    return {
        "status": "NO_USABLE_SCENE",
        "product": f"FOGGARA FIELD / {payload.index.upper()} PREVIEW",
        "index": payload.index,
        "bbox_wgs84": bbox,
        "area_ha_estimated": meta["estimated_area_ha"],
        "indices": {},
        "scene": None,
        "skipped": skipped,
        "evidence": {"verified": False},
        "persisted": False,
    }

