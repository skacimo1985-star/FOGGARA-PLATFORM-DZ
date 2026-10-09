# FOGGARA-DZ GIS — real operational vertical slice

**Updated:** 2026-10-09. Source repository: `skacimo1985-star/FOGGARA-PLATFORM-DZ`.

## What is now wired end-to-end

1. An authenticated organization user opens `/app/gis` even if it has **zero projects**.
2. The existing **MapLibre GL JS** control can draw a new polygon **before** the organization has a parcel record. The existing rectangle AOI selector remains available.
3. Frontend previews hectares using a geodesic calculation derived from **Turf.js** (`@turf/area`, MIT); the backend **revalidates** the WGS84 GeoJSON and writes its own calculated centroid and hectares, rejecting self-intersections and unreasonable polygon sizes. This is a GIS estimate, not a cadastral survey.
4. `POST /api/agriculture/parcels` saves the actual polygon and field metadata in the existing organization-scoped DB. An active project/site is **optional**. Users may redraw via `PATCH /api/agriculture/parcels/{id}`.
5. A selected AOI **without a project** is eligible for `GET /api/remote-sensing/studies/field-intelligence`: the existing Element84 Earth Search STAC and Rasterio workflow searches real Sentinel-2 L2A scenes; if no usable scene exists the UI must report that result, not invent NDVI.
6. Authenticated `GET /api/gis/operational-status` executes real organization-scoped database counts for sites/projects/parcels/mapped parcels/observations, and returns the SQLAlchemy dialect (**postgresql** or **sqlite**) without exposing any database URL, password or other organization's records. Provider liveness is explicitly **not verified** by this endpoint.
7. The public `/gis` remains read-only and does not expose organization or project data.

## What was actually reused from open source

| Component | Project upstream | License | Used in this repo |
|---|---|---|---|
| Map, layers, drawing interaction | [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) | BSD-3-Clause | Vendored client map/worker and existing polygon-drawing tools |
| Geodesic polygon area | [Turf.js `@turf/area`](https://github.com/Turfjs/turf/tree/master/packages/turf-area) | MIT | Adapted spherical ring-area method under `app/src/lib/geojson-area.ts`; upstream credit in source |
| Satellite catalog | [Earth Search / Element84](https://element84.com/earth-search/) | Public STAC data service; no availability guarantee | Existing live scene search in backend |
| Raster processing | [Rasterio](https://github.com/rasterio/rasterio) | BSD-3-Clause | Existing SCL-masked Sentinel spectral indices, verified source metadata but no fabricated ground truth |

**Not copied/integrated:** complete Sat2Farm application, QGIS Server, GeoServer. Do not claim those systems are installed.

## Database caution

Render does not show a **Render-hosted PostgreSQL** instance in this workspace. An **external managed DB (e.g. Supabase)** may still be in use. The runtime `DATABASE_URL` is intentionally not read or exposed here. The authenticated diagnostics show the actual connected DB **dialect and this organization's record counts**, not whether backups, PostGIS extension, or storage retention have been verified. SQLite in production must be treated as *unverified persistence*. The DB remains isolated by `org_id` across API operations.

## Real acceptance, still necessary

- Verify logged-in `/app/gis` with a real tenant on desktop/mobile, draw a 4+ vertex polygon, enter parcel name and crop, save, refresh and confirm the parcel persists and the mapped boundary can be redrawn.
- Select an AOI and date window; run actual Sentinel provider search and a bounded NDVI calculation; verify acquisition time, cloud/valid-pixel masks and imagery provenance. A no-data result must not be converted into fake analysis.
- Check `/api/gis/operational-status` for the actual DB dialect and tenant record counts, database backups and service env configuration **using secure operator access**, not by sharing credentials.
- Ensure all affected API tests, Vite TypeScript build, Node GIS tests and Render deployment succeed. Browser rendering and provider uptime require independent live verification.
