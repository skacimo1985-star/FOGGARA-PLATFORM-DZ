import hashlib
import hmac
import time

import pytest
from fastapi.testclient import TestClient

import main as raster


class FakeImage:
    def __init__(self):
        self.rescaled = False
        self.render_kwargs = None

    def rescale(self, in_range):
        self.rescaled = True
        self.in_range = in_range
        return self

    def render(self, **kwargs):
        self.render_kwargs = kwargs
        return b"png-bytes"


class FakeReader:
    assets = ["visual", "red", "green", "nir"]

    def __init__(self, url):
        assert url.startswith(raster.EARTH_SEARCH_ITEM_ROOT + "/")
        self.url = url
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def tile(self, x, y, z, **kwargs):
        self.calls.append((x, y, z, kwargs))
        image = FakeImage()
        FakeReader.last_image = image
        FakeReader.last_kwargs = kwargs
        return image


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("RASTER_SIGNING_SECRET", "x" * 48)
    monkeypatch.setattr(raster, "STACReader", FakeReader)
    return TestClient(raster.app)


def sign(scene_id, layer, exp):
    payload = f"{scene_id}|{layer}|{exp}".encode()
    return hmac.new(b"x" * 48, payload, hashlib.sha256).hexdigest()


def url(scene_id="S2A_TEST_SCENE_20261006", layer="ndvi", z=4, x=8, y=6):
    exp = int(time.time()) + 300
    return (
        f"/tiles/{layer}/{scene_id}/{z}/{x}/{y}.png"
        f"?exp={exp}&token={sign(scene_id, layer, exp)}"
    )


def test_requires_valid_signature(client):
    response = client.get(
        "/tiles/ndvi/S2A_TEST_SCENE_20261006/4/8/6.png"
        f"?exp={int(time.time()) + 300}&token={'0' * 64}"
    )
    assert response.status_code == 403


def test_rejects_arbitrary_scene_paths(client):
    exp = int(time.time()) + 300
    response = client.get(
        f"/tiles/ndvi/not%2Fa%2Fscene/4/8/6.png?exp={exp}&token={'0' * 64}"
    )
    assert response.status_code in {404, 422}


def test_ndvi_uses_nir_red_expression_and_computed_header(client):
    response = client.get(url(layer="ndvi"))
    assert response.status_code == 200, response.text
    assert response.content == b"png-bytes"
    assert response.headers["x-foggara-evidence"] == "COMPUTED"
    assert FakeReader.last_kwargs["assets"] == ["nir", "red"]
    assert FakeReader.last_kwargs["expression"] == "(b1-b2)/(b1+b2)"
    assert FakeReader.last_image.rescaled is True


def test_ndwi_uses_green_nir(client):
    response = client.get(url(layer="ndwi"))
    assert response.status_code == 200, response.text
    assert FakeReader.last_kwargs["assets"] == ["green", "nir"]
    assert FakeReader.last_kwargs["expression"] == "(b1-b2)/(b1+b2)"


def test_true_color_uses_visual_rgb_indexes(client):
    response = client.get(url(layer="true-color"))
    assert response.status_code == 200, response.text
    assert FakeReader.last_kwargs["assets"] == [
        {"name": "visual", "indexes": [1, 2, 3]}
    ]


def test_rejects_invalid_tile_coordinate(client):
    exp = int(time.time()) + 300
    scene = "S2A_TEST_SCENE_20261006"
    token = sign(scene, "ndvi", exp)
    response = client.get(
        f"/tiles/ndvi/{scene}/4/99/6.png?exp={exp}&token={token}"
    )
    assert response.status_code == 422
