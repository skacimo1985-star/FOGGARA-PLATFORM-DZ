from app.routers import remote_sensing_catalog
from tests.conftest import login


class FakeResponse:
    def __init__(self, payload, status_code=200):
        self._payload = payload
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            import httpx
            request = httpx.Request("POST", remote_sensing_catalog.EARTH_SEARCH_SEARCH_URL)
            response = httpx.Response(self.status_code, request=request)
            raise httpx.HTTPStatusError("provider error", request=request, response=response)

    def json(self):
        return self._payload


class FakeClient:
    def __init__(self, payload, status_code=200):
        self.payload = payload
        self.status_code = status_code
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return FakeResponse(self.payload, self.status_code)


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
    fake = FakeClient({"type": "FeatureCollection", "features": [scene_feature()]})
    monkeypatch.setattr(remote_sensing_catalog.httpx, "Client", lambda **_kwargs: fake)

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

    assert len(fake.calls) == 1
    url, kwargs = fake.calls[0]
    assert url == remote_sensing_catalog.EARTH_SEARCH_SEARCH_URL
    assert kwargs["json"]["collections"] == ["sentinel-2-l2a"]
    assert kwargs["json"]["bbox"] == [2.0, 33.0, 2.2, 33.2]
    assert kwargs["json"]["query"]["eo:cloud_cover"]["lte"] == 20
    assert kwargs["json"]["limit"] == 5


def test_catalog_provider_failure_is_bounded_502(client, world, monkeypatch):
    fake = FakeClient({"detail": "down"}, status_code=503)
    monkeypatch.setattr(remote_sensing_catalog.httpx, "Client", lambda **_kwargs: fake)
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
    fake = FakeClient({"type": "FeatureCollection", "features": [invalid]})
    monkeypatch.setattr(remote_sensing_catalog.httpx, "Client", lambda **_kwargs: fake)
    headers = login(client, "o1m@t.dz")

    response = client.get(
        "/api/remote-sensing/catalog/scenes?bbox=2,33,2.2,33.2&start=2026-10-01&end=2026-10-06",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["count"] == 0
    assert response.json()["scenes"] == []
