# FOGGARA FIELD — Native GIS and Satellite Field Preview

**Product:** FOGGARA-DZ / EURL SIREP OASES NEXUS WEFEH
**Current implementation:** first operational, non-persistent public field-preview service integrated into the existing monorepo. It does **not** link visitors to external GIS web apps.

## Direct user journey

1. Open `/gis`, **inside FOGGARA**; no account required to draw a temporary area.
2. Draw a GeoJSON polygon with the existing in-app MapLibre controls or select a rectangle. The selected AOI is visible on the map. The app reports WGS84 bounds and a preview area estimate.
3. Click **Search real scenes**; FOGGARA's API `GET /api/expo/satellite/scenes` searches actual Sentinel-2 L2A scenes from Element 84 Earth Search for the selected AOI and date range. Results include acquisition dates and provider scene-level cloud coverage, not synthetic indices.
4. Click **Compute real NDVI**; FOGGARA's own FastAPI endpoint `POST /api/expo/satellite/ndvi-preview` validates the polygon on the server, restricts geography to Algeria and the raster window to at most 1,600 estimated 10m pixels, searches live scenes, and calls the existing Rasterio engine. The computation must apply a **polygon mask**, SCL cloud/invalid-pixel masks and a valid pixel count. If no usable scene or quality-masked pixels exist, returns `NO_USABLE_SCENE` and **no NDVI number**.
5. The UI shows a numerical NDVI only if the backend returned a valid polygon-masked value, and always labels it **COMPUTED, not field VERIFIED**. Field biomass, diagnosis, soil chemistry and water availability are never inferred directly from NDVI.
6. Use **Save the field in FOGGARA** to carry the temporary geometry through organization login to `/app/gis` via session-only storage. The existing authenticated parcel API then persists it to the organization database with audit and tenant isolation. Visitor previews never write to tenant tables.

**Important:** The guest handoff is a convenience, not an authentication bypass. Signing in with a real organization account is required before saving to the persistent database.

## What is integrated, not linked out

| Function | In-repository implementation |
|---|---|
| Interactive base map + sketch controls | `app/src/components/NationalMap.tsx` — bundled MapLibre GL JS (BSD-3-Clause); base maps still depend on online tile service |
| Geometry area preview | `app/src/lib/geojson-area.ts`, Turf.js-style geodesic area adaptation (MIT) |
| AOI guest-to-member transfer | `app/src/lib/foggara-aoi.ts` in sessionStorage (no organization data) |
| Live Sentinel STAC discovery | `app/backend/app/routers/expo.py` and `remote_sensing_catalog.py` |
| Pixel-level NDVI, cloud and polygon masking | Existing `app/backend/app/services/remote_sensing_raster.py` using Rasterio (BSD-3-Clause) |
| Protected organizations and parcels | Existing `app/backend/app/routers/agriculture_operations.py`; scoped PostgreSQL |

Open source projects provide **licensed components**; FOGGARA owns its UI, workflow, API, evidence semantics, storage and security policies. This is **not a copy of Sat2Farm**, and licenses/attributions are preserved.

## Public limits and security

- Algeria only; polygon must pass server geometry validation.
- Maximum AOI BBOX: 1,600 estimated 10m pixels, substantially less than a large farm district.
- Last 31 days or smaller selected range; real acquisitions may not be available.
- Max 4 provider scenes considered; one successful NDVI result per request.
- Public per-process rate control: 3 requests per 5 minutes per rate-limit client key, on top of the engine's concurrency semaphore. Behind proxies, client key derivation depends on explicitly configured trusted peers; do **not** pretend this is a globally distributed per-user quota.
- No dynamic provider URLs, no untrusted STAC endpoints supplied by user, no public private-tenant data exposure.
- **No database write** from visitor preview. Temporary AOI is stored only in the browser session.
- No claim of real-time satellite imagery (acquisition time is returned explicitly).
- No claim that NDVI diagnoses soil pH, NPK, diseases, or crop yield.

## Acceptance gates

- Vite/TypeScript production build.
- Public GIS Node tests: in-platform map drawing, STAC calls, true NDVI API, handoff.
- Backend tests: real geometry data forwarded to Rasterio; invalid extent rejected before provider IO; empty catalogue returns no fake metrics; invalid mask returns no result; rate limiter returns HTTP 429.
- Real browser test from Algeria: small (ideally 1-4 hectare) polygon; true scene and NDVI preview, if provider has imagery.
- Signed-in end-to-end: preserved AOI -> save parcel -> refresh -> persistent DB record and geometry.
- Monitor provider timeouts and Render memory consumption. **GitHub Actions status is a separate gate; do not confuse build completion with full E2E acceptance.**
