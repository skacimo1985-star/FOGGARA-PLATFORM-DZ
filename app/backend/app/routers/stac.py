"""Read-only STAC 1.1.0 compatibility projection for FOGGARA remote-sensing records.

The router projects existing organization-scoped satellite observations into STAC-shaped
Catalog, Collection and Item documents. It does not claim STAC API conformance and does
not invent imagery assets that are not persisted by FOGGARA.
"""
from datetime import datetime, timezone
from math import isfinite

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, or_, select, tuple_
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import AgriObservation, AgriParcel, User

router = APIRouter(prefix="/api/stac", tags=["stac"])

STAC_VERSION = "1.1.0"
COLLECTION_ID = "foggara-remote-sensing"
PROFILE = "foggara-stac-readonly-v1"
MAX_LIMIT = 200
MAX_OFFSET = 1_000_000
ALGERIA_SCOPE_BBOX = [-8.7, 18.9, 12.0, 37.1]


class GeoJSONResponse(JSONResponse):
    media_type = "application/geo+json"


def _root(request: Request) -> str:
    return str(request.base_url).rstrip("/") + "/api/stac"


def _iso(value: datetime) -> str:
    aware = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return aware.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def _parse_bbox(raw: str | None) -> tuple[float, float, float, float] | None:
    if raw is None:
        return None
    try:
        values = tuple(float(part.strip()) for part in raw.split(","))
    except ValueError:
        api_error(422, "INVALID_BBOX", "bbox must contain four numeric coordinates")
    if len(values) != 4 or not all(isfinite(value) for value in values):
        api_error(422, "INVALID_BBOX", "bbox must contain four finite coordinates")
    min_lon, min_lat, max_lon, max_lat = values
    if not (-180 <= min_lon <= 180 and -180 <= max_lon <= 180 and -90 <= min_lat <= max_lat <= 90):
        api_error(422, "INVALID_BBOX", "bbox is outside WGS84 bounds or has invalid latitude ordering")
    return min_lon, min_lat, max_lon, max_lat


def _parse_time(value: str) -> datetime:
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        api_error(422, "INVALID_DATETIME", "datetime must use RFC 3339 / ISO 8601")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _parse_datetime_filter(raw: str | None) -> tuple[datetime | None, datetime | None] | None:
    if raw is None:
        return None
    raw = raw.strip()
    if not raw:
        api_error(422, "INVALID_DATETIME", "datetime filter cannot be empty")
    if "/" not in raw:
        instant = _parse_time(raw)
        return instant, instant
    start_raw, end_raw = raw.split("/", 1)
    start = None if start_raw == ".." else _parse_time(start_raw)
    end = None if end_raw == ".." else _parse_time(end_raw)
    if start is None and end is None:
        api_error(422, "INVALID_DATETIME", "datetime interval must have at least one bound")
    if start is not None and end is not None and end < start:
        api_error(422, "INVALID_DATETIME", "datetime interval end precedes start")
    return start, end


def _source_parts(source_ref: str) -> tuple[str, str]:
    provider, sep, scene_id = source_ref.partition(":")
    if not sep:
        return "unknown", source_ref
    return provider, scene_id


def _scene_query(org_id: int, bbox, time_filter):
    acquired = func.min(AgriObservation.observed_at).label("acquired_at")
    anchor_id = func.min(AgriObservation.id).label("anchor_id")
    stmt = (
        select(
            AgriObservation.parcel_id,
            AgriObservation.source_ref,
            acquired,
            anchor_id,
        )
        .join(AgriParcel, AgriParcel.id == AgriObservation.parcel_id)
        .where(
            AgriObservation.org_id == org_id,
            AgriParcel.org_id == org_id,
            AgriObservation.source_type == "satellite",
        )
    )
    if bbox is not None:
        min_lon, min_lat, max_lon, max_lat = bbox
        longitude_clause = (
            AgriParcel.lon.between(min_lon, max_lon)
            if min_lon <= max_lon
            else or_(AgriParcel.lon >= min_lon, AgriParcel.lon <= max_lon)
        )
        stmt = stmt.where(
            AgriParcel.lon.isnot(None),
            AgriParcel.lat.isnot(None),
            longitude_clause,
            AgriParcel.lat >= min_lat,
            AgriParcel.lat <= max_lat,
        )
    if time_filter is not None:
        start, end = time_filter
        if start is not None:
            stmt = stmt.where(AgriObservation.observed_at >= start)
        if end is not None:
            stmt = stmt.where(AgriObservation.observed_at <= end)
    return stmt.group_by(AgriObservation.parcel_id, AgriObservation.source_ref)


