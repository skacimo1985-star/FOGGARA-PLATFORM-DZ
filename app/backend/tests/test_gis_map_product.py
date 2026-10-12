"""Behavior of map products: same observations, correct CRS and transparent masks."""
import base64
import struct
import zlib

import numpy as np
import pytest

from app.services import remote_sensing_raster as raster
from tests.test_remote_sensing_raster import TEST_BBOX, processing_plan, raster_assets


def decode_rgba(data_url):
    data = base64.b64decode(data_url.split(",", 1)[1])
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    width, height = struct.unpack(">II", data[16:24])
    payload = b""
    position = 8
    while position < len(data):
        length = struct.unpack(">I", data[position:position + 4])[0]
        if data[position + 4:position + 8] == b"IDAT":
            payload += data[position + 8:position + 8 + length]
        position += 12 + length
    rows = np.frombuffer(zlib.decompress(payload), dtype=np.uint8).reshape(height, 1 + width * 4)
    assert np.all(rows[:, 0] == 0)
    return rows[:, 1:].reshape(height, width, 4)


@pytest.mark.parametrize("index", ["ndvi", "ndmi"])
def test_map_product_preserves_statistics_and_cloud_transparency(raster_assets, index):
    plain = raster.compute_index_statistics(processing_plan(index), TEST_BBOX)
    mapped = raster.compute_index_statistics(processing_plan(index), TEST_BBOX, include_preview=True)
    assert mapped["statistics"] == plain["statistics"]
    assert mapped["pixels"] == plain["pixels"]
    preview = mapped["preview"]
    assert preview["render_crs"] == "EPSG:3857"
    assert preview["bbox"] == TEST_BBOX
    assert preview["index"] == index
    assert preview["verified"] is False
    alpha = decode_rgba(preview["data_url"])[..., 3]
    assert np.any(alpha == 0)  # cloud / nodata stays transparent
    assert np.any(alpha > 0)


def test_map_product_keeps_neighbouring_fields_transparent(raster_assets):
    geometry = {"type": "Polygon", "coordinates": [[
        [3.0, 0.0], [3.000175, 0.0], [3.000175, 0.00035], [3.0, 0.00035], [3.0, 0.0],
    ]]}
    mapped = raster.compute_index_statistics(processing_plan(), TEST_BBOX,
        geometry_wgs84=geometry, include_preview=True)
    assert mapped["preview"]["geometry_mask_applied"] is True
    alpha = decode_rgba(mapped["preview"]["data_url"])[..., 3]
    assert np.all(alpha[:, alpha.shape[1] // 2 + 1:] == 0)
    assert np.any(alpha > 0)


def test_public_preview_delivers_only_requested_backend_product(client, monkeypatch):
    from app.routers import expo
    from tests.test_expo_public import scene, public_preview_payload
    monkeypatch.setattr(expo, "_earth_search_features", lambda *_args: [scene()])
    monkeypatch.setattr(expo, "build_processing_plan", lambda *_args: {"index": "ndvi"})
    calls = []
    def statistics(_plan, bbox, geometry_wgs84=None, include_preview=False):
        calls.append(include_preview)
        return {"statistics": {"mean": 0.5}, "pixels": {"valid": 10},
            "mask": {"geometry_mask_applied": True}, "grid": {"resolution_m": 10},
            "preview": {"index": "ndvi", "bbox": bbox, "geometry_mask_applied": True,
                        "data_url": "data:image/png;base64,test"}}
    monkeypatch.setattr(expo, "compute_index_statistics", statistics)
    payload = public_preview_payload()
    payload["include_preview"] = True
    response = client.post("/api/expo/satellite/ndvi-preview", json=payload)
    assert response.status_code == 200
    assert calls == [True]
    assert response.json()["preview"]["geometry_mask_applied"] is True
    assert response.json()["grid"]["resolution_m"] == 10
    assert response.json()["persisted"] is False
