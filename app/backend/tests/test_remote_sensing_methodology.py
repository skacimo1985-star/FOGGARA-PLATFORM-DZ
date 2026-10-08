from app.routers import remote_sensing_catalog
from app.services.remote_sensing_methodology import operational_quality_indicator
from tests.conftest import login


def _study_feature(scene_id: str, acquired: str, cloud: float):
    return {
        "type": "Feature",
        "id": scene_id,
        "collection": "sentinel-2-l2a",
        "bbox": [2.0, 33.0, 2.01, 33.01],
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[2.0, 33.0], [2.01, 33.0], [2.01, 33.01], [2.0, 33.01], [2.0, 33.0]]],
        },
        "properties": {
            "datetime": acquired,
            "eo:cloud_cover": cloud,
            "platform": "sentinel-2a",
            "constellation": "sentinel-2",
        },
        "assets": {},
        "links": [],
    }


def _stats(mean: float, valid_fraction: float):
    return {
        "scene_id": "scene",
        "index": "ndvi",
        "formula_version": "foggara-rs-v2",
        "processing_plan_fingerprint": "abc123",
        "analysis_bbox_wgs84": [2.0, 33.0, 2.01, 33.01],
        "grid": {
            "crs": "EPSG:32631",
            "width": 100,
            "height": 100,
            "resolution_m": 10.0,
            "effective_source_resolution_m": 10.0,
            "resampled": False,
        },
        "mask": {
            "method": "sentinel-2-scl",
            "masked_scl_classes": [0, 1, 3, 8, 9, 10, 11],
            "cloud_masked_pixel_count": 100,
            "source_nodata_pixel_count": 0,
            "formula_nodata_pixel_count": 0,
        },
        "pixels": {
            "total": 10000,
            "valid": int(10000 * valid_fraction),
            "masked": 10000 - int(10000 * valid_fraction),
            "valid_fraction": valid_fraction,
        },
        "statistics": {"min": mean - 0.1, "max": mean + 0.1, "mean": mean, "median": mean},
        "provenance": {"provider_metadata": "OBSERVED", "derived_index": "COMPUTED", "verified": False, "persisted": False},
    }


def test_operational_quality_indicator_is_transparent_not_certification():
    indicator = operational_quality_indicator(0.9, 10)
    assert indicator["grade"] == "A"
    assert indicator["standard_claim"] is False
    assert "not a formal uncertainty" in indicator["note"]


def test_methodology_and_provider_registry_are_authenticated(client, world):
    headers = login(client, "o1m@t.dz")

    methodology = client.get("/api/remote-sensing/methodology", headers=headers)
    assert methodology.status_code == 200
    body = methodology.json()
    ids = {row["id"] for row in body["standards_and_guidance"]}
    assert {"qa4eo", "stac", "copernicus-s2-l2a", "fao56"}.issubset(ids)
    assert body["evidence_chain"]["spectral_index"] == "COMPUTED"
    assert "VERIFIED" in body["evidence_chain"]["field_confirmed_result"]

    providers = client.get("/api/remote-sensing/providers", headers=headers)
    assert providers.status_code == 200
    pbody = providers.json()
    assert pbody["operational"][0]["id"] == "element84-earth-search"
    assert pbody["operational"][0]["analysis_ready"] is True
    assert pbody["reference_catalogs"][0]["id"] == "copernicus-data-space"
    assert pbody["research_targets"][0]["status"] == "planned_not_operational"


def test_time_series_study_uses_multiple_real_scene_contracts(client, world, monkeypatch):
    features = [
        _study_feature("S2A_20260920_001", "2026-09-20T10:00:00Z", 12.0),
        _study_feature("S2A_20261001_001", "2026-10-01T10:00:00Z", 8.0),
        _study_feature("S2A_20261007_001", "2026-10-07T10:00:00Z", 5.0),
    ]
    means = {
        "S2A_20260920_001": 0.42,
        "S2A_20261001_001": 0.50,
        "S2A_20261007_001": 0.57,
    }

    monkeypatch.setattr(
        remote_sensing_catalog,
        "_earth_search_features",
        lambda *_args, **_kwargs: features,
    )
    monkeypatch.setattr(
        remote_sensing_catalog,
        "build_processing_plan",
        lambda item, index: {"scene_id": item["id"], "index": index},
    )
    monkeypatch.setattr(
        remote_sensing_catalog,
        "compute_index_statistics",
        lambda plan, _bbox: _stats(means[plan["scene_id"]], 0.91),
    )

    headers = login(client, "o1m@t.dz")
    response = client.get(
        "/api/remote-sensing/studies/timeseries"
        "?bbox=2,33,2.01,33.01&start=2026-09-01&end=2026-10-08"
        "&index=ndvi&cloud_cover_lte=25&max_scenes=3",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["scene_count"] == 3
    assert body["trend"]["direction"] == "increasing"
    assert body["trend"]["delta"] == 0.15
    assert body["series"][0]["evidence"]["provider_scene"] == "OBSERVED"
    assert body["series"][0]["evidence"]["derived_index"] == "COMPUTED"
    assert body["series"][0]["evidence"]["study_interpretation"] == "INFERRED"
    assert body["series"][0]["quality_indicator"]["standard_claim"] is False
    assert body["quality_summary"]["mean_operational_score"] is not None


def test_time_series_study_rejects_large_synchronous_aoi(client, world):
    headers = login(client, "o1m@t.dz")
    response = client.get(
        "/api/remote-sensing/studies/timeseries"
        "?bbox=2,33,2.2,33.2&start=2026-09-01&end=2026-10-08&index=ndvi",
        headers=headers,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] in {"STUDY_AREA_TOO_LARGE", "RASTER_ANALYSIS_BOUNDS_INVALID"}
