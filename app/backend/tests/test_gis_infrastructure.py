from tests.conftest import login


def test_infrastructure_geojson_is_site_anchored_and_tenant_scoped(client, world):
    h1 = login(client, "o1m@t.dz")
    h2 = login(client, "o2m@t.dz")

    site = client.post(
        "/api/sites",
        headers=h1,
        json={"name": "Infra GIS Site", "wilaya": "Laghouat", "lat": 33.81, "lon": 2.88},
    )
    assert site.status_code == 201, site.text
    site_id = site.json()["id"]

    resource = client.post(
        "/api/resources",
        headers=h1,
        json={"site_id": site_id, "type": "well", "name": "Registered water resource", "status": "active"},
    )
    assert resource.status_code == 201, resource.text

    well = client.post(
        "/api/water/wells",
        headers=h1,
        json={"site_id": site_id, "name": "Operational well", "depth_m": 45},
    )
    assert well.status_code == 201, well.text

    response = client.get("/api/gis/infrastructure.geojson", headers=h1)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["metadata"]["coordinate_scope"] == "site_coordinate_not_asset_coordinate"
    assert body["metadata"]["exact_asset_coordinates"] is False

    feature = next(item for item in body["features"] if item["properties"]["site_id"] == site_id)
    assert feature["geometry"] == {"type": "Point", "coordinates": [2.88, 33.81]}
    assert feature["properties"]["water_resources"] == 1
    assert feature["properties"]["wells"] == 1
    assert feature["properties"]["total"] >= 2
    assert feature["properties"]["coordinate_scope"] == "SITE"
    assert feature["properties"]["exact_asset_coordinates"] is False

    other = client.get("/api/gis/infrastructure.geojson", headers=h2)
    assert other.status_code == 200
    assert all(item["properties"]["site_id"] != site_id for item in other.json()["features"])
