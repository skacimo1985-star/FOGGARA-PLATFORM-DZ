"""Read-only OGC API Features compatibility layer for organization-scoped FOGGARA sites.

This is an interoperability profile, not a claim of OGC certification.
It intentionally reuses the existing Site model and authorization boundary.
"""
from datetime import datetime, timezone
from math import isfinite

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import Site, User

router = APIRouter(prefix="/api/ogc", tags=["ogc-features"])


class GeoJSONResponse(JSONResponse):
    media_type = "application/geo+json"

CRS84 = "http://www.opengis.net/def/crs/OGC/1.3/CRS84"
CORE_CONF = "http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core"
GEOJSON_CONF = "http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson"
PROFILE = "foggara-ogcapi-features-readonly-v1"
MAX_LIMIT = 1000
MAX_OFFSET = 1_000_000


def _root(request: Request) -> str:
    return str(request.base_url).rstrip("/") + "/api/ogc"


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
    if not (-180 <= min_lon < max_lon <= 180 and -90 <= min_lat < max_lat <= 90):
        api_error(422, "INVALID_BBOX", "bbox is outside CRS84 bounds or has invalid ordering")
    return min_lon, min_lat, max_lon, max_lat


def _site_feature(site: Site) -> dict:
    return {
        "type": "Feature",
        "id": str(site.id),
        "geometry": {
            "type": "Point",
            "coordinates": [float(site.lon), float(site.lat)],
        },
        "properties": {
            "name": site.name,
            "wilaya": site.wilaya,
            "commune": site.commune,
            "is_demo": site.is_demo,
            "created_at": site.created_at,
        },
    }


def _site_filter(org_id: int, bbox: tuple[float, float, float, float] | None = None):
    clauses = [
        Site.org_id == org_id,
        Site.lat.isnot(None),
        Site.lon.isnot(None),
    ]
    if bbox is not None:
        min_lon, min_lat, max_lon, max_lat = bbox
        clauses.extend([
            Site.lon >= min_lon,
            Site.lon <= max_lon,
            Site.lat >= min_lat,
            Site.lat <= max_lat,
        ])
    return clauses


def _collection_extent(db: Session, org_id: int) -> list[list[float]]:
    row = db.execute(
        select(func.min(Site.lon), func.min(Site.lat), func.max(Site.lon), func.max(Site.lat))
        .where(*_site_filter(org_id))
    ).one()
    if any(value is None for value in row):
        return []
    min_lon, min_lat, max_lon, max_lat = row
    return [[float(min_lon), float(min_lat), float(max_lon), float(max_lat)]]


def _collection(db: Session, user: User, request: Request) -> dict:
    root = _root(request)
    return {
        "id": "sites",
        "title": "FOGGARA organization sites",
        "description": "Organization-scoped FOGGARA sites exposed as read-only GeoJSON features.",
        "itemType": "feature",
        "crs": [CRS84],
        "extent": {
            "spatial": {
                "bbox": _collection_extent(db, user.org_id),
                "crs": CRS84,
            }
        },
        "links": [
            {"href": f"{root}/collections/sites", "rel": "self", "type": "application/json"},
            {"href": f"{root}/collections/sites/items", "rel": "items", "type": "application/geo+json"},
        ],
        "x-foggara-profile": PROFILE,
        "x-foggara-certified": False,
    }


@router.get("")
@router.get("/", include_in_schema=False)
def landing(request: Request, user: User = Depends(get_current_user)):
    root = _root(request)
    return {
        "title": "FOGGARA-DZ OGC API Features compatibility endpoint",
        "description": "Read-only organization-scoped geospatial interoperability endpoint.",
        "links": [
            {"href": root, "rel": "self", "type": "application/json"},
            {"href": f"{root}/conformance", "rel": "conformance", "type": "application/json"},
            {"href": f"{root}/collections", "rel": "data", "type": "application/json"},
            {"href": str(request.base_url).rstrip("/") + "/api/openapi.json", "rel": "service-desc", "type": "application/vnd.oai.openapi+json;version=3.1"},
        ],
        "x-foggara-profile": PROFILE,
        "x-foggara-certified": False,
        "organization_scoped": True,
    }


@router.get("/conformance")
def conformance(user: User = Depends(get_current_user)):
    return {
        "conformsTo": [],
        "x-foggara-target-conformance": [CORE_CONF, GEOJSON_CONF],
        "x-foggara-validation": "internal_application_tests_only",
        "x-foggara-profile": PROFILE,
        "x-foggara-certified": False,
    }


@router.get("/collections")
def collections(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    root = _root(request)
    return {
        "collections": [_collection(db, user, request)],
        "links": [
            {"href": f"{root}/collections", "rel": "self", "type": "application/json"},
        ],
        "x-foggara-profile": PROFILE,
    }


@router.get("/collections/sites")
def sites_collection(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _collection(db, user, request)


@router.get("/collections/sites/items", response_class=GeoJSONResponse)
def site_items(
    request: Request,
    bbox: str | None = Query(default=None, description="CRS84 bbox: minLon,minLat,maxLon,maxLat"),
    limit: int = Query(default=100, ge=1, le=MAX_LIMIT),
    offset: int = Query(default=0, ge=0, le=MAX_OFFSET),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    parsed_bbox = _parse_bbox(bbox)
    clauses = _site_filter(user.org_id, parsed_bbox)
    total = db.scalar(select(func.count()).select_from(Site).where(*clauses)) or 0
    rows = list(db.scalars(
        select(Site)
        .where(*clauses)
        .order_by(Site.id)
        .offset(offset)
        .limit(limit)
    ))
    root = _root(request)
    links = [
        {"href": str(request.url), "rel": "self", "type": "application/geo+json"},
        {"href": f"{root}/collections/sites", "rel": "collection", "type": "application/json"},
    ]
    if offset + len(rows) < total:
        next_offset = offset + len(rows)
        query = f"?limit={limit}&offset={next_offset}"
        if bbox is not None:
            query += f"&bbox={bbox}"
        links.append({"href": f"{root}/collections/sites/items{query}", "rel": "next", "type": "application/geo+json"})
    if offset > 0:
        previous_offset = max(0, offset - limit)
        query = f"?limit={limit}&offset={previous_offset}"
        if bbox is not None:
            query += f"&bbox={bbox}"
        links.append({"href": f"{root}/collections/sites/items{query}", "rel": "prev", "type": "application/geo+json"})

    return {
        "type": "FeatureCollection",
        "timeStamp": datetime.now(timezone.utc),
        "numberMatched": total,
        "numberReturned": len(rows),
        "features": [_site_feature(site) for site in rows],
        "links": links,
        "x-foggara-profile": PROFILE,
    }


@router.get("/collections/sites/items/{site_id}", response_class=GeoJSONResponse)
def site_item(
    site_id: int,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    site = db.scalar(select(Site).where(Site.id == site_id, *_site_filter(user.org_id)))
    if site is None:
        api_error(404, "NOT_FOUND", "Site feature not found")
    feature = _site_feature(site)
    root = _root(request)
    feature["links"] = [
        {"href": f"{root}/collections/sites/items/{site.id}", "rel": "self", "type": "application/geo+json"},
        {"href": f"{root}/collections/sites", "rel": "collection", "type": "application/json"},
    ]
    feature["x-foggara-profile"] = PROFILE
    return feature
