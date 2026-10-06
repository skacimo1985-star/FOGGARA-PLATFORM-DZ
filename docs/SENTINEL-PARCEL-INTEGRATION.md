# FOGGARA Sentinel-to-Parcel operational integration

The existing FOGGARA STAC/Rasterio pipeline is connected to organization-owned agricultural parcel records.

## Real-data sequence
1. Sign in with an organization account and open `/app/agriculture`.
2. Create/select a non-archived parcel and set its WGS84 centre latitude/longitude.
3. Select a date window and request actual Sentinel-2 L2A scenes from Element 84 Earth Search.
4. Choose a scene and trigger real NDVI processing with the existing cloud/SCL mask.
5. Reject low-quality results (< 35% valid fraction or < 9 valid pixels).
6. Persist its NDVI mean once per parcel/scene (is_demo=false) as an INFERRED observation and add an audit record.
7. Review historic observations from the regular agricultural records view.

## Scientific limits
- **Spatial limitation:** Parcel geometry is not yet a polygon in the current schema, only a point and an area. Computation therefore samples a bounded square around the parcel centre. The result is **not** the whole-parcel NDVI mean. Store the bounding box and method alongside the audit event; do not claim field-wide precision.
- Source scene and acquisition timestamp are obtained from the fixed provider, never from user-provided URLs.
- Rasterio validates COG asset hosts and paths, and bounds raster read sizes.
- The output is COMPUTED from source scenes; agricultural observation remains INFERRED and cannot be promoted to a verified field/laboratory measurement by this path.
- Cloud/no-data masking can leave too few pixels; in that case nothing is persisted.
- No automatic water-use, fertilizer, disease, or yield diagnosis is made from NDVI.
- External-provider outages are surfaced as errors; no artificial measurement fallback is allowed.

## Open-source / data credits
- Rasterio (BSD-3-Clause): https://github.com/rasterio/rasterio — reused from the FOGGARA project.
- Element 84 Earth Search STAC catalogue: https://earth-search.aws.element84.com/v1
- Copernicus Sentinel data: https://dataspace.copernicus.eu/terms-and-conditions (free/full/open legal notice).
- The implementation reuses its existing own REST/SQLAlchemy models and avoids copying farmOS GPL-2.0+ code into FOGGARA.

## Acceptance
- Auth and tenant isolation on all endpoints.
- Real provider metadata and NDVI processing used for persistence.
- Repeat scene submission reuses existing record rather than rewriting it.
- Failed/low-quality results never generate observations.
- Audit contains scene ID, algorithm, sample bbox, valid-pixel count and fingerprint.
- Front-end action exists in both parcel and agriculture overview; no decorative button.
