"""Sentinel-2 catalogue-to-record bridge for real agricultural parcels.

Reuses FOGGARA's vetted Element84 Earth Search + Rasterio/SCL computation.
A point-centred sample is NOT a mapped field polygon or a verified field measurement.
"""
from datetime import date, datetime, timezone
import hashlib
import json
import math
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import config
from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import AgriObservation, AgriParcel, User
from ..services.parcel_geometry import ParcelGeometryError, normalize_parcel_boundary
from ..services.remote_sensing_processing import (
    ProcessingPlanError,
    build_processing_plan,
    build_true_color_plan,
)
from ..services.remote_sensing_raster import (
    RasterCapacityError,
    RasterStatisticsError,
    compute_index_statistics,
    render_index_preview_png,
    render_true_color_preview_png,
    validate_analysis_bbox,
)
from .agriculture_operations import METRICS, out, own
from .remote_sensing_catalog import (
    SUPPORTED_INDEX_PATTERN,
    _provider_item,
    catalog_scenes,
)

router = APIRouter(prefix="/api/agriculture", tags=["parcel-sentinel"])

PROVIDER = "element84-earth-search"
MIN_VALID_FRACTION = 0.35
MIN_VALID_PIXELS = 9


PERSISTABLE_INDICES = ("ndvi", "lswi", "ndmi", "ndwi", "bsi", "savi", "evi")
PERSISTABLE_INDEX_BOUNDS = {
    "ndvi": (-1.0, 1.0),
    "lswi": (-1.0, 1.0),
    "ndmi": (-1.0, 1.0),
    "ndwi": (-1.0, 1.0),
    "bsi": (-1.0, 1.0),
    "savi": (-1.5, 1.5),
    "evi": (-2.5, 2.5),
}


class AnalyzeIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    scene_id: str = Field(min_length=3, max_length=120)
    index: Literal["ndvi", "lswi", "ndmi", "ndwi", "bsi", "savi", "evi"] = "ndvi"


