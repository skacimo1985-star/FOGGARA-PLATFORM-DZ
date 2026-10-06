"""Read-only live satellite catalogue adapter.

Uses a fixed public STAC provider endpoint. It never accepts arbitrary provider URLs,
never stores provider data, and never upgrades satellite inference to verified evidence.
"""
from __future__ import annotations

from datetime import date
import math

import httpx
from fastapi import APIRouter, Depends, Query

from ..deps import api_error, get_current_user
from ..models import User

router = APIRouter(prefix="/api/remote-sensing", tags=["remote-sensing"])

EARTH_SEARCH_SEARCH_URL = "https://earth-search.aws.element84.com/v1/search"
SENTINEL_COLLECTION = "sentinel-2-l2a"


def _parse_bbox(raw: str) -> list[float]:
    try:
        values = [float(part.strip()) for part in raw.split(",")]
    except ValueError:
        api_error(422, "INVALID_BBOX", "bbox must contain four numeric coordinates")
    if len(values) != 4 or not all(math.isfinite(value) for value in values):
        api_error(422, "INVALID_BBOX", "bbox must contain four finite coordinates")
    west, south, east, north = values
    if not (-180 <= west <= 180 and -180 <= east <= 180 and -90 <= south <= north <= 90):
        api_error(422, "INVALID_BBOX", "bbox is outside WGS84 bounds or has invalid latitude ordering")
    if west == east:
        api_error(422, "INVALID_BBOX", "bbox longitude span must be greater than zero")
    return values


def _scene_from_feature(feature: dict) -> dict:
    props = feature.get("properties") if isinstance(feature.get("properties"), dict) else {}
    geometry = feature.get("geometry")
    if not isinstance(geometry, dict) or geometry.get("type") not in {"Polygon", "MultiPolygon"}:
        geometry = None

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
