# Open-source production components

FOGGARA-DZ integrates reviewed open-source building blocks instead of treating
screens as implementations.

| Component | Upstream | License | FOGGARA use |
|---|---|---|---|
| gmqtt | wialon/gmqtt | MIT | Async MQTT 3.1.1/5 client used by the real edge worker in `app/mqtt_edge_runtime.py`. |
| OpenAgri Weather Service | agstack/OpenAgri-WeatherService | Apache-2.0 in upstream LICENSE | Architectural/reference source for agricultural weather workflows. FOGGARA keeps its own provider adapter and data model and now creates stored irrigation plans from live ET0/rain forecasts. |
| Sentinel-2 Earth Search | Element 84 Earth Search STAC | public STAC service/data terms apply | Scene discovery for automated parcel field intelligence. |
| rasterio | rasterio/rasterio | BSD-3-Clause | Reads Sentinel-2 cloud-optimized GeoTIFF bands and masks results to parcel geometry. |

## Integration rules

- No upstream credentials are committed to the repository.
- External payloads never decide tenant ownership; organization and resource
  identity are resolved from authenticated context, topic identity and database.
- External forecasts remain INFERRED and are never represented as field
  measurements.
- Automated satellite and weather outputs remain reviewable and auditable.
- Copyleft projects may be integrated as separate services when appropriate,
  but source is not copied into the FOGGARA codebase without a license review.
