import httpx

from app.routers import remote_sensing_catalog
from app.services.remote_sensing_processing import (
    MASKED_SCL_CLASSES,
    TRUSTED_COG_HOST,
    build_processing_plan,
)
from tests.conftest import login


TRUSTED_ROOT = "https://sentinel-cogs.s3.us-west-2.amazonaws.com/sentinel-s2-l2a-cogs"


def cog(name: str, *, gsd: int = 10, scale: float | None = 0.0001, offset: float | None = 0.0):
    raster_band = {}
    if scale is not None:
        raster_band["scale"] = scale
    if offset is not None:
        raster_band["offset"] = offset
    return {
        "href": f"{TRUSTED_ROOT}/31/S/EA/2026/10/S2A_TEST_L2A/{name}.tif",
        "type": "image/tiff; application=geotiff; profile=cloud-optimized",
        "gsd": gsd,
        "raster:bands": [raster_band],
    }


def stac_item():
    return {
        "type": "Feature",
        "id": "S2A_31SEA_20261005_0_L2A",
        "collection": "sentinel-2-l2a",
        "assets": {
            "blue": cog("B02"),
            "green": cog("B03"),
            "red": cog("B04"),
            "nir": cog("B08"),
            "scl": cog("SCL", gsd=20, scale=None, offset=None),
            "red-jp2": {
                "href": "https://example.invalid/B04.jp2",
                "type": "image/jp2",
            },
        },
    }


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            request = httpx.Request("GET", "https://earth-search.aws.element84.com/")
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError("provider error", request=request, response=response)

    def json(self):
        return self.payload


class FakeGetClient:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return FakeResponse(self.payload, self.status_code)


def test_processing_plan_resolves_only_trusted_cogs_and_scl():
    plan = build_processing_plan(stac_item(), "ndvi")

    assert plan["index"] == "ndvi"
    assert plan["formula_version"] == "foggara-rs-v1"
    assert plan["plan_version"] == "foggara-raster-plan-v1"
    assert len(plan["fingerprint_sha256"]) == 64
    assert plan["target_resolution_m"] == 10

    bands = {row["band"]: row for row in plan["required_assets"]}
    assert set(bands) == {"B04", "B08"}
    assert all(row["host"] == TRUSTED_COG_HOST for row in bands.values())
    assert bands["B04"]["asset_key"] == "red"
    assert bands["B04"]["scale"] == 0.0001
    assert bands["B08"]["asset_key"] == "nir"

    cloud_mask = plan["cloud_mask"]
    assert cloud_mask["asset"]["asset_key"] == "scl"
    assert cloud_mask["asset"]["gsd_m"] == 20
    assert cloud_mask["resampling"] == "nearest"
    assert cloud_mask["masked_classes"] == list(MASKED_SCL_CLASSES)

    assert plan["output_contract"]["format"] == "COG"
    assert plan["provenance"]["provider_metadata"] == "OBSERVED"
    assert plan["provenance"]["derived_index"] == "COMPUTED"
    assert plan["provenance"]["verified"] is False

    serialized = str(plan)
    assert "example.invalid" not in serialized
    assert "red-jp2" not in serialized


def test_processing_plan_fingerprint_is_deterministic():
    first = build_processing_plan(stac_item(), "evi")
    second = build_processing_plan(stac_item(), "evi")
    assert first["fingerprint_sha256"] == second["fingerprint_sha256"]


def test_processing_plan_fails_closed_on_untrusted_asset_host():
    item = stac_item()
    item["assets"]["red"]["href"] = "https://127.0.0.1/private.tif"

    try:
        build_processing_plan(item, "ndvi")
        assert False, "untrusted asset must be rejected"
    except ValueError as exc:
        assert "host is not trusted" in str(exc)


def test_processing_plan_fails_closed_when_scl_is_missing():
    item = stac_item()
    item["assets"].pop("scl")

    try:
        build_processing_plan(item, "ndvi")
        assert False, "SCL is required for cloud masking"
    except ValueError as exc:
        assert "required COG asset for SCL" in str(exc)


