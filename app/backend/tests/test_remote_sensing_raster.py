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
    }
    needed = {
        "ndvi": ["B04", "B08"],
        "evi": ["B02", "B04", "B08"],
        "savi": ["B04", "B08"],
        "ndwi": ["B03", "B08"],
    }[index]
    return {
        "scene_id": "S2A_TEST_L2A",
        "index": index,
        "formula_version": "foggara-rs-v1",
        "fingerprint_sha256": "a" * 64,
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


@pytest.mark.parametrize("index", ["ndvi", "evi", "savi", "ndwi"])
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
