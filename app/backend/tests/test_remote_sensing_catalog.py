from app.routers import remote_sensing_catalog
from app.services.stac_search import StacSearchError
from tests.conftest import login


def scene_feature():
    return {
        "type": "Feature",
        "id": "S2A_20261005_001",
        "collection": "sentinel-2-l2a",
        "bbox": [2.0, 33.0, 2.2, 33.2],
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[2.0, 33.0], [2.2, 33.0], [2.2, 33.2], [2.0, 33.2], [2.0, 33.0]]],
        },
        "properties": {
            "datetime": "2026-10-05T10:12:00Z",
            "eo:cloud_cover": 7.5,
            "platform": "sentinel-2a",
            "constellation": "sentinel-2",
        },
        "assets": {"red": {}, "nir": {}, "visual": {}},
        "links": [{"rel": "self", "href": "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A_20261005_001"}],
    }


def test_catalog_requires_authentication(client):
    response = client.get(
        "/api/remote-sensing/catalog/scenes?bbox=2,33,2.2,33.2&start=2026-10-01&end=2026-10-06"
    )
    assert response.status_code == 401


def test_catalog_validates_bounds_and_dates(client, world):
    headers = login(client, "o1m@t.dz")
    base = "/api/remote-sensing/catalog/scenes"
    assert client.get(f"{base}?bbox=2,33,2&start=2026-10-01&end=2026-10-06", headers=headers).status_code == 422
    assert client.get(f"{base}?bbox=2,33,2,33.2&start=2026-10-01&end=2026-10-06", headers=headers).status_code == 422
    assert client.get(f"{base}?bbox=2,33,2.2,33.2&start=2026-10-07&end=2026-10-06", headers=headers).status_code == 422
    assert client.get(f"{base}?bbox=2,33,2.2,33.2&start=2024-01-01&end=2026-10-06", headers=headers).status_code == 422


def test_catalog_returns_sanitized_live_scene_metadata(client, world, monkeypatch):
    captured = {}

    def fake_search(request):
        captured["request"] = request
        return [scene_feature()]

    monkeypatch.setattr(remote_sensing_catalog, "search_sentinel_items", fake_search)
    headers = login(client, "o1m@t.dz")
    response = client.get(
        "/api/remote-sensing/catalog/scenes"
        "?bbox=2,33,2.2,33.2&start=2026-10-01&end=2026-10-06&cloud_cover_lte=20&limit=5",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["live"] is True
    assert body["stored"] is False
    assert body["provider"] == "Element 84 Earth Search"
    assert body["collection"] == "sentinel-2-l2a"
    assert body["count"] == 1

    scene = body["scenes"][0]
    assert scene["id"] == "S2A_20261005_001"
    assert scene["cloud_cover_pct"] == 7.5
    assert scene["provenance"] == "OBSERVED_PROVIDER_METADATA"
    assert scene["asset_keys"] == ["nir", "red", "visual"]
    assert scene["geometry"]["type"] == "Polygon"

    request = captured["request"]
    assert request.bbox == [2.0, 33.0, 2.2, 33.2]
    assert request.cloud_cover_lte == 20
    assert request.limit == 5
    assert request.datetime_range == "2026-10-01T00:00:00Z/2026-10-06T23:59:59Z"


def test_catalog_provider_failure_is_bounded_502(client, world, monkeypatch):
    def fail(_request):
        raise StacSearchError("down")

    monkeypatch.setattr(remote_sensing_catalog, "search_sentinel_items", fail)
    headers = login(client, "o1m@t.dz")
    response = client.get(
        "/api/remote-sensing/catalog/scenes?bbox=2,33,2.2,33.2&start=2026-10-01&end=2026-10-06",
        headers=headers,
    )
    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "REMOTE_PROVIDER_UNAVAILABLE"


def test_catalog_drops_invalid_remote_geometry(client, world, monkeypatch):
    invalid = scene_feature()
    invalid["id"] = "BAD-GEOMETRY"
    invalid["geometry"] = {
        "type": "Polygon",
        "coordinates": [[[999, 999], [2.2, 33.0], [2.2, 33.2], [999, 999]]],
    }
    monkeypatch.setattr(remote_sensing_catalog, "search_sentinel_items", lambda _request: [invalid])
    headers = login(client, "o1m@t.dz")
    response = client.get(
        "/api/remote-sensing/catalog/scenes?bbox=2,33,2.2,33.2&start=2026-10-01&end=2026-10-06",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["count"] == 0
    assert response.json()["scenes"] == []
