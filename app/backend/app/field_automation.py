"""Automated parcel intelligence using real Sentinel-2 L2A rasters.

Runs outside request handling, discovers the newest usable scene for each active
parcel, computes the supported spectral indices over the parcel geometry, and
persists idempotent INFERRED observations with audit provenance.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import logging
import math

from sqlalchemy import select

from . import config
from .audit import audit
from .db import SessionLocal
from .models import AgriObservation, AgriParcel, User
from .services.parcel_geometry import ParcelGeometryError, normalize_parcel_boundary
from .services.remote_sensing_processing import ProcessingPlanError, build_multi_index_plan
from .services.remote_sensing_raster import (
    RasterCapacityError,
    RasterStatisticsError,
    compute_multi_index_statistics,
    validate_analysis_bbox,
)
from .routers.remote_sensing_catalog import _earth_search_features, _scene_from_feature

log = logging.getLogger("foggara.field_automation")

PROVIDER = "element84-earth-search"
AUTOMATED_INDICES = ("ndvi", "evi", "savi", "ndwi", "ndmi", "lswi", "bsi")
INDEX_BOUNDS = {
    "ndvi": (-1.0, 1.0),
    "evi": (-2.5, 2.5),
    "savi": (-1.5, 1.5),
    "ndwi": (-1.0, 1.0),
    "ndmi": (-1.0, 1.0),
    "lswi": (-1.0, 1.0),
    "bsi": (-1.0, 1.0),
}
MIN_VALID_FRACTION = 0.35
MIN_VALID_PIXELS = 9


def _target(parcel: AgriParcel) -> tuple[list[float], dict | None, str, str]:
    geometry = None
    if parcel.boundary_geojson is not None:
        try:
            geometry, meta = normalize_parcel_boundary(parcel.boundary_geojson)
        except ParcelGeometryError as exc:
            raise ValueError("INVALID_PARCEL_GEOMETRY") from exc
        bounds = list(meta["bbox"])
        sample_geometry = "PARCEL_BOUNDARY_GEOJSON"
        fingerprint_payload = {"geometry": geometry}
    else:
        if parcel.lat is None or parcel.lon is None:
            raise ValueError("PARCEL_COORDINATES_REQUIRED")
        lat, lon, area = float(parcel.lat), float(parcel.lon), float(parcel.area_ha)
        if not all(math.isfinite(v) for v in (lat, lon, area)) or area <= 0:
            raise ValueError("INVALID_PARCEL_GEOMETRY")
        half_width_m = max(40.0, min(250.0, math.sqrt(area * 10_000.0) / 2.0))
        lat_deg = half_width_m / 111_320.0
        lon_deg = half_width_m / (111_320.0 * max(0.15, abs(math.cos(math.radians(lat)))))
        bounds = [lon - lon_deg, lat - lat_deg, lon + lon_deg, lat + lat_deg]
        sample_geometry = "POINT_CENTERED_ESTIMATE_NOT_PARCEL_BOUNDARY"
        fingerprint_payload = {"lat": lat, "lon": lon, "area_ha": area}
    validate_analysis_bbox(bounds)
    fingerprint = hashlib.sha256(
        json.dumps(fingerprint_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()[:16]
    return bounds, geometry, sample_geometry, fingerprint


def _scene_time(scene: dict) -> datetime:
    raw = scene.get("datetime")
    if not isinstance(raw, str):
        raise ValueError("INVALID_SCENE_TIME")
    when = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    when = when.astimezone(timezone.utc)
    if when > datetime.now(timezone.utc):
        raise ValueError("INVALID_SCENE_TIME")
    return when


def _operator(db, parcel: AgriParcel) -> User:
    creator = db.get(User, parcel.created_by)
    if creator is not None and creator.org_id == parcel.org_id:
        return creator
    user = db.scalar(
        select(User).where(User.org_id == parcel.org_id).order_by(User.id).limit(1)
    )
    if user is None:
        raise ValueError("ORG_USER_REQUIRED")
    return user


def analyze_parcel(db, parcel: AgriParcel, *, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    bounds, geometry, sample_geometry, analysis_fingerprint = _target(parcel)
    start = (now - timedelta(days=config.FIELD_AUTOMATION_LOOKBACK_DAYS)).date()
    end = now.date()

    features = _earth_search_features(
        bounds,
        start,
        end,
        config.FIELD_AUTOMATION_CLOUD_COVER_LTE,
        12,
    )
    selected_feature = None
    selected_scene = None
    selected_plan = None
    for feature in features:
        scene = _scene_from_feature(feature)
        if not scene.get("id") or scene.get("geometry") is None:
            continue
        try:
            plan = build_multi_index_plan(feature)
        except ProcessingPlanError:
            continue
        selected_feature, selected_scene, selected_plan = feature, scene, plan
        break

    if selected_feature is None or selected_scene is None or selected_plan is None:
        return {"parcel_id": parcel.id, "status": "NO_USABLE_SCENE", "created": 0}

    acquired_at = _scene_time(selected_scene)
    scene_id = str(selected_scene["id"])
    user = _operator(db, parcel)

    try:
        spectral = compute_multi_index_statistics(
            selected_plan,
            bounds,
            geometry_wgs84=geometry,
        )
    except (RasterCapacityError, RasterStatisticsError) as exc:
        raise RuntimeError(type(exc).__name__) from exc

    created = 0
    skipped = 0
    rows = []
    for index_key in AUTOMATED_INDICES:
        result = (spectral.get("indices") or {}).get(index_key) or {}
        pixels = result.get("pixels") or {}
        statistics = result.get("statistics") or {}
        mean = statistics.get("mean")
        valid_fraction = float(pixels.get("valid_fraction") or 0.0)
        valid_pixels = int(pixels.get("valid") or 0)
        lower, upper = INDEX_BOUNDS[index_key]
        if (
            valid_pixels < MIN_VALID_PIXELS
            or valid_fraction < MIN_VALID_FRACTION
            or not isinstance(mean, (float, int))
            or isinstance(mean, bool)
            or not math.isfinite(float(mean))
            or not (lower <= float(mean) <= upper)
        ):
            skipped += 1
            continue

        source_ref = (
            f"automation:{PROVIDER}:{scene_id}:{index_key}:{analysis_fingerprint}"
        )[:300]
        existing = db.scalar(
            select(AgriObservation).where(
                AgriObservation.org_id == parcel.org_id,
                AgriObservation.parcel_id == parcel.id,
                AgriObservation.metric == index_key,
                AgriObservation.source_type == "satellite",
                AgriObservation.source_ref == source_ref,
            )
        )
        if existing is not None:
            skipped += 1
            continue

        row = AgriObservation(
            org_id=parcel.org_id,
            parcel_id=parcel.id,
            metric=index_key,
            value=round(float(mean), 6),
            unit="index",
            source_type="satellite",
            source_ref=source_ref,
            observed_at=acquired_at,
            evidence_status="INFERRED",
            created_by=user.id,
            is_demo=False,
        )
        db.add(row)
        db.flush()
        rows.append(row.id)
        created += 1

    if created:
        audit(
            db,
            user,
            "field_intelligence_automated",
            "agri_parcels",
            entity_id=parcel.id,
            meta={
                "provider": PROVIDER,
                "scene_id": scene_id,
                "acquired_at": acquired_at.isoformat(),
                "indices_created": created,
                "indices_skipped": skipped,
                "observation_ids": rows,
                "sample_bbox_wgs84": bounds,
                "sample_geometry": sample_geometry,
                "analysis_fingerprint": analysis_fingerprint,
                "processing_plan_fingerprint": spectral.get("processing_plan_fingerprint"),
                "geometry_mask_applied": geometry is not None,
                "evidence_status": "INFERRED",
                "verified": False,
            },
        )

    return {
        "parcel_id": parcel.id,
        "status": "READY",
        "scene_id": scene_id,
        "created": created,
        "skipped": skipped,
    }


def run_cycle(*, org_id: int | None = None) -> dict:
    with SessionLocal() as db:
        query = select(AgriParcel.id).where(
            AgriParcel.archived.is_(False),
            AgriParcel.is_demo.is_(False),
        )
        if org_id is not None:
            query = query.where(AgriParcel.org_id == org_id)
        parcel_ids = db.scalars(
            query.order_by(AgriParcel.id).limit(config.FIELD_AUTOMATION_BATCH_SIZE)
        ).all()

    summary = {
        "eligible": len(parcel_ids),
        "processed": 0,
        "created": 0,
        "no_scene": 0,
        "failed": 0,
    }
    for parcel_id in parcel_ids:
        with SessionLocal() as db:
            parcel = db.scalar(
                select(AgriParcel)
                .where(
                    AgriParcel.id == parcel_id,
                    AgriParcel.archived.is_(False),
                    AgriParcel.is_demo.is_(False),
                )
                .with_for_update(skip_locked=True)
            )
            if parcel is None:
                continue
            try:
                result = analyze_parcel(db, parcel)
                db.commit()
                summary["processed"] += 1
                summary["created"] += int(result.get("created") or 0)
                if result.get("status") == "NO_USABLE_SCENE":
                    summary["no_scene"] += 1
            except Exception as exc:
                db.rollback()
                summary["failed"] += 1
                log.warning(
                    "field automation parcel=%s failed error=%s",
                    parcel_id,
                    type(exc).__name__,
                )
    return summary
