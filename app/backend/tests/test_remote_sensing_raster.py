import numpy as np
import pytest
from rasterio.io import MemoryFile
from rasterio.transform import from_origin

from app.routers import remote_sensing_catalog
from app.services import remote_sensing_raster
from app.services.remote_sensing_processing import TRUSTED_COG_HOST
from tests.conftest import login


PATH_ROOT = "/sentinel-s2-l2a-cogs/31/N/AA/2026/10/S2A_TEST"
TEST_BBOX = [3.0, 0.0, 3.00035, 0.00035]


def processing_plan(index="ndvi"):
    required = {
        "B02": {"band": "B02", "host": TRUSTED_COG_HOST, "path": f"{PATH_ROOT}/B02.tif", "scale": 0.0001, "offset": 0.0},
        "B03": {"band": "B03", "host": TRUSTED_COG_HOST, "path": f"{PATH_ROOT}/B03.tif", "scale": 0.0001, "offset": 0.0},
        "B04": {"band": "B04", "host": TRUSTED_COG_HOST, "path": f"{PATH_ROOT}/B04.tif", "scale": 0.0001, "offset": 0.0},
        "B08": {"band": "B08", "host": TRUSTED_COG_HOST, "path": f"{PATH_ROOT}/B08.tif", "scale": 0.0001, "offset": 0.0},
        "B11": {"band": "B11", "host": TRUSTED_COG_HOST, "path": f"{PATH_ROOT}/B11.tif", "scale": 0.0001, "offset": 0.0},
    }
    needed = {
        "ndvi": ["B04", "B08"],
        "evi": ["B02", "B04", "B08"],
        "savi": ["B04", "B08"],
        "ndwi": ["B03", "B08"],
        "ndmi": ["B08", "B11"],
        "lswi": ["B08", "B11"],
        "bsi": ["B02", "B04", "B08", "B11"],
    }[index]
    return {
        "scene_id": "S2A_TEST_L2A",
        "index": index,
        "formula_version": "foggara-rs-v1",
        "fingerprint_sha256": "a" * 64,
        "effective_source_resolution_m": 20 if index in {"ndmi", "lswi", "bsi"} else 10,
        "required_assets": [required[key] for key in needed],
        "cloud_mask": {
            "asset": {
                "band": "SCL",
                "host": TRUSTED_COG_HOST,
                "path": f"{PATH_ROOT}/SCL.tif",
                "scale": None,
                "offset": None,
            },
            "method": "sentinel-2-scl",
            "masked_classes": [0, 1, 3, 8, 9, 10, 11],
        },
    }


def true_color_plan():
    required = {
        "B02": {"band": "B02", "host": TRUSTED_COG_HOST, "path": f"{PATH_ROOT}/B02.tif", "scale": 0.0001, "offset": 0.0},
        "B03": {"band": "B03", "host": TRUSTED_COG_HOST, "path": f"{PATH_ROOT}/B03.tif", "scale": 0.0001, "offset": 0.0},
        "B04": {"band": "B04", "host": TRUSTED_COG_HOST, "path": f"{PATH_ROOT}/B04.tif", "scale": 0.0001, "offset": 0.0},
    }
    return {
        "scene_id": "S2A_TEST_L2A",
        "product": "true_color",
        "display_version": "foggara-true-color-v1",
        "effective_source_resolution_m": 10,
        "required_assets": [required[key] for key in ("B02", "B03", "B04")],
        "cloud_mask": {
            "asset": {
                "band": "SCL",
                "host": TRUSTED_COG_HOST,
                "path": f"{PATH_ROOT}/SCL.tif",
                "scale": None,
                "offset": None,
            },
            "method": "sentinel-2-scl",
            "masked_classes": [0, 1, 3, 8, 9, 10, 11],
        },
    }


def make_memfile(values, *, dtype):
    mem = MemoryFile()
    with mem.open(
        driver="GTiff",
        height=4,
        width=4,
        count=1,
        dtype=dtype,
        crs="EPSG:32631",
        transform=from_origin(500000, 40, 10, 10),
    ) as dataset:
        dataset.write(np.asarray(values, dtype=dtype), 1)
    return mem


@pytest.fixture
def raster_assets(monkeypatch):
    base = np.full((4, 4), 1, dtype=np.uint16)
    memfiles = {
        "B02": make_memfile(base * 1000, dtype="uint16"),
        "B03": make_memfile(base * 2000, dtype="uint16"),
        "B04": make_memfile(base * 2000, dtype="uint16"),
        "B08": make_memfile(base * 6000, dtype="uint16"),
        "B11": make_memfile(base * 3000, dtype="uint16"),
        "SCL": make_memfile(
            np.array(
                [
                    [4, 4, 4, 4],
                    [4, 9, 4, 4],
                    [4, 4, 4, 4],
                    [4, 4, 4, 4],
                ],
                dtype=np.uint8,
            ),
            dtype="uint8",
        ),
    }

    def fake_open(href):
        name = href.rsplit("/", 1)[-1].split(".", 1)[0]
        return memfiles[name].open()

    monkeypatch.setattr(remote_sensing_raster, "_open_asset", fake_open)
    yield memfiles
    for mem in memfiles.values():
        mem.close()


