from app.routers import remote_sensing_catalog
from app.services.field_intelligence import public_field_capabilities, resolve_crop_profile
from app.services import isda_soil_context
from tests.conftest import login


def _feature():
    return {
        "type": "Feature",
        "id": "S2A_FIELD_001",
        "collection": "sentinel-2-l2a",
        "bbox": [2.0, 33.0, 2.01, 33.01],
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[2.0, 33.0], [2.01, 33.0], [2.01, 33.01], [2.0, 33.01], [2.0, 33.0]]],
        },
        "properties": {
            "datetime": "2026-10-07T10:00:00Z",
            "eo:cloud_cover": 8.0,
            "platform": "sentinel-2a",
            "constellation": "sentinel-2",
        },
        "assets": {},
        "links": [],
    }


def _index(mean: float, domain: str):
    return {
        "statistics": {"min": mean - 0.1, "max": mean + 0.1, "mean": mean, "median": mean},
        "pixels": {"total": 10000, "valid": 9000, "masked": 1000, "valid_fraction": 0.9},
        "source_nodata_pixel_count": 0,
        "formula_version": "foggara-rs-v2",
        "formula": "formula",
        "application_domain": domain,
        "reference_url": "https://example.test/reference",
    }


def _multi():
    return {
        "scene_id": "S2A_FIELD_001",
        "indices": {
            "ndvi": _index(0.62, "vegetation"),
            "evi": _index(0.51, "vegetation"),
            "savi": _index(0.56, "vegetation"),
            "ndwi": _index(-0.12, "water"),
            "ndmi": _index(0.18, "vegetation_moisture"),
            "lswi": _index(0.18, "land_surface_water"),
            "bsi": _index(-0.21, "bare_soil_screening"),
        },
        "processing_plan_fingerprint": "field-fingerprint",
        "analysis_bbox_wgs84": [2.0, 33.0, 2.01, 33.01],
        "grid": {
            "crs": "EPSG:32631",
            "width": 100,
            "height": 100,
            "resolution_m": 10.0,
            "effective_source_resolution_m": 20.0,
            "resampled": True,
        },
        "mask": {
            "method": "sentinel-2-scl",
            "masked_scl_classes": [0, 1, 3, 8, 9, 10, 11],
            "cloud_masked_pixel_count": 500,
            "source_nodata_pixel_count": 0,
        },
        "provenance": {
            "provider_metadata": "OBSERVED",
            "derived_indices": "COMPUTED",
            "verified": False,
            "persisted": False,
        },
    }


def _soil():
    return {
        "provider": "iSDAsoil",
        "source": "AWS Registry of Open Data / public iSDAsoil COGs",
        "bbox_wgs84": [2.0, 33.0, 2.01, 33.01],
        "sampling": "AOI centre + four interior points",
        "resolution_m": 30,
        "properties": {
            "clay_content": {
                "status": "AVAILABLE",
                "mean_0_20": 22.0,
                "spatial_spread": 1.0,
                "prediction_stdev_0_20": 3.0,
                "sample_count": 5,
                "label": "Clay content",
                "unit": "%",
                "resolution_m": 30,
                "depth_cm": "0-20",
            }
        },
        "available_properties": ["clay_content"],
        "unavailable_properties": [],
        "evidence_status": "INFERRED",
        "verified": False,
        "uncertainty": "Provider prediction standard deviation is reported when available.",
        "limitations": ["Model prediction"],
        "attribution": "iSDAsoil / CC BY 4.0",
    }


def test_crop_profiles_accept_date_palm_and_arbitrary_crops():
    palm = resolve_crop_profile("نخيل التمر")
    assert palm["id"] == "date_palm"
    assert palm["crop_identity_status"] == "USER_DECLARED"
    assert "individual palm counting" in " ".join(palm["limitations"]).lower()

    generic = resolve_crop_profile("quinoa experimental")
    assert generic["id"] == "generic"
    assert generic["declared_crop"] == "quinoa experimental"


