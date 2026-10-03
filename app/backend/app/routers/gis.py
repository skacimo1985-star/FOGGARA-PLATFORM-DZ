"""National GIS endpoints backed by PostGIS with strict organization isolation."""

from math import isfinite

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import api_error, get_current_user
from ..gis_models import Commune, Daira, Wilaya
from ..models import User

router = APIRouter(prefix="/api/gis", tags=["gis"])

MAX_RADIUS_M = 100_000.0
MAX_LIMIT = 200
MAX_BBOX_SPAN_DEG = 20.0


def _lang_name(row, lang: str):
    return row.name_fr if lang == "fr" else row.name_en if lang == "en" else row.name_ar


def _require_postgis(db: Session):
    if db.bind is None or db.bind.dialect.name != "postgresql":
        api_error(501, "POSTGIS_REQUIRED", "Spatial query requires PostgreSQL/PostGIS")


def _point_feature(row):
    return {
        "type": "Feature",
        "id": row["id"],
        "geometry": {"type": "Point", "coordinates": [float(row["lon"]), float(row["lat"])]},
        "properties": {
            "id": row["id"],
            "name": row["name"],
            "wilaya": row["wilaya"],
            "commune": row["commune"],
            "is_demo": row["is_demo"],
        },
    }


@router.get("/wilayas")
def wilayas(lang: str = Query("ar", pattern="^(ar|fr|en)$"),
            user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Wilaya).order_by(Wilaya.official_code, Wilaya.id)).all()
    return {
        "count": len(rows),
        "items": [
            {"id": r.id, "reference_key": r.reference_key, "code": r.official_code,
             "name": _lang_name(r, lang), "name_ar": r.name_ar, "name_fr": r.name_fr,
             "name_en": r.name_en,
             "operational_from": r.operational_from.isoformat() if r.operational_from else None,
             "verified": r.verified}
            for r in rows
        ],
    }


@router.get("/wilayas/{wilaya_id}/dairas")
def dairas(wilaya_id: int, lang: str = Query("ar", pattern="^(ar|fr|en)$"),
           user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.get(Wilaya, wilaya_id) is None:
        api_error(404, "NOT_FOUND", "Wilaya not found")
    rows = db.scalars(select(Daira).where(Daira.wilaya_id == wilaya_id).order_by(Daira.name_fr, Daira.id)).all()
    return {"count": len(rows), "items": [
        {"id": r.id, "reference_key": r.reference_key, "code": r.official_code,
         "name": _lang_name(r, lang), "name_ar": r.name_ar, "name_fr": r.name_fr,
         "name_en": r.name_en, "verified": r.verified}
        for r in rows
    ]}


@router.get("/dairas/{daira_id}/communes")
def communes(daira_id: int, lang: str = Query("ar", pattern="^(ar|fr|en)$"),
             user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if db.get(Daira, daira_id) is None:
        api_error(404, "NOT_FOUND", "Daira not found")
    rows = db.scalars(select(Commune).where(Commune.daira_id == daira_id).order_by(Commune.name_fr, Commune.id)).all()
    return {"count": len(rows), "items": [
        {"id": r.id, "code": r.official_code, "name": _lang_name(r, lang),
         "name_ar": r.name_ar, "name_fr": r.name_fr, "name_en": r.name_en,
         "verified": r.verified}
        for r in rows
    ]}


@router.get("/sites.geojson")
def sites_geojson(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(text("""
        SELECT id, name, wilaya, commune, lat, lon, is_demo
        FROM sites
        WHERE org_id = :org_id AND lat IS NOT NULL AND lon IS NOT NULL
        ORDER BY id
        LIMIT 5000
    """), {"org_id": user.org_id}).mappings().all()
    return {
        "type": "FeatureCollection",
        "features": [_point_feature(r) for r in rows],
        "metadata": {"organization_scoped": True, "count": len(rows), "crs": "EPSG:4326"},
    }


@router.get("/sites/within")
def sites_within(
    lon: float = Query(..., ge=-180, le=180),
    lat: float = Query(..., ge=-90, le=90),
    radius_m: float = Query(..., gt=0, le=MAX_RADIUS_M),
    limit: int = Query(50, ge=1, le=MAX_LIMIT),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_postgis(db)
    rows = db.execute(text("""
        SELECT id, name, wilaya, commune,
               ST_Y(geom) AS lat, ST_X(geom) AS lon, is_demo,
               ST_Distance(
                 geom::geography,
                 ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
               ) AS distance_m
        FROM sites
        WHERE org_id = :org_id
          AND geom IS NOT NULL
          AND ST_DWithin(
            geom::geography,
            ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography,
            :radius_m
          )
        ORDER BY distance_m, id
        LIMIT :limit
    """), {"org_id": user.org_id, "lon": lon, "lat": lat, "radius_m": radius_m, "limit": limit}).mappings().all()
    return {"count": len(rows), "items": [
        {**_point_feature(r), "properties": {**_point_feature(r)["properties"], "distance_m": round(float(r["distance_m"]), 2)}}
        for r in rows
    ]}


@router.get("/sites/nearest")
def sites_nearest(
    lon: float = Query(..., ge=-180, le=180),
    lat: float = Query(..., ge=-90, le=90),
    limit: int = Query(10, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_postgis(db)
    rows = db.execute(text("""
        SELECT id, name, wilaya, commune,
               ST_Y(geom) AS lat, ST_X(geom) AS lon, is_demo,
               ST_Distance(
                 geom::geography,
                 ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography
               ) AS distance_m
        FROM sites
        WHERE org_id = :org_id AND geom IS NOT NULL
        ORDER BY geom <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), id
        LIMIT :limit
    """), {"org_id": user.org_id, "lon": lon, "lat": lat, "limit": limit}).mappings().all()
    return {"count": len(rows), "items": [
        {**_point_feature(r), "properties": {**_point_feature(r)["properties"], "distance_m": round(float(r["distance_m"]), 2)}}
        for r in rows
    ]}


@router.get("/sites/intersects")
def sites_intersects(
    min_lon: float = Query(..., ge=-180, le=180),
    min_lat: float = Query(..., ge=-90, le=90),
    max_lon: float = Query(..., ge=-180, le=180),
    max_lat: float = Query(..., ge=-90, le=90),
    limit: int = Query(100, ge=1, le=MAX_LIMIT),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    vals = (min_lon, min_lat, max_lon, max_lat)
    if not all(isfinite(v) for v in vals) or min_lon >= max_lon or min_lat >= max_lat:
        api_error(422, "INVALID_BBOX", "Bounding box is invalid")
    if (max_lon - min_lon) > MAX_BBOX_SPAN_DEG or (max_lat - min_lat) > MAX_BBOX_SPAN_DEG:
        api_error(422, "BBOX_TOO_LARGE", "Bounding box exceeds safe query span")
    _require_postgis(db)
    rows = db.execute(text("""
        SELECT id, name, wilaya, commune,
               ST_Y(geom) AS lat, ST_X(geom) AS lon, is_demo
        FROM sites
        WHERE org_id = :org_id
          AND geom IS NOT NULL
          AND ST_Intersects(
            geom,
            ST_MakeEnvelope(:min_lon, :min_lat, :max_lon, :max_lat, 4326)
          )
        ORDER BY id
        LIMIT :limit
    """), {"org_id": user.org_id, "min_lon": min_lon, "min_lat": min_lat,
           "max_lon": max_lon, "max_lat": max_lat, "limit": limit}).mappings().all()
    return {"type": "FeatureCollection", "features": [_point_feature(r) for r in rows],
            "metadata": {"organization_scoped": True, "count": len(rows), "crs": "EPSG:4326"}}