def test_masked_uint16_raster_converts_to_float_before_nan_fill():
    data = np.ma.array(
        np.array([[1000, 2000], [3000, 4000]], dtype=np.uint16),
        mask=np.array([[False, True], [False, False]], dtype=bool),
    )
    values, mask = remote_sensing_raster._masked_float32(data)

    assert values.dtype == np.float32
    assert values[0, 0] == pytest.approx(1000.0)
    assert np.isnan(values[0, 1])
    assert mask.dtype == np.bool_
    assert mask[0, 1]
    assert not mask[0, 0]


def test_live_ndvi_statistics_use_scale_and_scl_mask(raster_assets):
    result = remote_sensing_raster.compute_index_statistics(
        processing_plan("ndvi"),
        TEST_BBOX,
    )
    assert result["index"] == "ndvi"
    assert result["formula_version"] == "foggara-rs-v1"
    assert result["statistics"]["mean"] == pytest.approx(0.5, abs=1e-5)
    assert result["statistics"]["median"] == pytest.approx(0.5, abs=1e-5)
    assert result["pixels"]["valid"] > 0
    assert result["pixels"]["valid"] < result["pixels"]["total"]
    assert result["mask"]["cloud_masked_pixel_count"] > 0
    assert result["provenance"]["derived_index"] == "COMPUTED"
    assert result["provenance"]["verified"] is False
    assert result["provenance"]["persisted"] is False


@pytest.mark.parametrize("index", ["ndvi", "evi", "savi", "ndwi", "ndmi", "lswi", "bsi"])
def test_all_indices_produce_finite_statistics(raster_assets, index):
    result = remote_sensing_raster.compute_index_statistics(
        processing_plan(index),
        TEST_BBOX,
    )
    assert result["statistics"]["mean"] is not None
    assert np.isfinite(result["statistics"]["mean"])
    assert result["grid"]["resolution_m"] == 10.0
    assert result["grid"]["width"] <= remote_sensing_raster.MAX_AXIS_PIXELS
    assert result["grid"]["height"] <= remote_sensing_raster.MAX_AXIS_PIXELS
    assert result["grid"]["effective_source_resolution_m"] == (
        20 if index in {"ndmi", "lswi", "bsi"} else 10
    )
    assert result["grid"]["resampled"] is (index in {"ndmi", "lswi", "bsi"})


def test_analysis_bbox_budget_fails_before_raster_io(monkeypatch):
    monkeypatch.setattr(
        remote_sensing_raster,
        "_open_asset",
        lambda _href: pytest.fail("raster IO must not run for oversized bbox"),
    )
    with pytest.raises(remote_sensing_raster.RasterStatisticsError, match="too large"):
        remote_sensing_raster.compute_index_statistics(
            processing_plan("ndvi"),
            [2.0, 32.0, 3.0, 33.0],
        )


def test_analysis_bbox_rejects_antimeridian_and_degenerate_ranges():
    with pytest.raises(remote_sensing_raster.RasterStatisticsError):
        remote_sensing_raster.validate_analysis_bbox([170, 0, -170, 1])
    with pytest.raises(remote_sensing_raster.RasterStatisticsError):
        remote_sensing_raster.validate_analysis_bbox([3, 1, 3, 2])


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeClient:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def get(self, *_args, **_kwargs):
        return FakeResponse(self.payload)


def provider_item():
    def asset(name, *, gsd=10):
        return {
            "href": f"https://{TRUSTED_COG_HOST}{PATH_ROOT}/{name}.tif",
            "type": "image/tiff; application=geotiff; profile=cloud-optimized",
            "gsd": gsd,
            "raster:bands": [{"scale": 0.0001, "offset": 0.0}],
        }

    scl = asset("SCL", gsd=20)
    scl["raster:bands"] = [{}]
    return {
        "type": "Feature",
        "id": "S2A_TEST_L2A",
        "collection": "sentinel-2-l2a",
        "assets": {
            "blue": asset("B02"),
            "green": asset("B03"),
            "red": asset("B04"),
            "nir": asset("B08"),
            "swir16": asset("B11", gsd=20),
            "scl": scl,
        },
    }


