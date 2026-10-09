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


def test_saved_parcel_intelligence_uses_authoritative_polygon_not_supplied_bbox(client, world, monkeypatch):
    headers = login(client, "o1m@t.dz")
    polygon = {"type": "Polygon", "coordinates": [[
        [2.0, 33.0], [2.01, 33.0], [2.007, 33.006], [2.0, 33.01], [2.0, 33.0],
    ]]}
    created = client.post("/api/agriculture/parcels", headers=headers, json={
        "name": "FOGGARA verified geometry test", "crop": "date palm",
        "area_ha": 1, "location": "Laghouat", "boundary_geojson": polygon,
    })
    assert created.status_code == 201, created.text
    field_id = created.json()["id"]
    seen = {}
    def catalog(bbox, *args, **kwargs):
        seen["catalog_bbox"] = bbox
        return [_feature()]
    def multi(plan, bbox, geometry_wgs84=None):
        seen["spectral_bbox"] = bbox
        seen["polygon"] = geometry_wgs84
        result = _multi()
        result["mask"]["geometry_mask_applied"] = True
        return result
    monkeypatch.setattr(remote_sensing_catalog, "_earth_search_features", catalog)
    monkeypatch.setattr(remote_sensing_catalog, "build_multi_index_plan", lambda _item: {"scene_id": "S2A_FIELD_001"})
    monkeypatch.setattr(remote_sensing_catalog, "compute_multi_index_statistics", multi)
    monkeypatch.setattr(remote_sensing_catalog, "sample_soil_context", lambda _bbox: _soil())
    response = client.get("/api/remote-sensing/studies/field-intelligence", headers=headers, params={
        "parcel_id": field_id, "bbox": "80,11,80.01,11.01", "crop": "wheat",
        "scene_id": "S2A_FIELD_001", "start": "2026-09-01", "end": "2026-10-08", "include_soil": "false",
    })
    assert response.status_code == 200, response.text
    result = response.json()
    assert result["parcel_id"] == field_id
    assert result["sample_geometry"] == "PARCEL_BOUNDARY_GEOJSON"
    assert result["geometry_mask_applied"] is True
    assert result["crop_profile"]["id"] == "date_palm"
    assert seen["catalog_bbox"] == [2.0, 33.0, 2.01, 33.01]
    assert seen["spectral_bbox"] == [2.0, 33.0, 2.01, 33.01]
    assert seen["polygon"] == polygon
    assert result["domains"]["vegetation"]["indices"]["ndvi"]["statistics"]["mean"] == 0.62


def test_saved_parcel_field_intelligence_is_org_isolated(client, world, monkeypatch):
    own = login(client, "o1m@t.dz")
    other = login(client, "o2m@t.dz")
    created = client.post("/api/agriculture/parcels", headers=own, json={
        "name": "Protected Oasis", "crop": "date palm", "area_ha": 1,
        "location": "Laghouat", "lat": 33.8, "lon": 2.87,
    })
    assert created.status_code == 201, created.text
    monkeypatch.setattr(remote_sensing_catalog, "_earth_search_features",
                        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("Provider contacted before checking owner")))
    blocked = client.get("/api/remote-sensing/studies/field-intelligence", headers=other, params={
        "parcel_id": created.json()["id"], "start": "2026-09-01", "end": "2026-10-08",
    })
    assert blocked.status_code == 404
    no_auth = client.get("/api/remote-sensing/studies/field-intelligence", params={
        "parcel_id": created.json()["id"], "start": "2026-09-01", "end": "2026-10-08",
    })
    assert no_auth.status_code == 401


def test_saved_parcel_field_analysis_never_reports_results_if_polygon_mask_failed(client, world, monkeypatch):
    headers = login(client, "o1m@t.dz")
    polygon = {"type": "Polygon", "coordinates": [[
        [2.0, 33.0], [2.001, 33.0], [2.001, 33.001], [2.0, 33.001], [2.0, 33.0],
    ]]}
    saved = client.post("/api/agriculture/parcels", headers=headers, json={
        "name": "Mask required", "crop": "wheat", "area_ha": 1,
        "location": "Laghouat", "boundary_geojson": polygon,
    })
    assert saved.status_code == 201
    monkeypatch.setattr(remote_sensing_catalog, "_earth_search_features", lambda *_args, **_kwargs: [_feature()])
    monkeypatch.setattr(remote_sensing_catalog, "build_multi_index_plan", lambda _item: {"scene_id": "S2A_FIELD_001"})
    monkeypatch.setattr(remote_sensing_catalog, "compute_multi_index_statistics", lambda *_args, **_kwargs: _multi())
    response = client.get("/api/remote-sensing/studies/field-intelligence", headers=headers, params={
        "parcel_id": saved.json()["id"], "start": "2026-09-01", "end": "2026-10-08",
    })
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "PARCEL_MASK_MISSING"


def test_saved_parcel_scene_selection_never_bypasses_trusted_stac(client, world, monkeypatch):
    headers = login(client, "o1m@t.dz")
    saved = client.post("/api/agriculture/parcels", headers=headers, json={
        "name": "Scene selection", "crop": "wheat", "area_ha": 1,
        "location": "Laghouat", "lat": 33.8, "lon": 2.87,
    })
    assert saved.status_code == 201
    monkeypatch.setattr(remote_sensing_catalog, "_earth_search_features", lambda *_args, **_kwargs: [_feature()])
    monkeypatch.setattr(remote_sensing_catalog, "build_multi_index_plan",
                        lambda *_args: (_ for _ in ()).throw(AssertionError("No plan for untrusted scene")))
    response = client.get("/api/remote-sensing/studies/field-intelligence", headers=headers, params={
        "parcel_id": saved.json()["id"], "scene_id": "S2B_NOT_IN_STAC_2026",
        "start": "2026-09-01", "end": "2026-10-08",
    })
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "NO_USABLE_SCENE"
    assert response.json()["domains"] == {}
