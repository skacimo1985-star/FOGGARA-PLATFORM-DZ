"""Sentinel-2 catalogue-to-record bridge for real agricultural parcels.

Reuses FOGGARA's vetted Element84 Earth Search + Rasterio/SCL computation.
A point-centred sample is NOT a mapped field polygon or a verified field measurement.
"""
from datetime import date, datetime, timezone
import math

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import AgriObservation, AgriParcel, User
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


def _sample_bbox(parcel: AgriParcel) -> list[float]:
    """Bounded approximate square around recorded parcel centroid (not field geometry)."""
    if parcel.lat is None or parcel.lon is None:
        api_error(422, "PARCEL_COORDINATES_REQUIRED", "Set parcel coordinates before satellite analysis")
    lat, lon = float(parcel.lat), float(parcel.lon)
    area = float(parcel.area_ha)
    if not all(math.isfinite(x) for x in (lat, lon, area)) or area <= 0:
        api_error(422, "INVALID_PARCEL_GEOMETRY", "Parcel position or area is invalid")
    # The parcel schema stores a centroid rather than a polygon. Bound requests
    # to a 500 m sample to respect free-host memory and raster pixel budgets.
    half_width_m = max(40.0, min(250.0, math.sqrt(area * 10_000.0) / 2))
    lat_deg = half_width_m / 111_320.0
    lon_deg = half_width_m / (111_320.0 * max(0.15, abs(math.cos(math.radians(lat)))))
    west, east = lon - lon_deg, lon + lon_deg
    south, north = lat - lat_deg, lat + lat_deg
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        api_error(422, "INVALID_PARCEL_GEOMETRY", "Analysis sample crosses geographic bounds")
    bounds = [west, south, east, north]
    try:
        validate_analysis_bbox(bounds)
    except RasterStatisticsError:
        api_error(422, "INVALID_PARCEL_GEOMETRY", "Parcel sample exceeds analysis limits")
    return bounds


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
    bbox = _sample_bbox(parcel)
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
        "sample_geometry": "POINT_CENTERED_ESTIMATE_NOT_PARCEL_BOUNDARY",
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
    bounds = _sample_bbox(parcel)
    # Only fixed provider item URLs can be used; arbitrary URLs from the client
    # cannot reach Rasterio or HTTPX.
    from ..services.remote_sensing_processing import validate_scene_id
    try:
        scene_id = validate_scene_id(payload.scene_id)
    except ProcessingPlanError:
        api_error(422, "INVALID_SCENE_ID", "Scene ID is invalid")
    source_ref = f"{PROVIDER}:{scene_id}:ndvi"
    prior = db.scalar(select(AgriObservation).where(
        AgriObservation.org_id == user.org_id,
        AgriObservation.parcel_id == parcel.id,
        AgriObservation.metric == "ndvi",
        AgriObservation.source_type == "satellite",
        AgriObservation.source_ref == source_ref,
    ))
    if prior is not None:
        return {
            "created": False, "observation": out(prior),
            "provenance": "INFERRED", "computation": "SENTINEL_SCL_MASKED_NDVI",
            "sample_geometry": "POINT_CENTERED_ESTIMATE_NOT_PARCEL_BOUNDARY",
        }

    _, item = _provider_item(scene_id)
    acquired_at = _scene_time(item)
    try:
        plan = build_processing_plan(item, "ndvi")
        stats = compute_index_statistics(plan, bounds)
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
        or not (-1 <= mean <= 1)
    ):
        api_error(422, "LOW_QUALITY_SATELLITE_SCENE", "Cloud or no-data mask leaves insufficient pixels")

    row = AgriObservation(
        org_id=user.org_id, parcel_id=parcel.id, metric="ndvi",
        value=round(float(mean), 6), unit=METRICS["ndvi"][0],
        source_type="satellite", source_ref=source_ref, observed_at=acquired_at,
        evidence_status="INFERRED", created_by=user.id, is_demo=False,
    )
    db.add(row)
    db.flush()
    audit(db, user, "sentinel_index_computed", "agri_observations", entity_id=row.id,
          meta={
              "parcel_id": parcel.id, "scene_id": scene_id, "provider": PROVIDER,
              "index": "ndvi", "algorithm": "SENTINEL_SCL_MASKED_NDVI",
              "processing_plan_fingerprint": stats.get("processing_plan_fingerprint"),
              "valid_fraction": fraction, "valid_pixels": count,
              "total_pixels": int(pixels.get("total") or 0),
              "sample_bbox_wgs84": bounds,
              "sample_geometry": "POINT_CENTERED_ESTIMATE_NOT_PARCEL_BOUNDARY",
              "computation_provenance": "COMPUTED",
              "evidence_status": "INFERRED",
              "field_validated": False,
          })
    db.commit()
    return {
        "created": True, "observation": out(row), "statistics": stats,
        "provenance": "INFERRED", "computation": "SENTINEL_SCL_MASKED_NDVI",
        "sample_geometry": "POINT_CENTERED_ESTIMATE_NOT_PARCEL_BOUNDARY",
    }
