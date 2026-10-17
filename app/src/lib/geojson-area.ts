/**
 * Spherical WGS84 polygon-area PREVIEW. Exterior area minus interior holes.
 * Based on the spherical-ring method used by Turf.js (MIT).
 * https://github.com/Turfjs/turf/tree/master/packages/turf-area
 * Not a cadastral survey or official land measurement.
 */
export type GeoPoint = [number, number];
export type SimplePolygon = { type: "Polygon"; coordinates: GeoPoint[][] };
const EARTH_RADIUS_METERS = 6_371_008.8;
const RAD = Math.PI / 180;

function validPoint(point: unknown): point is GeoPoint {
  return Array.isArray(point) && point.length === 2 &&
    point.every((n: unknown) => typeof n === "number" && Number.isFinite(n)) &&
    point[0] >= -180 && point[0] <= 180 && point[1] >= -90 && point[1] <= 90;
}

function validRing(ring: unknown): ring is GeoPoint[] {
  if (!Array.isArray(ring) || ring.length < 4 || ring.length > 100_000 ||
      !ring.every(validPoint)) return false;
  const first = ring[0], last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

function sphericalRingArea(ring: GeoPoint[]): number {
  let factor = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    // Normalize longitude jumps at the antimeridian.
    const raw = b[0] - a[0];
    const delta = ((raw + 540) % 360) - 180;
    factor += delta * RAD * (Math.sin(a[1] * RAD) + Math.sin(b[1] * RAD));
  }
  return Math.abs(factor) * EARTH_RADIUS_METERS ** 2 / 2;
}

export function polygonAreaHectares(polygon: SimplePolygon): number {
  if (!polygon || polygon.type !== "Polygon" || !Array.isArray(polygon.coordinates) ||
      polygon.coordinates.length === 0 || !polygon.coordinates.every(validRing)) return 0;
  const [outer, ...holes] = polygon.coordinates;
  const area = sphericalRingArea(outer) - holes.reduce((sum, hole) => sum + sphericalRingArea(hole), 0);
  return Math.max(0, area / 10_000);
}

export function polygonBoundingBox(polygon: SimplePolygon): [number, number, number, number] | null {
  if (!polygon || polygon.type !== "Polygon" || !Array.isArray(polygon.coordinates) ||
      !validRing(polygon.coordinates[0])) return null;
  const ring = polygon.coordinates[0];
  const lons = ring.map(p => p[0]), lats = ring.map(p => p[1]);
  const bbox: [number, number, number, number] = [
    Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats),
  ];
  return bbox[0] < bbox[2] && bbox[1] < bbox[3] ? bbox : null;
}
