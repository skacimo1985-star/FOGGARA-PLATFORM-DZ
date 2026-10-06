# Open-source integration policy

FOGGARA-DZ uses mature open-source components where they reduce bespoke code
without weakening evidence, tenant isolation, security, or Algerian data
sovereignty requirements.

## Direct integration candidates

| Project | Role in FOGGARA | License | Integration rule |
| --- | --- | --- | --- |
| stac-utils/pystac-client | Standards-based STAC discovery/search | Apache-2.0 | Direct Python dependency; provider URL remains fixed by FOGGARA |
| developmentseed/TiTiler | Dynamic COG/STAC raster tiles and map visualization | MIT | Prefer separate tiler service; never expose arbitrary user URLs |
| sentinel-hub/eo-learn | EO time-series workflows, cloud masks, feature extraction | MIT | Batch/worker layer, not request-thread processing |
| Open-EO/openeo-python-client | Optional distributed EO backend connector | Apache-2.0 | Adapter behind FOGGARA authorization and provenance |
| torchgeo/torchgeo | Geospatial ML datasets/models | MIT | Offline model pipeline with validation before operational use |

## Service-separated/reference components

| Project | Role | License | Rule |
| --- | --- | --- | --- |
| FraunhoferIOSB/FROST-Server | OGC SensorThings API for IoT | LGPL-3.0 | Separate service connected through authenticated adapter |
| farmOS/farmOS | Farm recordkeeping/domain model reference | GPL-2.0 | Reference/API interoperability only; do not copy GPL core into FOGGARA |
| open-meteo/open-meteo | Weather data / optional self-hosting | AGPL-3.0 code, CC BY 4.0 API data | Use attributed data API for MVP or isolate an AGPL service; do not embed server source into FOGGARA core |

## Non-negotiable engineering rules

1. Existing FOGGARA repository remains the source of truth.
2. No wholesale repository cloning into the application.
3. Every imported dependency is pinned, audited, tested, and attributed.
4. GPL/AGPL/LGPL obligations are reviewed before code reuse or deployment.
5. Remote-sensing and IoT outputs preserve OBSERVED / VERIFIED / COMPUTED /
   INFERRED / PROPOSED provenance.
6. No external component may bypass RBAC/ABAC, tenant isolation, audit logging,
   rate limits, or FOGGARA's fixed-provider/allow-list controls.
7. Heavy EO/ML workloads are moved to workers/services rather than blocking the
   FastAPI request path.
