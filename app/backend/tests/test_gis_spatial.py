import pytest
from sqlalchemy import text

from app.models import Site
from tests.conftest import login


def _site(db, org_id, name, lat, lon):
    row = Site(org_id=org_id, name=name, wilaya="TEST", commune="TEST",
               lat=lat, lon=lon, is_demo=True)
    db.add(row)
    db.flush()
    return row


def test_geojson_is_organization_scoped(client, db, world):
    own = _site(db, world["org1"].id, "own-site", 33.80, 2.88)
    other = _site(db, world["org2"].id, "other-site", 33.81, 2.89)
    db.commit()

    headers = login(client, world["o1_member"].email)
    response = client.get("/api/gis/sites.geojson", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["type"] == "FeatureCollection"
    ids = {feature["id"] for feature in body["features"]}
    assert own.id in ids
    assert other.id not in ids
    assert body["metadata"]["organization_scoped"] is True


def test_spatial_queries_enforce_tenant_boundary(client, db, world):
    if db.bind.dialect.name != "postgresql":
        pytest.skip("real PostGIS test")

    own = _site(db, world["org1"].id, "own-nearby", 33.8000, 2.8800)
    other = _site(db, world["org2"].id, "other-nearby", 33.8002, 2.8802)
    db.flush()
    db.execute(text("""
        UPDATE sites
        SET geom = ST_SetSRID(ST_MakePoint(lon::double precision, lat::double precision), 4326)
        WHERE id IN (:own, :other)
    """), {"own": own.id, "other": other.id})
    db.commit()

    headers = login(client, world["o1_member"].email)

    nearest = client.get("/api/gis/sites/nearest?lon=2.88&lat=33.8&limit=10", headers=headers)
    assert nearest.status_code == 200, nearest.text
    nearest_ids = {feature["id"] for feature in nearest.json()["items"]}
    assert own.id in nearest_ids
    assert other.id not in nearest_ids

    within = client.get("/api/gis/sites/within?lon=2.88&lat=33.8&radius_m=5000", headers=headers)
    assert within.status_code == 200, within.text
    within_ids = {feature["id"] for feature in within.json()["items"]}
    assert own.id in within_ids
    assert other.id not in within_ids

    intersects = client.get(
        "/api/gis/sites/intersects?min_lon=2.7&min_lat=33.6&max_lon=3.0&max_lat=34.0",
        headers=headers,
    )
    assert intersects.status_code == 200, intersects.text
    intersects_ids = {feature["id"] for feature in intersects.json()["features"]}
    assert own.id in intersects_ids
    assert other.id not in intersects_ids


def test_bbox_guard_rejects_oversized_query(client, db, world):
    headers = login(client, world["o1_member"].email)
    response = client.get(
        "/api/gis/sites/intersects?min_lon=-10&min_lat=0&max_lon=20&max_lat=40",
        headers=headers,
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "BBOX_TOO_LARGE"