def _analysis_target(parcel: AgriParcel) -> tuple[list[float], dict | None, str, str]:
    """Return bounded WGS84 target + stable fingerprint for this parcel geometry."""
    geometry = None
    if parcel.boundary_geojson is not None:
        try:
            geometry, meta = normalize_parcel_boundary(parcel.boundary_geojson)
        except ParcelGeometryError:
            api_error(422, "INVALID_PARCEL_GEOMETRY", "Stored parcel boundary is invalid")
        bounds = list(meta["bbox"])
        sample_geometry = "PARCEL_BOUNDARY_GEOJSON"
        fingerprint_payload = {"geometry": geometry}
    else:
        if parcel.lat is None or parcel.lon is None:
            api_error(422, "PARCEL_COORDINATES_REQUIRED", "Set parcel coordinates or draw its boundary before satellite analysis")
        lat, lon = float(parcel.lat), float(parcel.lon)
        area = float(parcel.area_ha)
        if not all(math.isfinite(x) for x in (lat, lon, area)) or area <= 0:
            api_error(422, "INVALID_PARCEL_GEOMETRY", "Parcel position or area is invalid")
        half_width_m = max(40.0, min(250.0, math.sqrt(area * 10_000.0) / 2))
        lat_deg = half_width_m / 111_320.0
        lon_deg = half_width_m / (111_320.0 * max(0.15, abs(math.cos(math.radians(lat)))))
        bounds = [lon - lon_deg, lat - lat_deg, lon + lon_deg, lat + lat_deg]
        sample_geometry = "POINT_CENTERED_ESTIMATE_NOT_PARCEL_BOUNDARY"
        fingerprint_payload = {"lat": lat, "lon": lon, "area_ha": area}
    try:
        validate_analysis_bbox(bounds)
    except RasterStatisticsError:
        api_error(422, "INVALID_PARCEL_GEOMETRY", "Parcel analysis extent exceeds raster limits")
    fingerprint = hashlib.sha256(
        json.dumps(fingerprint_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:16]
    return bounds, geometry, sample_geometry, fingerprint


def _scene_time(item: dict) -> datetime:
    props = item.get("properties") if isinstance(item.get("properties"), dict) else {}
    raw = props.get("datetime")
    try:
        if not isinstance(raw, str):
            raise ValueError()
        when = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        if when.tzinfo is None or when > datetime.now(timezone.utc):
            raise ValueError()
    except (ValueError, TypeError):
        api_error(502, "REMOTE_PROVIDER_INVALID_RESPONSE", "Scene has no trustworthy acquisition timestamp")
    return when


@router.get("/automation/status")
def parcel_automation_status(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Organization-scoped proof that the backend automation is actually running."""
    from ..field_automation_runtime import runtime as field_runtime

    eligible = db.scalar(
        select(func.count()).select_from(AgriParcel).where(
            AgriParcel.org_id == user.org_id,
            AgriParcel.archived.is_(False),
            AgriParcel.is_demo.is_(False),
        )
    ) or 0
    stored = db.scalar(
        select(func.count()).select_from(AgriObservation).where(
            AgriObservation.org_id == user.org_id,
            AgriObservation.source_type == "satellite",
            AgriObservation.source_ref.like("automation:%"),
        )
    ) or 0
    latest = db.scalar(
        select(func.max(AgriObservation.observed_at)).where(
            AgriObservation.org_id == user.org_id,
            AgriObservation.source_type == "satellite",
            AgriObservation.source_ref.like("automation:%"),
        )
    )
    return {
        "enabled": config.FIELD_AUTOMATION_ENABLED,
        "interval_seconds": config.FIELD_AUTOMATION_INTERVAL_SECONDS,
        "lookback_days": config.FIELD_AUTOMATION_LOOKBACK_DAYS,
        "cloud_cover_lte": config.FIELD_AUTOMATION_CLOUD_COVER_LTE,
        "eligible_parcels": int(eligible),
        "stored_automated_observations": int(stored),
        "latest_observation_at": latest,
        "runtime": dict(field_runtime),
        "provider": PROVIDER,
        "indices": list(PERSISTABLE_INDICES),
        "evidence_status": "INFERRED",
        "field_execution": False,
    }


@router.get("/parcels/{identity}/remote-sensing/scenes")
def parcel_scenes(
    identity: int,
    start: date = Query(...),
    end: date = Query(...),
    cloud_cover_lte: float = Query(default=30.0, ge=0, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    parcel = own(db, AgriParcel, identity, user)
    if parcel.archived:
        api_error(409, "PARCEL_ARCHIVED", "Parcel is archived")
    bbox, _geometry, sample_geometry, _fingerprint = _analysis_target(parcel)
    result = catalog_scenes(
        bbox=",".join(str(value) for value in bbox),
        start=start,
        end=end,
        cloud_cover_lte=cloud_cover_lte,
        limit=12,
        _user=user,
    )
    return {
        **result,
        "parcel_id": parcel.id,
        "sample_bbox_wgs84": bbox,
        "sample_geometry": sample_geometry,
        "stored": False,
    }



@router.get("/parcels/{identity}/remote-sensing/statistics")
def parcel_index_statistics(
    identity: int,
    scene_id: str = Query(..., min_length=3, max_length=120),
    index: str = Query(..., pattern=SUPPORTED_INDEX_PATTERN),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    parcel = own(db, AgriParcel, identity, user)
    if parcel.archived:
        api_error(409, "PARCEL_ARCHIVED", "Parcel is archived")
    bounds, geometry, sample_geometry, analysis_fingerprint = _analysis_target(parcel)
    from ..services.remote_sensing_processing import validate_scene_id
    try:
        safe_scene_id = validate_scene_id(scene_id)
    except ProcessingPlanError:
        api_error(422, "INVALID_SCENE_ID", "Scene ID is invalid")

    _, item = _provider_item(safe_scene_id)
    try:
        plan = build_processing_plan(item, index)
        stats = compute_index_statistics(plan, bounds, geometry_wgs84=geometry)
    except ProcessingPlanError:
        api_error(502, "REMOTE_PROVIDER_INVALID_RESPONSE", "Scene is missing trusted analysis assets")
    except RasterCapacityError:
        api_error(429, "RASTER_ANALYSIS_BUSY", "Raster capacity busy; retry later")
    except RasterStatisticsError:
        api_error(502, "REMOTE_RASTER_UNAVAILABLE", "Raster analysis could not be completed")

    return {
        **stats,
        "parcel_id": parcel.id,
        "sample_bbox_wgs84": bounds,
        "sample_geometry": sample_geometry,
        "analysis_fingerprint": analysis_fingerprint,
        "stored": False,
    }


@router.get("/parcels/{identity}/remote-sensing/preview.png")
def parcel_index_preview(
    identity: int,
    scene_id: str = Query(..., min_length=3, max_length=120),
    index: str = Query(..., pattern=SUPPORTED_INDEX_PATTERN),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    parcel = own(db, AgriParcel, identity, user)
    if parcel.archived:
        api_error(409, "PARCEL_ARCHIVED", "Parcel is archived")
    bounds, geometry, sample_geometry, _analysis_fingerprint = _analysis_target(parcel)
    from ..services.remote_sensing_processing import validate_scene_id
    try:
        safe_scene_id = validate_scene_id(scene_id)
    except ProcessingPlanError:
        api_error(422, "INVALID_SCENE_ID", "Scene ID is invalid")

    _, item = _provider_item(safe_scene_id)
    try:
        plan = build_processing_plan(item, index)
        png, metadata = render_index_preview_png(
            plan,
            bounds,
            geometry_wgs84=geometry,
        )
    except ProcessingPlanError:
        api_error(502, "REMOTE_PROVIDER_INVALID_RESPONSE", "Scene is missing trusted analysis assets")
    except RasterCapacityError:
        api_error(429, "RASTER_ANALYSIS_BUSY", "Raster capacity busy; retry later")
    except RasterStatisticsError:
        api_error(502, "REMOTE_RASTER_UNAVAILABLE", "Raster preview could not be completed")

    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Cache-Control": "private, no-store",
            "X-FOGGARA-Parcel": str(parcel.id),
            "X-FOGGARA-Scene": str(metadata["scene_id"]),
            "X-FOGGARA-Index": str(metadata["index"]),
            "X-FOGGARA-Evidence": "COMPUTED",
            "X-FOGGARA-Verified": "false",
            "X-FOGGARA-Geometry": sample_geometry,
        },
    )


@router.get("/parcels/{identity}/remote-sensing/true-color.png")
def parcel_true_color_preview(
    identity: int,
    scene_id: str = Query(..., min_length=3, max_length=120),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    parcel = own(db, AgriParcel, identity, user)
    if parcel.archived:
        api_error(409, "PARCEL_ARCHIVED", "Parcel is archived")
    bounds, geometry, sample_geometry, _analysis_fingerprint = _analysis_target(parcel)
    from ..services.remote_sensing_processing import validate_scene_id
    try:
        safe_scene_id = validate_scene_id(scene_id)
    except ProcessingPlanError:
        api_error(422, "INVALID_SCENE_ID", "Scene ID is invalid")

    _, item = _provider_item(safe_scene_id)
    try:
        plan = build_true_color_plan(item)
        png, metadata = render_true_color_preview_png(
            plan,
            bounds,
            geometry_wgs84=geometry,
        )
    except ProcessingPlanError:
        api_error(502, "REMOTE_PROVIDER_INVALID_RESPONSE", "Scene is missing trusted true-color assets")
    except RasterCapacityError:
        api_error(429, "RASTER_ANALYSIS_BUSY", "Raster capacity busy; retry later")
    except RasterStatisticsError:
        api_error(502, "REMOTE_RASTER_UNAVAILABLE", "True-color preview could not be completed")

    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Cache-Control": "private, no-store",
            "X-FOGGARA-Parcel": str(parcel.id),
            "X-FOGGARA-Scene": str(metadata["scene_id"]),
            "X-FOGGARA-Product": "true_color",
            "X-FOGGARA-Evidence": "OBSERVED",
            "X-FOGGARA-Display": "COMPUTED",
            "X-FOGGARA-Verified": "false",
            "X-FOGGARA-Geometry": sample_geometry,
        },
    )


@router.post("/parcels/{identity}/remote-sensing/analyze", status_code=201)
def analyze_parcel(
    identity: int,
    payload: AnalyzeIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    parcel = own(db, AgriParcel, identity, user)
    if parcel.archived:
        api_error(409, "PARCEL_ARCHIVED", "Parcel is archived")
    bounds, geometry, sample_geometry, analysis_fingerprint = _analysis_target(parcel)
    # Only fixed provider item URLs can be used; arbitrary URLs from the client
    # cannot reach Rasterio or HTTPX.
    from ..services.remote_sensing_processing import validate_scene_id
    try:
        scene_id = validate_scene_id(payload.scene_id)
    except ProcessingPlanError:
        api_error(422, "INVALID_SCENE_ID", "Scene ID is invalid")
    index_key = payload.index
    computation = f"SENTINEL_SCL_MASKED_{index_key.upper()}"
    source_ref = f"{PROVIDER}:{scene_id}:{index_key}:{analysis_fingerprint}"
    prior = db.scalar(select(AgriObservation).where(
        AgriObservation.org_id == user.org_id,
        AgriObservation.parcel_id == parcel.id,
        AgriObservation.metric == index_key,
        AgriObservation.source_type == "satellite",
        AgriObservation.source_ref == source_ref,
    ))
    if prior is not None:
        return {
            "created": False, "observation": out(prior),
            "provenance": "INFERRED", "computation": computation,
            "sample_geometry": sample_geometry, "analysis_fingerprint": analysis_fingerprint,
        }

    _, item = _provider_item(scene_id)
    acquired_at = _scene_time(item)
    try:
        plan = build_processing_plan(item, index_key)
        stats = compute_index_statistics(plan, bounds, geometry_wgs84=geometry)
    except ProcessingPlanError:
        api_error(502, "REMOTE_PROVIDER_INVALID_RESPONSE", "Scene is missing trusted analysis assets")
    except RasterCapacityError:
        api_error(429, "RASTER_ANALYSIS_BUSY", "Raster capacity busy; retry later")
    except RasterStatisticsError:
        api_error(502, "REMOTE_RASTER_UNAVAILABLE", "Raster analysis could not be completed")

    pixels = stats.get("pixels") or {}
    values = stats.get("statistics") or {}
    mean = values.get("mean")
    fraction = float(pixels.get("valid_fraction") or 0)
    count = int(pixels.get("valid") or 0)
    lower, upper = PERSISTABLE_INDEX_BOUNDS[index_key]
    if (
        count < MIN_VALID_PIXELS or fraction < MIN_VALID_FRACTION
        or not isinstance(mean, (float, int)) or not math.isfinite(mean)
        or not (lower <= mean <= upper)
    ):
        api_error(422, "LOW_QUALITY_SATELLITE_SCENE", "Cloud or no-data mask leaves insufficient pixels")

    row = AgriObservation(
        org_id=user.org_id, parcel_id=parcel.id, metric=index_key,
        value=round(float(mean), 6), unit=METRICS[index_key][0],
        source_type="satellite", source_ref=source_ref, observed_at=acquired_at,
        evidence_status="INFERRED", created_by=user.id, is_demo=False,
    )
    db.add(row)
    db.flush()
    audit(db, user, "sentinel_index_computed", "agri_observations", entity_id=row.id,
          meta={
              "parcel_id": parcel.id, "scene_id": scene_id, "provider": PROVIDER,
              "index": index_key, "algorithm": computation,
              "processing_plan_fingerprint": stats.get("processing_plan_fingerprint"),
              "valid_fraction": fraction, "valid_pixels": count,
              "total_pixels": int(pixels.get("total") or 0),
              "sample_bbox_wgs84": bounds,
              "sample_geometry": sample_geometry,
              "analysis_fingerprint": analysis_fingerprint,
              "computation_provenance": "COMPUTED",
              "evidence_status": "INFERRED",
              "field_validated": False,
              "effective_source_resolution_m": (stats.get("grid") or {}).get("effective_source_resolution_m"),
              "resampled": (stats.get("grid") or {}).get("resampled"),
          })
    db.commit()
    return {
        "created": True, "observation": out(row), "statistics": stats,
        "provenance": "INFERRED", "computation": computation,
        "sample_geometry": sample_geometry, "analysis_fingerprint": analysis_fingerprint,
    }
