"""Read-only live satellite catalogue adapter.

Uses a fixed public STAC provider endpoint. It never accepts arbitrary provider URLs,
never stores provider data, and never upgrades satellite inference to verified evidence.
"""
from __future__ import annotations

from datetime import date
import math

import httpx
from fastapi import APIRouter, Depends, Query, Response

from ..deps import api_error, get_current_user
from ..models import User
from ..services.remote_sensing_indices import public_index_definitions
from ..services.remote_sensing_processing import (
    ProcessingPlanError,
    build_processing_plan,
    item_url,
    validate_scene_id,
)
from ..services.remote_sensing_raster import (
    RasterCapacityError,
    RasterStatisticsError,
    compute_index_statistics,
    render_index_preview_png,
    validate_analysis_bbox,
)

router = APIRouter(prefix="/api/remote-sensing", tags=["remote-sensing"])

EARTH_SEARCH_SEARCH_URL = "https://earth-search.aws.element84.com/v1/search"
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

    scenes = [_scene_from_feature(feature) for feature in features if isinstance(feature, dict)]
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
