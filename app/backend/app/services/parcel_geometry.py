"""Validation and metadata for agricultural parcel boundaries.

FOGGARA stores a simple WGS84 GeoJSON Polygon (one exterior ring). Keeping the
contract deliberately small makes geometry portable across SQLite/PostgreSQL
without pretending that the current deployment already has PostGIS topology.
"""
from __future__ import annotations

import math
from typing import Any

EARTH_RADIUS_M = 6_371_008.8
MAX_BOUNDARY_POINTS = 500
MIN_AREA_HA = 0.001
MAX_AREA_HA = 100_000.0


class ParcelGeometryError(ValueError):
    pass


def _point(raw: Any) -> tuple[float, float]:
    if not isinstance(raw, (list, tuple)) or len(raw) < 2:
        raise ParcelGeometryError("Every boundary position must be [longitude, latitude]")
    try:
        lon, lat = float(raw[0]), float(raw[1])
    except (TypeError, ValueError) as exc:
        raise ParcelGeometryError("Boundary coordinates must be numeric") from exc
    if not math.isfinite(lon) or not math.isfinite(lat):
        raise ParcelGeometryError("Boundary coordinates must be finite")
    if not (-180 <= lon <= 180 and -90 <= lat <= 90):
        raise ParcelGeometryError("Boundary coordinates are outside WGS84 bounds")
    return lon, lat


def _orientation(a, b, c) -> float:
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])


def _segments_intersect(a, b, c, d) -> bool:
    eps = 1e-12
    o1, o2, o3, o4 = (_orientation(a, b, c), _orientation(a, b, d),
                      _orientation(c, d, a), _orientation(c, d, b))
    return ((o1 > eps and o2 < -eps) or (o1 < -eps and o2 > eps)) and (
        (o3 > eps and o4 < -eps) or (o3 < -eps and o4 > eps)
    )


def _assert_simple_ring(points: list[tuple[float, float]]) -> None:
    segment_count = len(points) - 1
    for i in range(segment_count):
        a, b = points[i], points[i + 1]
        for j in range(i + 1, segment_count):
            if j in (i - 1, i, i + 1):
                continue
            if i == 0 and j == segment_count - 1:
                continue
            c, d = points[j], points[j + 1]
            if _segments_intersect(a, b, c, d):
                raise ParcelGeometryError("Parcel boundary self-intersects")


def _projected(points: list[tuple[float, float]]):
    mean_lat = math.radians(sum(lat for _, lat in points[:-1]) / (len(points) - 1))
    cos_lat = max(0.01, abs(math.cos(mean_lat)))
    return [
        (math.radians(lon) * EARTH_RADIUS_M * cos_lat,
         math.radians(lat) * EARTH_RADIUS_M)
        for lon, lat in points
    ], cos_lat


def _perimeter_m(points: list[tuple[float, float]]) -> float:
    total = 0.0
    for (lon1, lat1), (lon2, lat2) in zip(points, points[1:]):
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        d_phi = math.radians(lat2 - lat1)
        d_lam = math.radians(lon2 - lon1)
        a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lam / 2) ** 2
        total += 2 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(a)))
    return total


def _area_centroid(points: list[tuple[float, float]]) -> tuple[float, float, float]:
    projected, cos_lat = _projected(points)
    twice_area = 0.0
    cx_numerator = 0.0
    cy_numerator = 0.0
    for (x1, y1), (x2, y2) in zip(projected, projected[1:]):
        cross = x1 * y2 - x2 * y1
        twice_area += cross
        cx_numerator += (x1 + x2) * cross
        cy_numerator += (y1 + y2) * cross
    if abs(twice_area) < 1e-6:
        raise ParcelGeometryError("Parcel boundary has zero area")
    area_m2 = abs(twice_area) / 2.0
    cx = cx_numerator / (3.0 * twice_area)
    cy = cy_numerator / (3.0 * twice_area)
    lon = math.degrees(cx / (EARTH_RADIUS_M * cos_lat))
    lat = math.degrees(cy / EARTH_RADIUS_M)
    return area_m2 / 10_000.0, lon, lat


def normalize_parcel_boundary(value: Any) -> tuple[dict, dict]:
    if not isinstance(value, dict) or value.get("type") != "Polygon":
        raise ParcelGeometryError("Parcel boundary must be a GeoJSON Polygon")
    coordinates = value.get("coordinates")
    if not isinstance(coordinates, list) or len(coordinates) != 1:
        raise ParcelGeometryError("Parcel boundary currently supports one exterior ring and no holes")
    raw_ring = coordinates[0]
    if not isinstance(raw_ring, list) or not (4 <= len(raw_ring) <= MAX_BOUNDARY_POINTS + 1):
        raise ParcelGeometryError("Parcel boundary must contain 3 to 500 vertices plus closure")
    points = [_point(raw) for raw in raw_ring]
    if points[0] != points[-1]:
        raise ParcelGeometryError("Parcel boundary ring must be closed")
    if len(set(points[:-1])) < 3:
        raise ParcelGeometryError("Parcel boundary requires at least three distinct vertices")
    for first, second in zip(points, points[1:]):
        if first == second:
            raise ParcelGeometryError("Parcel boundary contains duplicate consecutive vertices")
    _assert_simple_ring(points)
    area_ha, centroid_lon, centroid_lat = _area_centroid(points)
    if not MIN_AREA_HA <= area_ha <= MAX_AREA_HA:
        raise ParcelGeometryError("Parcel boundary area is outside supported limits")
    lons = [p[0] for p in points[:-1]]
    lats = [p[1] for p in points[:-1]]
    bbox = [min(lons), min(lats), max(lons), max(lats)]
    if bbox[0] == bbox[2] or bbox[1] == bbox[3]:
        raise ParcelGeometryError("Parcel boundary has no spatial extent")
    normalized = {
        "type": "Polygon",
        "coordinates": [[[round(lon, 8), round(lat, 8)] for lon, lat in points]],
    }
    return normalized, {
        "bbox": bbox,
        "centroid": [centroid_lon, centroid_lat],
        "estimated_area_ha": area_ha,
        "estimated_perimeter_m": _perimeter_m(points),
        "vertex_count": len(points) - 1,
    }
