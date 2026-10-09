/**
 * Spherical polygon area for GeoJSON WGS84 exterior rings.
 * Adapted from the geodesic ring area method in @turf/area (Turf.js, MIT).
 * Upstream: https://github.com/Turfjs/turf/tree/master/packages/turf-area
 * Copyright Turf.js contributors. This adaptation is supplied under MIT.
 *
 * This is a client-side preview; the backend validates and computes official
 * persisted geometry metadata. Not a cadastral/legal area measurement.
 */
export type GeoPoint=[number,number];
export type SimplePolygon={type:"Polygon";coordinates:GeoPoint[][]};
const EARTH_RADIUS_METERS=6371008.8;
const DEG_TO_RAD=Math.PI/180;
export function polygonAreaHectares(polygon:SimplePolygon):number{
  const ring=polygon.coordinates[0];
  if(!Array.isArray(ring)||ring.length<4) return 0;
  let twiceAreaFactor=0;
  for(let i=0;i<ring.length-1;i++){
    const [lon1,lat1]=ring[i];
    const [lon2,lat2]=ring[i+1];
    if(![lon1,lat1,lon2,lat2].every(Number.isFinite)) return 0;
    twiceAreaFactor+=(lon2-lon1)*DEG_TO_RAD*
      (Math.sin(lat1*DEG_TO_RAD)+Math.sin(lat2*DEG_TO_RAD));
  }
  return Math.abs(twiceAreaFactor)*EARTH_RADIUS_METERS**2/2/10_000;
}
export function polygonBoundingBox(polygon:SimplePolygon):[number,number,number,number]|null{
  const ring=polygon.coordinates[0];
  if(!Array.isArray(ring)||ring.length<4) return null;
  const lons=ring.map(p=>p[0]),lats=ring.map(p=>p[1]);
  if(![...lons,...lats].every(Number.isFinite))return null;
  const bbox:[number,number,number,number]=[Math.min(...lons),Math.min(...lats),Math.max(...lons),Math.max(...lats)];
  return bbox[0]<bbox[2]&&bbox[1]<bbox[3]?bbox:null;
}