def test_processing_plan_fails_closed_when_required_band_is_missing():
    item = stac_item()
    item["assets"].pop("nir")

    try:
        build_processing_plan(item, "ndvi")
        assert False, "NIR is required for NDVI"
    except ValueError as exc:
        assert "required COG asset for B08" in str(exc)


def test_processing_plan_endpoint_requires_auth(client):
    response = client.get(
        "/api/remote-sensing/catalog/scenes/S2A_31SEA_20261005_0_L2A/processing-plan?index=ndvi"
    )
    assert response.status_code == 401


def test_processing_plan_endpoint_fetches_fixed_provider_item(client, world, monkeypatch):
    fake = FakeGetClient(stac_item())
    monkeypatch.setattr(remote_sensing_catalog.httpx, "Client", lambda **_kwargs: fake)
    headers = login(client, "o1m@t.dz")

    response = client.get(
        "/api/remote-sensing/catalog/scenes/S2A_31SEA_20261005_0_L2A/processing-plan?index=ndwi",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["index"] == "ndwi"
    assert {row["band"] for row in body["required_assets"]} == {"B03", "B08"}

    assert len(fake.calls) == 1
    url, kwargs = fake.calls[0]
    assert url == (
        "https://earth-search.aws.element84.com/v1/collections/"
        "sentinel-2-l2a/items/S2A_31SEA_20261005_0_L2A"
    )
    assert kwargs["headers"]["Accept"] == "application/geo+json"


def test_processing_plan_endpoint_rejects_provider_identity_mismatch(client, world, monkeypatch):
    item = stac_item()
    item["id"] = "DIFFERENT_ITEM"
    fake = FakeGetClient(item)
    monkeypatch.setattr(remote_sensing_catalog.httpx, "Client", lambda **_kwargs: fake)
    headers = login(client, "o1m@t.dz")

    response = client.get(
        "/api/remote-sensing/catalog/scenes/S2A_31SEA_20261005_0_L2A/processing-plan?index=ndvi",
        headers=headers,
    )
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "REMOTE_PROVIDER_INVALID_RESPONSE"


def test_processing_plan_endpoint_rejects_malformed_scene_id(client, world):
    headers = login(client, "o1m@t.dz")
    response = client.get(
        "/api/remote-sensing/catalog/scenes/bad%20scene/processing-plan?index=ndvi",
        headers=headers,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "INVALID_SCENE_ID"


def test_processing_plan_rejects_malformed_numeric_metadata():
    item = stac_item()
    item["assets"]["red"]["raster:bands"][0]["scale"] = "not-a-number"

    try:
        build_processing_plan(item, "ndvi")
        assert False, "malformed raster metadata must be rejected"
    except ValueError as exc:
        assert "must be numeric" in str(exc)


def test_processing_plan_rejects_plain_geotiff_without_cog_profile():
    item = stac_item()
    item["assets"]["red"]["type"] = "image/tiff; application=geotiff"

    try:
        build_processing_plan(item, "ndvi")
        assert False, "plain GeoTIFF must not satisfy the COG contract"
    except ValueError as exc:
        assert "required COG asset for B04" in str(exc)


def test_processing_plan_rejects_traversal_and_bad_port():
    item = stac_item()
    item["assets"]["red"]["href"] = (
        "https://sentinel-cogs.s3.us-west-2.amazonaws.com/"
        "sentinel-s2-l2a-cogs/%2e%2e/private.tif"
    )
    try:
        build_processing_plan(item, "ndvi")
        assert False, "encoded traversal must be rejected"
    except ValueError as exc:
        assert "traversal" in str(exc)

    item = stac_item()
    item["assets"]["red"]["href"] = (
        "https://sentinel-cogs.s3.us-west-2.amazonaws.com:bad/"
        "sentinel-s2-l2a-cogs/31/S/EA/B04.tif"
    )
    try:
        build_processing_plan(item, "ndvi")
        assert False, "invalid port must be rejected"
    except ValueError as exc:
        assert "invalid port" in str(exc)