def _item_id(parcel_id: int, anchor_id: int) -> str:
    return f"rs-{parcel_id}-{anchor_id}"


def _item(parcel: AgriParcel, rows: list[AgriObservation], anchor_id: int, request: Request) -> dict:
    rows = sorted(rows, key=lambda row: (row.metric, row.id))
    acquired = min(row.observed_at for row in rows)
    source_ref = rows[0].source_ref
    provider, scene_id = _source_parts(source_ref)
    item_id = _item_id(parcel.id, anchor_id)
    root = _root(request)

    geometry = None
    bbox = None
    if parcel.lat is not None and parcel.lon is not None:
        lon, lat = float(parcel.lon), float(parcel.lat)
        geometry = {"type": "Point", "coordinates": [lon, lat]}
        bbox = [lon, lat, lon, lat]

    metrics = {
        row.metric: {
            "value": float(row.value),
            "unit": row.unit,
            "evidence_status": row.evidence_status,
            "observation_id": row.id,
        }
        for row in rows
    }
    result = {
        "stac_version": STAC_VERSION,
        "stac_extensions": [],
        "type": "Feature",
        "id": item_id,
        "geometry": geometry,
        "properties": {
            "datetime": _iso(acquired),
            "foggara:provider": provider,
            "foggara:scene_id": scene_id,
            "foggara:parcel_id": parcel.id,
            "foggara:parcel_name": parcel.name,
            "foggara:crop": parcel.crop,
            "foggara:evidence_status": "INFERRED",
            "foggara:is_demo": any(row.is_demo for row in rows),
            "foggara:metrics": metrics,
        },
        "links": [
            {"rel": "self", "href": f"{root}/collections/{COLLECTION_ID}/items/{item_id}", "type": "application/geo+json"},
            {"rel": "collection", "href": f"{root}/collections/{COLLECTION_ID}", "type": "application/json"},
            {"rel": "parent", "href": f"{root}/collections/{COLLECTION_ID}", "type": "application/json"},
            {"rel": "root", "href": root, "type": "application/json"},
        ],
        "assets": {},
        "collection": COLLECTION_ID,
        "x-foggara-profile": PROFILE,
        "x-foggara-provenance": "INFERRED",
    }
    if bbox is not None:
        result["bbox"] = bbox
    return result


def _collection_extent(db: Session, org_id: int):
    spatial = db.execute(
        select(
            func.min(AgriParcel.lon),
            func.min(AgriParcel.lat),
            func.max(AgriParcel.lon),
            func.max(AgriParcel.lat),
        )
        .join(AgriObservation, AgriObservation.parcel_id == AgriParcel.id)
        .where(
            AgriParcel.org_id == org_id,
            AgriObservation.org_id == org_id,
            AgriObservation.source_type == "satellite",
            AgriParcel.lon.isnot(None),
            AgriParcel.lat.isnot(None),
        )
    ).one()
    if all(value is not None for value in spatial):
        spatial_bbox = [[float(spatial[0]), float(spatial[1]), float(spatial[2]), float(spatial[3])]]
        spatial_known = True
    else:
        spatial_bbox = [ALGERIA_SCOPE_BBOX]
        spatial_known = False

    temporal = db.execute(
        select(func.min(AgriObservation.observed_at), func.max(AgriObservation.observed_at))
        .where(
            AgriObservation.org_id == org_id,
            AgriObservation.source_type == "satellite",
        )
    ).one()
    interval = [[
        _iso(temporal[0]) if temporal[0] is not None else None,
        _iso(temporal[1]) if temporal[1] is not None else None,
    ]]
    return spatial_bbox, spatial_known, interval


