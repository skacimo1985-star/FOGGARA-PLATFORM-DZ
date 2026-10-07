"""Sentinel-2 catalogue-to-record bridge for real agricultural parcels.

Reuses FOGGARA's vetted Element84 Earth Search + Rasterio/SCL computation.
A point-centred sample is NOT a mapped field polygon or a verified field measurement.
"""
from datetime import date, datetime, timezone
import hashlib
import json
import math

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from typing import Literal
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import AgriObservation, AgriParcel, User
from ..services.parcel_geometry import ParcelGeometryError, normalize_parcel_boundary
from ..services.remote_sensing_processing import ProcessingPlanError, build_processing_plan
from ..services.remote_sensing_raster import (
    RasterCapacityError,
    RasterStatisticsError,
    compute_index_statistics,
    validate_analysis_bbox,
)
from .agriculture_operations import METRICS, out, own
from .remote_sensing_catalog import _provider_item, catalog_scenes

router = APIRouter(prefix="/api/agriculture", tags=["parcel-sentinel"])

PROVIDER = "element84-earth-search"
MIN_VALID_FRACTION = 0.35
MIN_VALID_PIXELS = 9


class AnalyzeIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    scene_id: str = Field(min_length=3, max_length=120)
    index: Literal["ndvi", "evi", "savi", "ndwi"] = "ndvi"


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
            "provenance": "INFERRED", "computation": f"SENTINEL_SCL_MASKED_{index_key.upper()}",
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
    if (
        count < MIN_VALID_PIXELS or fraction < MIN_VALID_FRACTION
        or not isinstance(mean, (float, int)) or not math.isfinite(mean)
        or not (METRICS[index_key][1] <= mean <= METRICS[index_key][2])
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
              "index": index_key, "algorithm": f"SENTINEL_SCL_MASKED_{index_key.upper()}",
              "processing_plan_fingerprint": stats.get("processing_plan_fingerprint"),
              "valid_fraction": fraction, "valid_pixels": count,
              "total_pixels": int(pixels.get("total") or 0),
              "sample_bbox_wgs84": bounds,
              "sample_geometry": sample_geometry,
              "analysis_fingerprint": analysis_fingerprint,
              "computation_provenance": "COMPUTED",
              "evidence_status": "INFERRED",
              "field_validated": False,
          })
    db.commit()
    return {
        "created": True, "observation": out(row), "statistics": stats,
        "provenance": "INFERRED", "computation": f"SENTINEL_SCL_MASKED_{index_key.upper()}",
        "sample_geometry": sample_geometry, "analysis_fingerprint": analysis_fingerprint,
    }