def test_global_field_capabilities_register_open_world_projects():
    body = public_field_capabilities()
    ids = {row["id"] for row in body["global_projects"]}
    assert {
        "digital-earth-africa-crop-mask",
        "esa-worldcereal",
        "fao-wapor",
        "isda-soil",
        "date-palm-wv3",
    }.issubset(ids)
    assert body["evidence_contract"]["spectral_indices"] == "COMPUTED"


def test_field_intelligence_combines_satellite_and_soil_context(client, world, monkeypatch):
    monkeypatch.setattr(remote_sensing_catalog, "_earth_search_features", lambda *_args, **_kwargs: [_feature()])
    monkeypatch.setattr(remote_sensing_catalog, "build_multi_index_plan", lambda _item: {"scene_id": "S2A_FIELD_001"})
    monkeypatch.setattr(remote_sensing_catalog, "compute_multi_index_statistics", lambda _plan, _bbox: _multi())
    monkeypatch.setattr(remote_sensing_catalog, "sample_soil_context", lambda _bbox: _soil())

    headers = login(client, "o1m@t.dz")
    response = client.get(
        "/api/remote-sensing/studies/field-intelligence"
        "?bbox=2,33,2.01,33.01&start=2026-09-01&end=2026-10-08"
        "&crop=Date%20palm&cloud_cover_lte=25",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "READY"
    assert body["crop_profile"]["id"] == "date_palm"
    assert body["scene"]["id"] == "S2A_FIELD_001"
    assert body["domains"]["vegetation"]["indices"]["ndvi"]["statistics"]["mean"] == 0.62
    assert body["domains"]["canopy_moisture"]["indices"]["ndmi"]["statistics"]["mean"] == 0.18
    assert body["domains"]["surface_water"]["indices"]["ndwi"]["statistics"]["mean"] == -0.12
    assert body["domains"]["soil_surface"]["indices"]["bsi"]["statistics"]["mean"] == -0.21
    assert body["soil_context"]["provider"] == "iSDAsoil"
    assert body["evidence"]["satellite_scene"] == "OBSERVED"
    assert body["evidence"]["spectral_indices"] == "COMPUTED"
    assert body["evidence"]["soil_spatial_model"] == "INFERRED"
    assert body["evidence"]["verified"] is False


def test_field_intelligence_no_scene_fails_closed_without_fake_results(client, world, monkeypatch):
    monkeypatch.setattr(remote_sensing_catalog, "_earth_search_features", lambda *_args, **_kwargs: [])
    headers = login(client, "o1m@t.dz")
    response = client.get(
        "/api/remote-sensing/studies/field-intelligence"
        "?bbox=2,33,2.01,33.01&start=2026-09-01&end=2026-10-08&crop=wheat",
        headers=headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "NO_USABLE_SCENE"
    assert body["scene"] is None
    assert body["domains"] == {}


def test_isda_context_fails_per_property_without_fabricating(monkeypatch):
    def unavailable(_product, _points):
        raise isda_soil_context.SoilContextError("offline")

    monkeypatch.setattr(isda_soil_context, "_sample_product", unavailable)
    result = isda_soil_context.sample_soil_context([2.0, 33.0, 2.01, 33.01])
    assert result["available_properties"] == []
    assert set(result["unavailable_properties"]) == set(isda_soil_context.PRODUCTS)
    assert result["verified"] is False


def test_field_intelligence_saved_parcel_masks_to_database_polygon_and_overrides_bbox(
    client, world, monkeypatch,
):
    """The client must not be able to substitute an arbitrary AOI for a saved field."""
    headers = login(client, "o1m@t.dz")
    stored_geometry = {
        "type": "Polygon",
        "coordinates": [[
            [2.0, 33.0], [2.01, 33.0], [2.007, 33.006],
            [2.0, 33.01], [2.0, 33.0],
        ]],
    }
    created = client.post("/api/agriculture/parcels", headers=headers, json={
        "name": "Real oasis plot", "crop": "date palm", "area_ha": 9,
        "location": "Laghouat", "boundary_geojson": stored_geometry,
    })
    assert created.status_code == 201, created.text
    parcel_id = created.json()["id"]
    calls = {}
    def scenes(bbox, *_args, **_kwargs):
        calls["catalog_bbox"] = bbox
        return [_feature()]
    def raster(_plan, bbox, geometry_wgs84=None):
        calls["analysis_bbox"] = bbox
        calls["geometry"] = geometry_wgs84
        return _multi()

    monkeypatch.setattr(remote_sensing_catalog, "_earth_search_features", scenes)
    monkeypatch.setattr(remote_sensing_catalog, "build_multi_index_plan", lambda _item: {"scene_id": "S2A_FIELD_001"})
    monkeypatch.setattr(remote_sensing_catalog, "compute_multi_index_statistics", raster)
    monkeypatch.setattr(remote_sensing_catalog, "sample_soil_context", lambda _bbox: _soil())

    response = client.get("/api/remote-sensing/studies/field-intelligence", headers=headers, params={
        "parcel_id": parcel_id,
        "bbox": "20,10,20.01,10.01",  # deliberately wrong: DB geometry must win
        "start": "2026-09-01",
        "end": "2026-10-08",
        "crop": "wheat",  # deliberately wrong: declared parcel crop must win
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "READY"
    assert body["parcel_id"] == parcel_id
    assert body["sample_geometry"] == "PARCEL_BOUNDARY_GEOJSON"
    assert body["geometry_mask_applied"] is True
    assert body["crop_profile"]["id"] == "date_palm"
    assert calls["geometry"]["type"] == "Polygon"
    assert calls["geometry"]["coordinates"] == stored_geometry["coordinates"]
    assert calls["analysis_bbox"] == [2.0, 33.0, 2.01, 33.01]
    assert calls["catalog_bbox"] == [2.0, 33.0, 2.01, 33.01]
    assert body["evidence"]["verified"] is False


def test_field_intelligence_rejects_other_tenant_parcel_before_provider_request(
    client, world, monkeypatch,
):
    own_headers = login(client, "o1m@t.dz")
    other_headers = login(client, "o2m@t.dz")
    created = client.post("/api/agriculture/parcels", headers=own_headers, json={
        "name": "Tenant-protected parcel", "crop": "date palm",
        "area_ha": 1, "location": "Laghouat", "lat": 33.8, "lon": 2.87,
    })
    assert created.status_code == 201
    monkeypatch.setattr(
        remote_sensing_catalog, "_earth_search_features",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("Provider must not be contacted")),
    )
    result = client.get("/api/remote-sensing/studies/field-intelligence", headers=other_headers, params={
        "parcel_id": created.json()["id"],
        "start": "2026-09-01", "end": "2026-10-08",
    })
    assert result.status_code == 404
    assert result.json()["detail"]["code"] == "NOT_FOUND"
    anonymous = client.get("/api/remote-sensing/studies/field-intelligence", params={
        "parcel_id": created.json()["id"], "start": "2026-09-01", "end": "2026-10-08",
    })
    assert anonymous.status_code == 401


def test_field_intelligence_point_only_parcel_is_not_mislabelled_as_polygon(
    client, world, monkeypatch,
):
    headers = login(client, "o1m@t.dz")
    created = client.post("/api/agriculture/parcels", headers=headers, json={
        "name": "No surveyed boundaries", "crop": "wheat", "area_ha": 2,
        "location": "Laghouat", "lat": 33.8, "lon": 2.87,
    })
    assert created.status_code == 201
    monkeypatch.setattr(remote_sensing_catalog, "_earth_search_features", lambda *_args, **_kwargs: [])
    response = client.get("/api/remote-sensing/studies/field-intelligence", headers=headers, params={
        "parcel_id": created.json()["id"], "start": "2026-09-01", "end": "2026-10-08",
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "NO_USABLE_SCENE"
    assert body["sample_geometry"] == "POINT_CENTERED_ESTIMATE_NOT_PARCEL_BOUNDARY"
    assert body["geometry_mask_applied"] is False
    assert body["scene"] is None
    assert body["domains"] == {}


def test_field_intelligence_requires_a_real_analysis_target(client, world):
    headers = login(client, "o1m@t.dz")
    response = client.get("/api/remote-sensing/studies/field-intelligence", headers=headers, params={
        "start": "2026-09-01", "end": "2026-10-08",
    })
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "ANALYSIS_TARGET_REQUIRED"