def _collection(db: Session, user: User, request: Request) -> dict:
    root = _root(request)
    spatial_bbox, spatial_known, interval = _collection_extent(db, user.org_id)
    return {
        "stac_version": STAC_VERSION,
        "stac_extensions": [],
        "type": "Collection",
        "id": COLLECTION_ID,
        "title": "FOGGARA remote-sensing observations",
        "description": "Provider-neutral STAC projection of recorded FOGGARA satellite-derived observations. Values remain INFERRED.",
        "license": "other",
        "extent": {
            "spatial": {"bbox": spatial_bbox},
            "temporal": {"interval": interval},
        },
        "links": [
            {"rel": "self", "href": f"{root}/collections/{COLLECTION_ID}", "type": "application/json"},
            {"rel": "root", "href": root, "type": "application/json"},
            {"rel": "items", "href": f"{root}/collections/{COLLECTION_ID}/items", "type": "application/geo+json"},
        ],
        "summaries": {
            "foggara:evidence_status": ["INFERRED"],
            "foggara:supported_metrics": ["ndvi", "lswi", "moisture"],
        },
        "x-foggara-spatial-extent-known": spatial_known,
        "x-foggara-profile": PROFILE,
        "x-foggara-api-conformance": [],
        "x-foggara-certified": False,
    }


def _items_response(db: Session, user: User, request: Request, bbox_raw, datetime_raw, limit, offset):
    bbox = _parse_bbox(bbox_raw)
    time_filter = _parse_datetime_filter(datetime_raw)
    grouped = _scene_query(user.org_id, bbox, time_filter)
    total = db.scalar(select(func.count()).select_from(grouped.subquery())) or 0
    scene_rows = list(db.execute(
        grouped.order_by(func.min(AgriObservation.observed_at).desc(), AgriObservation.parcel_id)
        .offset(offset)
        .limit(limit)
    ).all())

    keys = [(row.parcel_id, row.source_ref) for row in scene_rows]
    observations: list[AgriObservation] = []
    if keys:
        observations = list(db.scalars(
            select(AgriObservation).where(
                AgriObservation.org_id == user.org_id,
                AgriObservation.source_type == "satellite",
                tuple_(AgriObservation.parcel_id, AgriObservation.source_ref).in_(keys),
            )
        ))
    grouped_obs: dict[tuple[int, str], list[AgriObservation]] = {}
    for observation in observations:
        grouped_obs.setdefault((observation.parcel_id, observation.source_ref), []).append(observation)

    parcel_ids = {row.parcel_id for row in scene_rows}
    parcels = {
        parcel.id: parcel
        for parcel in db.scalars(
            select(AgriParcel).where(AgriParcel.org_id == user.org_id, AgriParcel.id.in_(parcel_ids))
        )
    } if parcel_ids else {}

    features = []
    for scene in scene_rows:
        parcel = parcels.get(scene.parcel_id)
        rows = grouped_obs.get((scene.parcel_id, scene.source_ref), [])
        if parcel is not None and rows:
            features.append(_item(parcel, rows, scene.anchor_id, request))

    links = [{"rel": "self", "href": str(request.url), "type": "application/geo+json"}]
    if offset + len(scene_rows) < total:
        next_url = request.url.include_query_params(
            limit=limit,
            offset=offset + len(scene_rows),
        )
        links.append({"rel": "next", "href": str(next_url), "type": "application/geo+json"})
    return {
        "type": "FeatureCollection",
        "features": features,
        "links": links,
        "numberMatched": total,
        "numberReturned": len(features),
        "context": {"matched": total, "returned": len(features), "limit": limit, "offset": offset},
        "x-foggara-profile": PROFILE,
        "x-foggara-api-conformance": [],
    }


