from app.models import Site
from tests.conftest import login


def _sites(db, world):
    own_a = Site(
        org_id=world["org1"].id,
        name="Adrar Oasis",
        wilaya="01",
        commune="Adrar",
        lat=27.8743,
        lon=-0.2939,
        is_demo=True,
    )
    own_b = Site(
        org_id=world["org1"].id,
        name="Laghouat Field",
        wilaya="03",
        commune="Laghouat",
        lat=33.8000,
        lon=2.8650,
        is_demo=True,
    )
    foreign = Site(
        org_id=world["org2"].id,
        name="Foreign Site",
        wilaya="16",
        commune="Alger",
        lat=36.7538,
        lon=3.0588,
        is_demo=True,
    )
    db.add_all([own_a, own_b, foreign])
    db.commit()
    return own_a, own_b, foreign


def test_ogc_requires_authentication(client):
    assert client.get("/api/ogc").status_code == 401
    assert client.get("/api/ogc/collections/sites/items").status_code == 401


def test_ogc_landing_and_conformance(client, world):
    headers = login(client, world["o1_member"].email)

    landing = client.get("/api/ogc", headers=headers)
    assert landing.status_code == 200, landing.text
    body = landing.json()
    assert body["organization_scoped"] is True
    assert body["x-foggara-certified"] is False
    assert any(link["rel"] == "data" for link in body["links"])

    conformance = client.get("/api/ogc/conformance", headers=headers)
    assert conformance.status_code == 200
    classes = set(conformance.json()["conformsTo"])
    assert "http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/core" in classes
    assert "http://www.opengis.net/spec/ogcapi-features-1/1.0/conf/geojson" in classes


def test_ogc_items_are_geojson_and_org_scoped(client, world, db):
    own_a, own_b, foreign = _sites(db, world)
    headers = login(client, world["o1_member"].email)

    response = client.get("/api/ogc/collections/sites/items", headers=headers)
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/geo+json")
    body = response.json()
    assert body["type"] == "FeatureCollection"
    assert body["numberMatched"] == 2
    assert body["numberReturned"] == 2
    ids = {feature["id"] for feature in body["features"]}
    assert ids == {str(own_a.id), str(own_b.id)}
    assert str(foreign.id) not in ids
    for feature in body["features"]:
        assert feature["geometry"]["type"] == "Point"
        assert "crs" not in feature

    foreign_item = client.get(
        f"/api/ogc/collections/sites/items/{foreign.id}", headers=headers
    )
    assert foreign_item.status_code == 404


def test_ogc_bbox_and_pagination(client, world, db):
    own_a, own_b, _foreign = _sites(db, world)
    headers = login(client, world["o1_member"].email)

    bbox = client.get(
        "/api/ogc/collections/sites/items?bbox=-1,27,0,29",
        headers=headers,
    )
    assert bbox.status_code == 200, bbox.text
    body = bbox.json()
    assert body["numberMatched"] == 1
    assert [feature["id"] for feature in body["features"]] == [str(own_a.id)]

    page = client.get(
        "/api/ogc/collections/sites/items?limit=1&offset=0",
        headers=headers,
    )
    assert page.status_code == 200
    first = page.json()
    assert first["numberMatched"] == 2
    assert first["numberReturned"] == 1
    assert any(link["rel"] == "next" for link in first["links"])

    second = client.get(
        "/api/ogc/collections/sites/items?limit=1&offset=1",
        headers=headers,
    )
    assert second.status_code == 200
    second_body = second.json()
    assert second_body["numberReturned"] == 1
    assert any(link["rel"] == "prev" for link in second_body["links"])
    assert {first["features"][0]["id"], second_body["features"][0]["id"]} == {
        str(own_a.id),
        str(own_b.id),
    }


def test_ogc_collection_extent_is_org_scoped(client, world, db):
    own_a, own_b, _foreign = _sites(db, world)
    headers = login(client, world["o1_member"].email)

    response = client.get("/api/ogc/collections/sites", headers=headers)
    assert response.status_code == 200
    collection = response.json()
    assert collection["id"] == "sites"
    assert collection["x-foggara-certified"] is False
    assert collection["extent"]["spatial"]["bbox"] == [[
        float(own_a.lon),
        float(own_a.lat),
        float(own_b.lon),
        float(own_b.lat),
    ]]


def test_ogc_rejects_invalid_bbox(client, world):
    headers = login(client, world["o1_member"].email)

    for bbox in ("1,2,3", "x,2,3,4", "5,2,1,4", "-181,0,1,2"):
        response = client.get(
            f"/api/ogc/collections/sites/items?bbox={bbox}",
            headers=headers,
        )
        assert response.status_code == 422, (bbox, response.text)
        assert response.json()["detail"]["code"] == "INVALID_BBOX"
