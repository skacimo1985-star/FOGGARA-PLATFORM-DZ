"""Read-only live satellite catalogue adapter.

Uses a fixed public STAC provider endpoint. It never accepts arbitrary provider URLs,
never stores provider data, and never upgrades satellite inference to verified evidence.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
import math

import httpx
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db

from ..deps import api_error, get_current_user
from ..models import AgriParcel, User
from ..services.remote_sensing_indices import public_index_definitions
from ..services.field_intelligence import public_field_capabilities, resolve_crop_profile
from ..services.isda_soil_context import sample_soil_context
from ..services.remote_sensing_methodology import (
    acquisition_age_hours,
    operational_quality_indicator,
    public_methodology,
)
from ..services.remote_sensing_processing import (
    ProcessingPlanError,
    build_multi_index_plan,
    build_processing_plan,
    build_true_color_plan,
    item_url,
    validate_scene_id,
)
from ..services.remote_sensing_raster import (
    RasterCapacityError,
    RasterStatisticsError,
    compute_index_statistics,
    compute_multi_index_statistics,
    render_index_preview_png,
    render_true_color_preview_png,
    validate_analysis_bbox,
)

router = APIRouter(prefix="/api/remote-sensing", tags=["remote-sensing"])

EARTH_SEARCH_SEARCH_URL = "https://earth-search.aws.element84.com/v1/search"
EARTH_SEARCH_ROOT = "https://earth-search.aws.element84.com/v1"
COPERNICUS_STAC_ROOT = "https://stac.dataspace.copernicus.eu/v1/"
SENTINEL_COLLECTION = "sentinel-2-l2a"
SUPPORTED_INDEX_PATTERN = "^(bsi|evi|lswi|ndmi|ndvi|ndwi|savi)$"


def _parse_bbox(raw: str) -> list[float]:
    try:
        values = [float(part.strip()) for part in raw.split(",")]
    except ValueError:
        api_error(422, "INVALID_BBOX", "bbox must contain four numeric coordinates")
    if len(values) != 4:
        api_error(422, "INVALID_BBOX", "bbox must contain four coordinates")
    if not all(math.isfinite(value) for value in values):
        api_error(422, "INVALID_BBOX", "bbox must contain four finite coordinates")
    west, south, east, north = values
    if not (-180 <= west <= 180 and -180 <= east <= 180 and -90 <= south <= north <= 90):
        api_error(422, "INVALID_BBOX", "bbox is outside WGS84 bounds or has invalid latitude ordering")
    if west == east:
        api_error(422, "INVALID_BBOX", "bbox longitude span must be greater than zero")
    return values


def _valid_position(value) -> bool:
    return (
        isinstance(value, list)
        and len(value) >= 2
        and all(isinstance(coord, (int, float)) and not isinstance(coord, bool) and math.isfinite(coord) for coord in value[:2])
        and -180 <= float(value[0]) <= 180
        and -90 <= float(value[1]) <= 90
    )


def _valid_ring(value) -> bool:
    return isinstance(value, list) and len(value) >= 4 and all(_valid_position(position) for position in value)


def _sanitize_geometry(value):
    if not isinstance(value, dict):
        return None
    geometry_type = value.get("type")
    coordinates = value.get("coordinates")
    if geometry_type == "Polygon":
        if not isinstance(coordinates, list) or not coordinates or not all(_valid_ring(ring) for ring in coordinates):
            return None
    elif geometry_type == "MultiPolygon":
        if (
            not isinstance(coordinates, list)
            or not coordinates
            or not all(
                isinstance(polygon, list)
                and polygon
                and all(_valid_ring(ring) for ring in polygon)
                for polygon in coordinates
            )
        ):
            return None
    else:
        return None
    return {"type": geometry_type, "coordinates": coordinates}


def _scene_from_feature(feature: dict) -> dict:
    props = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
    geometry = _sanitize_geometry(feature.get("geometry"))

    raw_bbox = feature.get("bbox")
    bbox = None
    if isinstance(raw_bbox, list) and len(raw_bbox) >= 4:
        try:
            candidate = [float(raw_bbox[i]) for i in range(4)]
            if all(math.isfinite(value) for value in candidate):
                bbox = candidate
        except (TypeError, ValueError):
            bbox = None

    self_href = None
    for link in feature.get("links") or []:
        if isinstance(link, dict) and link.get("rel") == "self":
            href = link.get("href")
            if isinstance(href, str) and href.startswith("https://"):
                self_href = href
                break

    assets = feature.get("assets") if isinstance(feature.get("assets"), dict) else {}
    asset_keys = sorted(str(key) for key in assets.keys())[:40]

    return {
        "id": str(feature.get("id") or ""),
        "collection": str(feature.get("collection") or SENTINEL_COLLECTION),
        "datetime": props.get("datetime"),
        "cloud_cover_pct": props.get("eo:cloud_cover"),
        "platform": props.get("platform"),
        "constellation": props.get("constellation"),
        "bbox": bbox,
        "geometry": geometry,
        "asset_keys": asset_keys,
        "stac_item_url": self_href,
        "provider": "element84-earth-search",
        "provenance": "OBSERVED_PROVIDER_METADATA",
    }




def _earth_search_features(
    search_bbox: list[float],
    start: date,
    end: date,
    cloud_cover_lte: float,
    limit: int,
) -> list[dict]:
    payload = {
        "collections": [SENTINEL_COLLECTION],
        "bbox": search_bbox,
        "datetime": f"{start.isoformat()}T00:00:00Z/{end.isoformat()}T23:59:59Z",
        "query": {"eo:cloud_cover": {"lte": cloud_cover_lte}},
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
        "limit": limit,
    }
    try:
        timeout = httpx.Timeout(12.0, connect=5.0)
        with httpx.Client(timeout=timeout, follow_redirects=False) as client:
            response = client.post(
                EARTH_SEARCH_SEARCH_URL,
                json=payload,
                headers={"Accept": "application/geo+json", "User-Agent": "FOGGARA-DZ/remote-sensing"},
            )
            response.raise_for_status()
            body = response.json()
    except (httpx.HTTPError, ValueError):
        api_error(502, "REMOTE_PROVIDER_UNAVAILABLE", "Satellite catalogue provider is unavailable")

    features = body.get("features") if isinstance(body, dict) else None
    if not isinstance(features, list):
        api_error(502, "REMOTE_PROVIDER_INVALID_RESPONSE", "Satellite catalogue returned an invalid response")
    return [feature for feature in features if isinstance(feature, dict)]


def _study_pixel_budget(raw_bbox: list[float]) -> int:
    west, south, east, north = raw_bbox
    mid_lat = math.radians((south + north) / 2.0)
    width_m = (east - west) * 111_320.0 * max(math.cos(mid_lat), 0.01)
    height_m = (north - south) * 110_574.0
    width = max(1, math.ceil(width_m / 10.0))
    height = max(1, math.ceil(height_m / 10.0))
    return width * height


def _parse_scene_datetime(value) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _trend_summary(series: list[dict]) -> dict:
    points = []
    for row in series:
        acquired = _parse_scene_datetime(row.get("datetime"))
        mean = row.get("statistics", {}).get("mean")
        if acquired is None or not isinstance(mean, (int, float)) or isinstance(mean, bool) or not math.isfinite(float(mean)):
            continue
        points.append((acquired, float(mean)))
    points.sort(key=lambda pair: pair[0])
    if len(points) < 2:
        return {
            "scene_count": len(points),
            "direction": "insufficient_data",
            "delta": None,
            "slope_per_day": None,
            "interpretation_status": "INFERRED",
        }

    origin = points[0][0]
    xs = [(when - origin).total_seconds() / 86400.0 for when, _value in points]
    ys = [value for _when, value in points]
    x_mean = sum(xs) / len(xs)
    y_mean = sum(ys) / len(ys)
    denominator = sum((x - x_mean) ** 2 for x in xs)
    slope = None if denominator <= 1e-12 else sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys)) / denominator
    delta = ys[-1] - ys[0]
    if slope is None or abs(slope) <= 1e-6:
        direction = "stable"
    elif slope > 0:
        direction = "increasing"
    else:
        direction = "decreasing"
    return {
        "scene_count": len(points),
        "direction": direction,
        "delta": round(delta, 6),
        "slope_per_day": None if slope is None else round(slope, 8),
        "first_mean": round(ys[0], 6),
        "last_mean": round(ys[-1], 6),
        "interpretation_status": "INFERRED",
        "note": "Mathematical temporal direction only; not an agronomic diagnosis.",
    }


def _provider_item(scene_id: str) -> tuple[str, dict]:
    try:
        safe_scene_id = validate_scene_id(scene_id)
        provider_url = item_url(safe_scene_id)
    except ProcessingPlanError as exc:
        api_error(422, "INVALID_SCENE_ID", str(exc))

    try:
        timeout = httpx.Timeout(12.0, connect=5.0)
        with httpx.Client(timeout=timeout, follow_redirects=False) as client:
            response = client.get(
                provider_url,
                headers={"Accept": "application/geo+json", "User-Agent": "FOGGARA-DZ/remote-sensing"},
            )
            response.raise_for_status()
            item = response.json()
    except (httpx.HTTPError, ValueError):
        api_error(502, "REMOTE_PROVIDER_UNAVAILABLE", "Satellite catalogue provider is unavailable")

    if not isinstance(item, dict):
        api_error(502, "REMOTE_PROVIDER_INVALID_RESPONSE", "Satellite catalogue returned an invalid item")
    if item.get("id") != safe_scene_id or item.get("collection") != SENTINEL_COLLECTION:
        api_error(502, "REMOTE_PROVIDER_INVALID_RESPONSE", "Satellite catalogue item identity is invalid")
    return safe_scene_id, item


@router.get("/catalog/scenes")
def catalog_scenes(
    bbox: str = Query(..., min_length=7, max_length=160),
    start: date = Query(...),
    end: date = Query(...),
    cloud_cover_lte: float = Query(default=30, ge=0, le=100),
    limit: int = Query(default=20, ge=1, le=50),
    _user: User = Depends(get_current_user),
):
    if start > end:
        api_error(422, "INVALID_DATE_RANGE", "start date must not be after end date")
    if (end - start).days > 366:
        api_error(422, "DATE_RANGE_TOO_LARGE", "catalog search is limited to 366 days")

    search_bbox = _parse_bbox(bbox)
    features = _earth_search_features(search_bbox, start, end, cloud_cover_lte, limit)
    scenes = [_scene_from_feature(feature) for feature in features]
    scenes = [scene for scene in scenes if scene["id"] and scene["geometry"] is not None]
    return {
        "provider": "Element 84 Earth Search",
        "collection": SENTINEL_COLLECTION,
        "live": True,
        "stored": False,
        "evidence_status": "PROVIDER_METADATA",
        "count": len(scenes),
        "scenes": scenes,
    }




@router.get("/field-intelligence/capabilities")
def field_intelligence_capabilities(_user: User = Depends(get_current_user)):
    return public_field_capabilities()


@router.get("/studies/field-intelligence")
def field_intelligence_study(
    start: date = Query(...),
    end: date = Query(...),
    bbox: str | None = Query(default=None, min_length=7, max_length=160),
    parcel_id: int | None = Query(default=None, gt=0),
    scene_id: str | None = Query(default=None, min_length=6, max_length=180),
    crop: str = Query(default="", max_length=120),
    cloud_cover_lte: float = Query(default=30, ge=0, le=100),
    include_soil: bool = Query(default=True),
    _user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if start > end:
        api_error(422, "INVALID_DATE_RANGE", "start date must not be after end date")
    if (end - start).days > 366:
        api_error(422, "DATE_RANGE_TOO_LARGE", "field intelligence is limited to 366 days")

    # Saved parcels are resolved on the server from the signed-in tenant.
    # The client cannot override stored geometry with a forged rectangle.
    geometry = None
    sample_geometry = "AOI_BOUNDING_BOX"
    source_parcel_id = None
    resolved_crop = crop
    if parcel_id is not None:
        parcel = db.scalar(select(AgriParcel).where(
            AgriParcel.id == parcel_id,
            AgriParcel.org_id == _user.org_id,
        ))
        if parcel is None:
            api_error(404, "NOT_FOUND", "Parcel not found")
        if parcel.archived:
            api_error(409, "PARCEL_ARCHIVED", "Parcel is archived")
        from .satellite_parcels import _analysis_target
        raw_bbox, geometry, sample_geometry, _fingerprint = _analysis_target(parcel)
        source_parcel_id = parcel.id
        resolved_crop = parcel.crop
        db.rollback()  # free DB transaction before external raster IO
    else:
        if bbox is None:
            api_error(422, "ANALYSIS_TARGET_REQUIRED", "Select a saved parcel or analysis area")
        raw_bbox = _parse_bbox(bbox)
    try:
        validate_analysis_bbox(raw_bbox)
    except RasterStatisticsError as exc:
        api_error(422, "RASTER_ANALYSIS_BOUNDS_INVALID", str(exc))

    estimated_pixels = _study_pixel_budget(raw_bbox)
    if estimated_pixels > 250_000:
        api_error(
            422,
            "FIELD_INTELLIGENCE_AREA_TOO_LARGE",
            "Analyze All is limited to about 250,000 10 m pixels; select a smaller field AOI.",
        )

    capabilities = public_field_capabilities()
    features = _earth_search_features(raw_bbox, start, end, cloud_cover_lte, 12)
    if scene_id:
        # Selection is permitted only among scenes from the trusted STAC response.
        features = [feature for feature in features if feature.get("id") == scene_id]
    selected_feature = None
    selected_plan = None
    selected_scene = None
    skipped = []
    for feature in features:
        scene = _scene_from_feature(feature)
        if not scene.get("id") or scene.get("geometry") is None:
            continue
        try:
            plan = build_multi_index_plan(feature)
        except ProcessingPlanError:
            skipped.append({"scene_id": scene.get("id"), "reason": "required_bands_unavailable"})
            continue
        selected_feature = feature
        selected_plan = plan
        selected_scene = scene
        break

    if selected_feature is None or selected_plan is None or selected_scene is None:
        return {
            "status": "NO_USABLE_SCENE",
            "bbox_wgs84": raw_bbox,
            "parcel_id": source_parcel_id,
            "sample_geometry": sample_geometry,
            "geometry_mask_applied": False,
            "period": {"start": start.isoformat(), "end": end.isoformat()},
            "crop_profile": resolve_crop_profile(resolved_crop),
            "scene": None,
            "domains": {},
            "soil_context": None,
            "global_sources": capabilities["global_projects"],
            "skipped": skipped,
            "evidence": {"verified": False},
        }

    try:
        spectral = (compute_multi_index_statistics(selected_plan, raw_bbox, geometry_wgs84=geometry)
                    if geometry is not None else compute_multi_index_statistics(selected_plan, raw_bbox))
    except RasterCapacityError:
        api_error(429, "RASTER_ANALYSIS_BUSY", "Field-intelligence raster capacity is busy; retry later")
    except RasterStatisticsError as exc:
        api_error(502, "REMOTE_RASTER_UNAVAILABLE", str(exc))

    if geometry is not None and not spectral.get("mask", {}).get("geometry_mask_applied"):
        api_error(502, "PARCEL_MASK_MISSING", "Raster did not apply the saved parcel boundary mask")

    indices = spectral["indices"]
    ndvi_valid = float(indices.get("ndvi", {}).get("pixels", {}).get("valid_fraction") or 0.0)
    quality = operational_quality_indicator(ndvi_valid, selected_scene.get("cloud_cover_pct"))
    soil = sample_soil_context(raw_bbox) if include_soil else None
    profile = resolve_crop_profile(resolved_crop)

    domains = {
        "vegetation": {
            "status": "COMPUTED",
            "indices": {key: indices[key] for key in ("ndvi", "evi", "savi") if key in indices},
            "interpretation": "Screen canopy greenness/vigor; not a diagnosis of disease, nutrient deficiency or yield.",
        },
        "canopy_moisture": {
            "status": "COMPUTED",
            "indices": {key: indices[key] for key in ("ndmi", "lswi") if key in indices},
            "interpretation": "Moisture-related spectral response; not an absolute soil-moisture measurement.",
        },
        "surface_water": {
            "status": "COMPUTED",
            "indices": {key: indices[key] for key in ("ndwi",) if key in indices},
            "interpretation": "Surface-water screening within the field AOI.",
        },
        "soil_surface": {
            "status": "COMPUTED",
            "indices": {key: indices[key] for key in ("bsi",) if key in indices},
            "interpretation": "Bare/exposed soil screening from Sentinel-2 reflectance.",
        },
        "soil_context": {
            "status": "INFERRED" if soil and soil.get("available_properties") else "UNAVAILABLE",
            "provider": None if soil is None else soil.get("provider"),
            "context": soil,
            "interpretation": "Spatial soil-model context only; verified laboratory measurements remain authoritative.",
        },
        "crop": {
            "status": profile["crop_identity_status"],
            "profile": profile,
            "interpretation": "Crop profile guides monitoring emphasis; it does not classify crop identity from Sentinel-2.",
        },
    }

    return {
        "status": "READY",
        "study_type": "field_intelligence_snapshot",
        "bbox_wgs84": raw_bbox,
        "parcel_id": source_parcel_id,
        "sample_geometry": sample_geometry,
        "geometry_mask_applied": bool(spectral.get("mask", {}).get("geometry_mask_applied")),

        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "crop_profile": profile,
        "scene": {
            **selected_scene,
            "acquisition_age_hours": acquisition_age_hours(selected_scene.get("datetime")),
        },
        "quality_indicator": quality,
        "spectral_processing": {
            "grid": spectral["grid"],
            "mask": spectral["mask"],
            "processing_plan_fingerprint": spectral["processing_plan_fingerprint"],
        },
        "domains": domains,
        "soil_context": soil,
        "global_sources": capabilities["global_projects"],
        "skipped": skipped,
        "follow_up": {
            "time_series": "/api/remote-sensing/studies/timeseries",
            "true_color": f"/api/remote-sensing/catalog/scenes/{selected_scene['id']}/true-color.png",
            "index_preview": f"/api/remote-sensing/catalog/scenes/{selected_scene['id']}/preview.png",
        },
        "evidence": {
            "satellite_scene": "OBSERVED",
            "spectral_indices": "COMPUTED",
            "soil_spatial_model": "INFERRED" if soil else "MISSING",
            "crop_identity": profile["crop_identity_status"],
            "agronomic_interpretation": "INFERRED",
            "verified": False,
        },
        "limitations": [
            "No spectral result is automatically upgraded to VERIFIED.",
            "Soil model context uses bounding-area sampling; it is not a laboratory-certified polygon measurement.",
            "N/P/K/pH prescriptions require validated soil measurements or a separately validated chemical-soil provider contract.",
            "Individual date-palm counting requires validated very-high-resolution imagery, not Sentinel-2 alone.",
        ],
    }


@router.get("/providers")
def remote_sensing_providers(_user: User = Depends(get_current_user)):
    return {
        "operational": [
            {
                "id": "element84-earth-search",
                "name": "Element 84 Earth Search",
                "stac_root": EARTH_SEARCH_ROOT,
                "collection": SENTINEL_COLLECTION,
                "analysis_ready": True,
                "raster_access": "public Sentinel-2 L2A Cloud Optimized GeoTIFFs",
                "role": "live discovery and raster computation",
                "evidence_status": "OBSERVED",
            }
        ],
        "reference_catalogs": [
            {
                "id": "copernicus-data-space",
                "name": "Copernicus Data Space Ecosystem STAC",
                "stac_root": COPERNICUS_STAC_ROOT,
                "collection": "sentinel-2-l2a",
                "analysis_ready_in_foggara": False,
                "role": "official Copernicus discovery/reference catalog",
                "note": "FOGGARA does not claim operational raster processing from this provider until its access path is separately validated.",
            }
        ],
        "research_targets": [
            {
                "id": "nasa-hls",
                "name": "NASA Harmonized Landsat Sentinel-2 (HLS)",
                "status": "planned_not_operational",
                "resolution_m": 30,
                "role": "future 2-3 day harmonized Landsat/Sentinel time series",
            }
        ],
    }


@router.get("/methodology")
def remote_sensing_methodology(_user: User = Depends(get_current_user)):
    return public_methodology()


@router.get("/studies/timeseries")
def study_timeseries(
    bbox: str = Query(..., min_length=7, max_length=160),
    start: date = Query(...),
    end: date = Query(...),
    index: str = Query(default="ndvi", pattern=SUPPORTED_INDEX_PATTERN),
    cloud_cover_lte: float = Query(default=30, ge=0, le=100),
    max_scenes: int = Query(default=3, ge=2, le=4),
    _user: User = Depends(get_current_user),
):
    if start > end:
        api_error(422, "INVALID_DATE_RANGE", "start date must not be after end date")
    if (end - start).days > 366:
        api_error(422, "DATE_RANGE_TOO_LARGE", "time-series study is limited to 366 days")

    raw_bbox = _parse_bbox(bbox)
    try:
        validate_analysis_bbox(raw_bbox)
    except RasterStatisticsError as exc:
        api_error(422, "RASTER_ANALYSIS_BOUNDS_INVALID", str(exc))

    estimated_pixels = _study_pixel_budget(raw_bbox)
    if estimated_pixels > 400_000:
        api_error(
            422,
            "STUDY_AREA_TOO_LARGE",
            "Multi-temporal study is limited to about 400,000 10 m pixels; select a smaller AOI.",
        )

    features = _earth_search_features(
        raw_bbox,
        start,
        end,
        cloud_cover_lte,
        min(20, max_scenes * 4),
    )

    series: list[dict] = []
    skipped: list[dict] = []
    for feature in features:
        if len(series) >= max_scenes:
            break
        scene = _scene_from_feature(feature)
        scene_id = scene.get("id")
        if not scene_id:
            continue
        try:
            plan = build_processing_plan(feature, index)
            result = compute_index_statistics(plan, raw_bbox)
        except RasterCapacityError:
            api_error(429, "RASTER_ANALYSIS_BUSY", "Raster study capacity is busy; retry later")
        except (ProcessingPlanError, RasterStatisticsError):
            skipped.append({"scene_id": scene_id, "reason": "processing_unavailable"})
            continue

        quality = operational_quality_indicator(
            float(result["pixels"]["valid_fraction"]),
            scene.get("cloud_cover_pct"),
        )
        series.append({
            "scene_id": scene_id,
            "datetime": scene.get("datetime"),
            "acquisition_age_hours": acquisition_age_hours(scene.get("datetime")),
            "cloud_cover_pct": scene.get("cloud_cover_pct"),
            "platform": scene.get("platform"),
            "provider": scene.get("provider"),
            "statistics": result["statistics"],
            "pixels": result["pixels"],
            "mask": result["mask"],
            "grid": result["grid"],
            "formula_version": result["formula_version"],
            "processing_plan_fingerprint": result["processing_plan_fingerprint"],
            "quality_indicator": quality,
            "evidence": {
                "provider_scene": "OBSERVED",
                "derived_index": "COMPUTED",
                "study_interpretation": "INFERRED",
                "verified": False,
            },
        })

    series.sort(key=lambda row: str(row.get("datetime") or ""))
    definitions = {item["key"]: item for item in public_index_definitions()}
    methodology = public_methodology()
    quality_scores = [float(row["quality_indicator"]["score"]) for row in series]
    return {
        "study_type": "multi_temporal_spectral_index",
        "provider": "Element 84 Earth Search",
        "collection": SENTINEL_COLLECTION,
        "sensor_product": "Sentinel-2 L2A surface reflectance",
        "bbox_wgs84": raw_bbox,
        "period": {"start": start.isoformat(), "end": end.isoformat()},
        "index": definitions.get(index),
        "scene_count": len(series),
        "requested_scene_count": max_scenes,
        "series": series,
        "trend": _trend_summary(series),
        "quality_summary": {
            "mean_operational_score": None if not quality_scores else round(sum(quality_scores) / len(quality_scores), 1),
            "indicator": "FOGGARA operational screening; not formal uncertainty",
        },
        "skipped": skipped,
        "methodology": {
            "quality_framework": methodology["quality_framework"],
            "evidence_chain": methodology["evidence_chain"],
            "standards": [
                item for item in methodology["standards_and_guidance"]
                if item["id"] in {"qa4eo", "stac", "copernicus-s2-l2a"}
            ],
        },
        "limitations": [
            "Spectral indices are proxies and do not by themselves diagnose nutrient deficiency, disease, yield or absolute soil moisture.",
            "Scene-level cloud metadata is supplemented by per-pixel SCL masking inside the selected AOI.",
            "Field or laboratory observations are required before a result can become VERIFIED.",
        ],
    }


@router.get("/catalog/scenes/{scene_id}/preview.png")
def scene_index_preview(
    scene_id: str,
    bbox: str = Query(..., min_length=7, max_length=160),
    index: str = Query(..., pattern=SUPPORTED_INDEX_PATTERN),
    _user: User = Depends(get_current_user),
):
    raw_bbox = _parse_bbox(bbox)
    try:
        validate_analysis_bbox(raw_bbox)
    except RasterStatisticsError as exc:
        api_error(422, "RASTER_ANALYSIS_BOUNDS_INVALID", str(exc))

    _safe_scene_id, item = _provider_item(scene_id)
    try:
        plan = build_processing_plan(item, index)
    except ProcessingPlanError:
        api_error(
            502,
            "REMOTE_PROVIDER_INVALID_RESPONSE",
            "Satellite catalogue item cannot produce a trusted processing plan",
        )

    try:
        png, metadata = render_index_preview_png(plan, raw_bbox)
    except RasterCapacityError:
        api_error(429, "RASTER_ANALYSIS_BUSY", "Raster analysis capacity is busy; retry later")
    except RasterStatisticsError:
        api_error(502, "REMOTE_RASTER_UNAVAILABLE", "Trusted Sentinel raster preview failed")

    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Cache-Control": "private, no-store",
            "X-FOGGARA-Scene": str(metadata["scene_id"]),
            "X-FOGGARA-Index": str(metadata["index"]),
            "X-FOGGARA-Formula-Version": str(metadata["formula_version"]),
            "X-FOGGARA-Evidence": "COMPUTED",
            "X-FOGGARA-Verified": "false",
        },
    )


@router.get("/catalog/scenes/{scene_id}/true-color.png")
def scene_true_color_preview(
    scene_id: str,
    bbox: str = Query(..., min_length=7, max_length=160),
    _user: User = Depends(get_current_user),
):
    raw_bbox = _parse_bbox(bbox)
    try:
        validate_analysis_bbox(raw_bbox)
    except RasterStatisticsError as exc:
        api_error(422, "RASTER_ANALYSIS_BOUNDS_INVALID", str(exc))

    _safe_scene_id, item = _provider_item(scene_id)
    try:
        plan = build_true_color_plan(item)
        png, metadata = render_true_color_preview_png(plan, raw_bbox)
    except ProcessingPlanError:
        api_error(
            502,
            "REMOTE_PROVIDER_INVALID_RESPONSE",
            "Satellite catalogue item cannot produce a trusted true-color plan",
        )
    except RasterCapacityError:
        api_error(429, "RASTER_ANALYSIS_BUSY", "Raster analysis capacity is busy; retry later")
    except RasterStatisticsError:
        api_error(502, "REMOTE_RASTER_UNAVAILABLE", "Trusted Sentinel true-color preview failed")

    return Response(
        content=png,
        media_type="image/png",
        headers={
            "Cache-Control": "private, no-store",
            "X-FOGGARA-Scene": str(metadata["scene_id"]),
            "X-FOGGARA-Product": "true_color",
            "X-FOGGARA-Display-Version": str(metadata["display_version"]),
            "X-FOGGARA-Evidence": "OBSERVED",
            "X-FOGGARA-Display": "COMPUTED",
            "X-FOGGARA-Verified": "false",
        },
    )


@router.get("/indices/definitions")
def index_definitions(_user: User = Depends(get_current_user)):
    return {
        "sensor": "Sentinel-2 L2A",
        "computed": True,
        "verified": False,
        "indices": public_index_definitions(),
    }


@router.get("/catalog/scenes/{scene_id}/processing-plan")
def scene_processing_plan(
    scene_id: str,
    index: str = Query(..., pattern=SUPPORTED_INDEX_PATTERN),
    _user: User = Depends(get_current_user),
):
    _safe_scene_id, item = _provider_item(scene_id)
    try:
        return build_processing_plan(item, index)
    except ProcessingPlanError:
        api_error(
            502,
            "REMOTE_PROVIDER_INVALID_RESPONSE",
            "Satellite catalogue item cannot produce a trusted processing plan",
        )


@router.get("/catalog/scenes/{scene_id}/statistics")
def scene_index_statistics(
    scene_id: str,
    bbox: str = Query(..., min_length=7, max_length=160),
    index: str = Query(..., pattern=SUPPORTED_INDEX_PATTERN),
    _user: User = Depends(get_current_user),
):
    raw_bbox = _parse_bbox(bbox)
    try:
        validate_analysis_bbox(raw_bbox)
    except RasterStatisticsError as exc:
        api_error(422, "RASTER_ANALYSIS_BOUNDS_INVALID", str(exc))

    _safe_scene_id, item = _provider_item(scene_id)
    try:
        plan = build_processing_plan(item, index)
    except ProcessingPlanError:
        api_error(
            502,
            "REMOTE_PROVIDER_INVALID_RESPONSE",
            "Satellite catalogue item cannot produce a trusted processing plan",
        )
    try:
        return compute_index_statistics(plan, raw_bbox)
    except RasterCapacityError:
        api_error(429, "RASTER_ANALYSIS_BUSY", "Raster analysis capacity is busy; retry later")
    except RasterStatisticsError as exc:
        message = str(exc)
        if "bbox" in message or "pixel budget" in message or "too large" in message:
            api_error(422, "RASTER_ANALYSIS_BOUNDS_INVALID", message)
        api_error(502, "REMOTE_RASTER_UNAVAILABLE", "Trusted Sentinel raster analysis failed")
