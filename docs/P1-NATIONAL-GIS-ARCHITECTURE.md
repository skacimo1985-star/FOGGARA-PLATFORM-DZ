# FOGGARA-DZ P1 — National Geospatial Core Architecture Decision

Status: ACCEPTED FOR IMPLEMENTATION
Branch: `feat/p1-national-gis-postgis`
Starting main SHA: `1843e46bffc6ac3878a8b4f64c27d8b38b062b93`
Date: 2026-10-03

## 1. Goal

Build the national geospatial core as a first-class decision context, not a map-only feature.

Administrative hierarchy:

`Wilaya -> Daira -> Commune -> Site -> Resource / Asset / Project`

The hierarchy MUST be temporally versioned so future territorial reforms do not require destructive rewrites.

## 2. 2026 territorial baseline

The implementation MUST NOT hard-code the obsolete 58-wilaya assumption.

The territorial law published in Official Journal No. 25 (5 April 2026), Law 26-06 dated 4 April 2026, establishes 69 wilayas and 1541 communes.

Authoritative naming and parent relationships should be sourced from Algerian official publications / Ministry of Interior datasets where available.

Community datasets may be used only as import aids or cross-checks and MUST carry explicit provenance.

## 3. Open-source component policy

Selected:
- PostgreSQL + PostGIS — system of record for spatial relations.
- MapLibre GL JS — browser map rendering; BSD-3-Clause.
- Martin — optional vector-tile serving layer for scale; MIT/Apache-2.0.
- TiTiler — later raster/satellite delivery layer; MIT.
- Existing React + Vite + Tailwind + Radix stack remains in place.

Deferred:
- deck.gl only when dataset density/3D/large GPU layers justify it.

Not selected for the core:
- GeoServer, because the project currently prefers permissive-license components and GeoServer is GPL-2.0-or-later. It may be evaluated later as a separately deployed interoperability service if required.

## 4. Database design

Reference entities:
- administrative_versions
- wilayas
- dairas
- communes

Each reference entity must have:
- stable internal ID
- official code where available
- Arabic / French / English display names without making English legally authoritative
- valid_from / valid_to
- source_uri / source_title / source_date
- verification status
- optional geometry in PostgreSQL/PostGIS

Operational entities:
- sites remain organization-scoped.
- sites link to commune/daira/wilaya reference IDs.
- spatial point geometry uses EPSG:4326.
- existing lat/lon are retained during migration for compatibility and validation; geometry becomes canonical after verification.

Spatial indexes:
- GiST indexes on geometry columns.
- conventional indexes on administrative parent IDs and org-scoped foreign keys.

## 5. Security rules

All operational spatial queries MUST:
- derive org_id from the authenticated user, never from client input;
- apply organization isolation before distance/intersection evaluation where possible;
- cap bbox area, radius, result count and page size;
- reject malformed coordinates and invalid geometry;
- avoid side-channel leakage through nearest/intersects responses.

Reference administrative boundaries are public-reference data; operational sites/assets remain access-controlled.

## 6. API

Planned endpoints:
- GET /api/gis/wilayas
- GET /api/gis/wilayas/{id}/dairas
- GET /api/gis/dairas/{id}/communes
- GET /api/gis/sites.geojson
- GET /api/gis/sites/within
- GET /api/gis/sites/intersects
- GET /api/gis/sites/nearest

Responses use RFC 7946 GeoJSON where applicable.

## 7. Frontend

The existing GIS table is to become a true interactive geospatial workspace using MapLibre GL JS while preserving:
- current React/Vite architecture;
- AR/FR/EN;
- RTL for Arabic;
- existing auth and API client;
- the current application design language.

No external proprietary map SDK is required for core operation.

## 8. Scale path

Phase 1:
- GeoJSON from FastAPI/PostGIS for controlled organization-scoped datasets.

Phase 2:
- Martin for vector tiles when national layers become too large for direct GeoJSON.

Phase 3:
- TiTiler for satellite/raster products and agronomic indices.
- deck.gl only for high-volume/3D/advanced analytical visualization.

## 9. Data provenance

No administrative boundary geometry may be presented as official unless its source is official and recorded.

Every imported administrative dataset must record:
- source
- retrieval/publication date
- license
- checksum/version
- importer version
- verification status

## 10. Definition of done for P1

P1 is complete only when:
- PostGIS is enabled in CI and production-compatible compose/deployment;
- territorial reference tables are migration-managed;
- current 69-wilaya hierarchy is represented from verified sources;
- organization-scoped Site geometry is operational;
- GeoJSON + within/intersects/nearest endpoints pass real PostGIS tests;
- GIS frontend renders authorized data on MapLibre;
- AR/FR/EN parity remains green;
- security regression tests pass;
- existing baseline does not regress;
- CI is green.


## 11. Official hierarchy import gate

Daïra/commune hierarchy imports are intentionally offline and review-gated.

Command:

```bash
cd app/backend
python -m scripts.import_admin_reference <official.json> \
  --sha256 <reviewed-sha256> \
  --verified \
  --complete-2026
```

Rules:

- the importer never downloads data;
- the exact source file is pinned by SHA-256;
- provenance metadata is mandatory;
- `--complete-2026` requires exactly 69 wilayas and 1541 communes;
- parent links (wilaya -> daira -> commune) are validated before writes;
- a verified flag requires explicit operator approval;
- an existing version code is immutable: the same checksum is idempotent, while a different checksum is rejected and requires a new version code;
- boundary geometry remains a separate reviewed import because administrative names/hierarchy and polygon licensing/provenance are different assurance concerns.

This prevents community/cached datasets from being silently promoted to official national reference data.