@router.get("")
@router.get("/", include_in_schema=False)
def landing(request: Request, user: User = Depends(get_current_user)):
    root = _root(request)
    return {
        "stac_version": STAC_VERSION,
        "stac_extensions": [],
        "type": "Catalog",
        "id": "foggara-dz",
        "title": "FOGGARA-DZ remote-sensing catalog",
        "description": "Read-only provider-neutral catalog projection. No formal STAC API conformance is claimed.",
        "links": [
            {"rel": "self", "href": root, "type": "application/json"},
            {"rel": "data", "href": f"{root}/collections", "type": "application/json"},
            {"rel": "child", "href": f"{root}/collections/{COLLECTION_ID}", "type": "application/json"},
            {"rel": "search", "href": f"{root}/search", "type": "application/geo+json"},
        ],
        "x-foggara-profile": PROFILE,
        "x-foggara-api-conformance": [],
        "x-foggara-certified": False,
        "organization_scoped": True,
    }


@router.get("/collections")
def collections(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {
        "collections": [_collection(db, user, request)],
        "links": [{"rel": "self", "href": f"{_root(request)}/collections", "type": "application/json"}],
        "x-foggara-profile": PROFILE,
    }


@router.get("/collections/{collection_id}")
def collection(collection_id: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if collection_id != COLLECTION_ID:
        api_error(404, "NOT_FOUND", "STAC collection not found")
    return _collection(db, user, request)


@router.get("/collections/{collection_id}/items", response_class=GeoJSONResponse)
def collection_items(
    collection_id: str,
    request: Request,
    bbox: str | None = Query(default=None),
    datetime_: str | None = Query(default=None, alias="datetime"),
    limit: int = Query(default=50, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0, le=MAX_OFFSET),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if collection_id != COLLECTION_ID:
        api_error(404, "NOT_FOUND", "STAC collection not found")
    return _items_response(db, user, request, bbox, datetime_, limit, offset)


@router.get("/search", response_class=GeoJSONResponse)
def search_items(
    request: Request,
    collections: str | None = Query(default=None),
    bbox: str | None = Query(default=None),
    datetime_: str | None = Query(default=None, alias="datetime"),
    limit: int = Query(default=50, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0, le=MAX_OFFSET),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if collections is not None:
        requested = {value.strip() for value in collections.split(",") if value.strip()}
        if requested and COLLECTION_ID not in requested:
            return {
                "type": "FeatureCollection",
                "features": [],
                "links": [{"rel": "self", "href": str(request.url), "type": "application/geo+json"}],
                "numberMatched": 0,
                "numberReturned": 0,
                "context": {"matched": 0, "returned": 0, "limit": limit, "offset": offset},
                "x-foggara-profile": PROFILE,
                "x-foggara-api-conformance": [],
            }
    return _items_response(db, user, request, bbox, datetime_, limit, offset)


@router.get("/collections/{collection_id}/items/{item_id}", response_class=GeoJSONResponse)
def item(
    collection_id: str,
    item_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if collection_id != COLLECTION_ID:
        api_error(404, "NOT_FOUND", "STAC collection not found")
    parts = item_id.split("-")
    if len(parts) != 3 or parts[0] != "rs":
        api_error(404, "NOT_FOUND", "STAC item not found")
    try:
        parcel_id, anchor_id = int(parts[1]), int(parts[2])
    except ValueError:
        api_error(404, "NOT_FOUND", "STAC item not found")

    anchor = db.scalar(select(AgriObservation).where(
        AgriObservation.id == anchor_id,
        AgriObservation.org_id == user.org_id,
        AgriObservation.parcel_id == parcel_id,
        AgriObservation.source_type == "satellite",
    ))
    parcel = db.scalar(select(AgriParcel).where(
        AgriParcel.id == parcel_id,
        AgriParcel.org_id == user.org_id,
    ))
    if anchor is None or parcel is None:
        api_error(404, "NOT_FOUND", "STAC item not found")

    rows = list(db.scalars(select(AgriObservation).where(
        AgriObservation.org_id == user.org_id,
        AgriObservation.parcel_id == parcel.id,
        AgriObservation.source_type == "satellite",
        AgriObservation.source_ref == anchor.source_ref,
    )))
    if not rows or min(row.id for row in rows) != anchor_id:
        api_error(404, "NOT_FOUND", "STAC item not found")
    return _item(parcel, rows, anchor_id, request)