def test_statistics_endpoint_requires_authentication(client):
    response = client.get(
        "/api/remote-sensing/catalog/scenes/S2A_TEST_L2A/statistics"
        "?index=ndvi&bbox=3,0,3.00035,0.00035"
    )
    assert response.status_code == 401


def test_statistics_endpoint_uses_fixed_provider_and_processor(client, world, monkeypatch):
    monkeypatch.setattr(
        remote_sensing_catalog.httpx,
        "Client",
        lambda **_kwargs: FakeClient(provider_item()),
    )
    captured = {}

    def fake_statistics(plan, bbox):
        captured["plan"] = plan
        captured["bbox"] = bbox
        return {
            "scene_id": plan["scene_id"],
            "index": plan["index"],
            "statistics": {"mean": 0.5},
            "provenance": {"derived_index": "COMPUTED", "verified": False},
        }

    monkeypatch.setattr(remote_sensing_catalog, "compute_index_statistics", fake_statistics)
    headers = login(client, "o1m@t.dz")
    response = client.get(
        "/api/remote-sensing/catalog/scenes/S2A_TEST_L2A/statistics"
        "?index=ndvi&bbox=3,0,3.00035,0.00035",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["statistics"]["mean"] == 0.5
    assert captured["plan"]["scene_id"] == "S2A_TEST_L2A"
    assert captured["plan"]["index"] == "ndvi"
    assert captured["bbox"] == [3.0, 0.0, 3.00035, 0.00035]


def test_statistics_endpoint_rejects_large_bbox_before_raster(client, world, monkeypatch):
    monkeypatch.setattr(
        remote_sensing_catalog.httpx,
        "Client",
        lambda **_kwargs: FakeClient(provider_item()),
    )
    headers = login(client, "o1m@t.dz")
    response = client.get(
        "/api/remote-sensing/catalog/scenes/S2A_TEST_L2A/statistics"
        "?index=ndvi&bbox=2,32,3,33",
        headers=headers,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "RASTER_ANALYSIS_BOUNDS_INVALID"



def test_raster_capacity_fails_fast(raster_assets):
    acquired = remote_sensing_raster._RASTER_ANALYSIS_SEMAPHORE.acquire(blocking=False)
    assert acquired is True
    try:
        with pytest.raises(remote_sensing_raster.RasterCapacityError, match="capacity"):
            remote_sensing_raster.compute_index_statistics(
                processing_plan("ndvi"),
                TEST_BBOX,
            )
    finally:
        remote_sensing_raster._RASTER_ANALYSIS_SEMAPHORE.release()


def test_statistics_endpoint_returns_429_when_capacity_is_busy(client, world, monkeypatch):
    monkeypatch.setattr(
        remote_sensing_catalog.httpx,
        "Client",
        lambda **_kwargs: FakeClient(provider_item()),
    )

    def busy(_plan, _bbox):
        raise remote_sensing_raster.RasterCapacityError("raster analysis capacity is busy")

    monkeypatch.setattr(remote_sensing_catalog, "compute_index_statistics", busy)
    headers = login(client, "o1m@t.dz")
    response = client.get(
        "/api/remote-sensing/catalog/scenes/S2A_TEST_L2A/statistics"
        "?index=ndvi&bbox=3,0,3.00035,0.00035",
        headers=headers,
    )
    assert response.status_code == 429
    assert response.json()["detail"]["code"] == "RASTER_ANALYSIS_BUSY"



def test_preview_png_encoder_has_valid_signature(raster_assets):
    png, metadata = remote_sensing_raster.render_index_preview_png(
        processing_plan("ndvi"),
        TEST_BBOX,
    )
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(png) > 80
    assert metadata["index"] == "ndvi"
    assert metadata["derived_index"] == "COMPUTED"
    assert metadata["verified"] is False
    assert metadata["persisted"] is False


def test_polygon_geometry_masks_preview_to_field_boundary(raster_assets):
    geometry = {
        "type": "Polygon",
        "coordinates": [[
            [3.0, 0.0],
            [3.000175, 0.0],
            [3.000175, 0.00035],
            [3.0, 0.00035],
            [3.0, 0.0],
        ]],
    }
    png, metadata = remote_sensing_raster.render_index_preview_png(
        processing_plan("ndvi"),
        TEST_BBOX,
        geometry_wgs84=geometry,
    )
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    assert metadata["geometry_mask_applied"] is True
    assert 0 < metadata["valid_fraction"] <= 1


def test_true_color_preview_uses_real_rgb_bands_scl_and_polygon(raster_assets):
    geometry = {
        "type": "Polygon",
        "coordinates": [[
            [3.0, 0.0],
            [3.000175, 0.0],
            [3.000175, 0.00035],
            [3.0, 0.00035],
            [3.0, 0.0],
        ]],
    }
    png, metadata = remote_sensing_raster.render_true_color_preview_png(
        true_color_plan(),
        TEST_BBOX,
        geometry_wgs84=geometry,
    )
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    assert metadata["product"] == "true_color"
    assert metadata["display_version"] == "foggara-true-color-v1"
    assert metadata["geometry_mask_applied"] is True
    assert metadata["effective_source_resolution_m"] == 10
    assert metadata["provenance"]["provider_raster"] == "OBSERVED"
    assert metadata["provenance"]["display_transform"] == "COMPUTED"
    assert metadata["verified"] is False
    assert 0 < metadata["valid_fraction"] < 1


def test_true_color_endpoint_requires_authentication(client):
    response = client.get(
        "/api/remote-sensing/catalog/scenes/S2A_TEST_L2A/true-color.png"
        "?bbox=3,0,3.00035,0.00035"
    )
    assert response.status_code == 401


def test_true_color_endpoint_returns_private_observed_raster(client, world, monkeypatch):
    monkeypatch.setattr(
        remote_sensing_catalog.httpx,
        "Client",
        lambda **_kwargs: FakeClient(provider_item()),
    )

    def fake_true_color(plan, bbox):
        assert plan["scene_id"] == "S2A_TEST_L2A"
        assert plan["product"] == "true_color"
        assert bbox == [3.0, 0.0, 3.00035, 0.00035]
        return b"\x89PNG\r\n\x1a\nRGB", {
            "scene_id": plan["scene_id"],
            "display_version": plan["display_version"],
        }

    monkeypatch.setattr(
        remote_sensing_catalog,
        "render_true_color_preview_png",
        fake_true_color,
    )
    headers = login(client, "o1m@t.dz")
    response = client.get(
        "/api/remote-sensing/catalog/scenes/S2A_TEST_L2A/true-color.png"
        "?bbox=3,0,3.00035,0.00035",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-foggara-product"] == "true_color"
    assert response.headers["x-foggara-evidence"] == "OBSERVED"
    assert response.headers["x-foggara-display"] == "COMPUTED"
    assert response.headers["x-foggara-verified"] == "false"


def test_preview_png_endpoint_requires_authentication(client):
    response = client.get(
        "/api/remote-sensing/catalog/scenes/S2A_TEST_L2A/preview.png"
        "?index=ndvi&bbox=3,0,3.00035,0.00035"
    )
    assert response.status_code == 401


def test_preview_png_endpoint_returns_computed_private_image(client, world, monkeypatch):
    monkeypatch.setattr(
        remote_sensing_catalog.httpx,
        "Client",
        lambda **_kwargs: FakeClient(provider_item()),
    )

    def fake_preview(plan, bbox):
        assert plan["scene_id"] == "S2A_TEST_L2A"
        assert plan["index"] == "ndvi"
        assert bbox == [3.0, 0.0, 3.00035, 0.00035]
        return (
            b"\x89PNG\r\n\x1a\nFAKE",
            {
                "scene_id": plan["scene_id"],
                "index": plan["index"],
                "formula_version": plan["formula_version"],
            },
        )

    monkeypatch.setattr(remote_sensing_catalog, "render_index_preview_png", fake_preview)
    headers = login(client, "o1m@t.dz")
    response = client.get(
        "/api/remote-sensing/catalog/scenes/S2A_TEST_L2A/preview.png"
        "?index=ndvi&bbox=3,0,3.00035,0.00035",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "image/png"
    assert response.headers["cache-control"] == "private, no-store"
    assert response.headers["x-foggara-evidence"] == "COMPUTED"
    assert response.headers["x-foggara-verified"] == "false"
    assert response.content.startswith(b"\x89PNG\r\n\x1a\n")


def test_polygon_geometry_masks_statistics_to_field_boundary(raster_assets):
    geometry = {
        "type": "Polygon",
        "coordinates": [[
            [3.0, 0.0],
            [3.000175, 0.0],
            [3.000175, 0.00035],
            [3.0, 0.00035],
            [3.0, 0.0],
        ]],
    }
    full = remote_sensing_raster.compute_index_statistics(processing_plan("ndvi"), TEST_BBOX)
    clipped = remote_sensing_raster.compute_index_statistics(
        processing_plan("ndvi"), TEST_BBOX, geometry_wgs84=geometry,
    )
    assert clipped["mask"]["geometry_mask_applied"] is True
    assert clipped["mask"]["outside_geometry_pixel_count"] > 0
    assert 0 < clipped["pixels"]["total"] < full["pixels"]["total"]
    assert 0 <= clipped["pixels"]["valid"] <= clipped["pixels"]["total"]
    assert clipped["statistics"]["mean"] == pytest.approx(0.5, abs=1e-5)
