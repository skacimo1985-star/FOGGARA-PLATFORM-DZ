# FOGGARA-DZ GIS: implementation vs. open-source upstreams

Verified in the repository on 2026-10-09:

| Layer | What is actually present | Upstream/source | Status |
|---|---|---|---|
| Interactive map | MapLibre GL JS v6.11.2, vendored ES modules, worker and CSS in `app/public/vendor/`; Algeria viewport; drawing/measurement; public viewer `/gis` | https://github.com/maplibre/maplibre-gl-js | Integrated UI component, external tiles required |
| Basemap | OpenFreeMap Liberty style from `https://tiles.openfreemap.org/styles/liberty`; OSM contributors' data | https://openfreemap.org/ / https://www.openstreetmap.org/ | External live provider; not self-hosted, network and availability dependent |
| GIS workspace | `app/src/pages/Gis.tsx`, private organization-scoped API calls, `NationalMap` | FOGGARA application | Access requires an authenticated account at `/app/gis` |
| GIS guest viewer | `app/src/pages/PublicGis.tsx`, no tenant API calls, no private geometries | FOGGARA integration over vendored MapLibre | Accessible at `/gis`; only basemap, selection and measurement |
| Satellite discovery | STAC query routes, Element 84 Earth Search / Sentinel-2 metadata, raster workflows | https://earth-search.aws.element84.com/v1 | Provider dependent, not a guaranteed on-demand analysis |
| Raster computation | `rasterio`, Sentinel-2 indices and clipping code under `app/backend/app/services/` | https://github.com/rasterio/rasterio | Integrated backend libraries, valid scenes and authorized projects required |
| OGC interoperability | `app/backend/app/routers/ogc_features.py` | OGC API Features concepts | Internal compatibility endpoints, not OGC-certified |
| Production GIS datastore | DB models and spatial routes, target PostGIS in architecture | https://postgis.net/ | Must verify actual production database backend and extensions before claiming PostGIS is active |

**Not integrated as a complete cloned application:** Sat2Farm (the commercial app), eo-learn, GeoServer or QGIS Server. They should not be described as installed or active.

## Public/private boundary

- `/gis`: accessible without a login. Displays **no** organization/project-specific data and does not call protected API endpoints.
- `/app/gis`: maintains existing organization permissions. Signed-out visitors reach the public viewer; signed-in visitors reach the operational workspace.
- `/app/agriculture`: remains protected. Raster analyses and saving results still require proper authorization, area selection and valid input data.

## Validation requirements

Before calling GIS production-ready, check login and guest routes, OpenFreeMap tile retrieval from Algeria, the local MapLibre Worker module, drawing/measurement controls, parcel authorization, raster source provenance, mobile layout and frontend build. A successful HTTP 200 for the SPA alone is not sufficient to establish an operational map.
