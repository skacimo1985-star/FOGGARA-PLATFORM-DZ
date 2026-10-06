from datetime import datetime, timezone

from app.models import AgriObservation, AgriParcel
from tests.conftest import login

ACQUIRED = datetime(2026, 9, 30, 10, 0, tzinfo=timezone.utc)


def _scene(db, world, *, foreign=False, located=True, source_ref="sentinel2:scene-001"):
    org = world["org2"] if foreign else world["org1"]
    user = world["o2_member"] if foreign else world["o1_member"]
    parcel = AgriParcel(
        org_id=org.id,
        name="Remote parcel",
        crop="date_palm",
        area_ha=2.5,
        location="Adrar",
        lat=27.8743 if located else None,
        lon=-0.2939 if located else None,
        stage="mid",
        archived=False,
        created_by=user.id,
        is_demo=True,
    )
    db.add(parcel)
    db.flush()
    rows = []
    for metric, value, unit in [
        ("ndvi", 0.61, "index"),
        ("lswi", 0.22, "index"),
        ("moisture", 31.5, "% VWC"),
    ]:
        row = AgriObservation(
            org_id=org.id,
            parcel_id=parcel.id,
            metric=metric,
            value=value,
            unit=unit,
            source_type="satellite",
            source_ref=source_ref,
            observed_at=ACQUIRED,
            evidence_status="INFERRED",
            created_by=user.id,
            is_demo=True,
        )
        db.add(row)
        rows.append(row)
    db.commit()
    return parcel, rows


def test_stac_requires_authentication(client):
    assert client.get("/api/stac").status_code == 401
    assert client.get("/api/stac/collections").status_code == 401
    assert client.get("/api/stac/search").status_code == 401


def test_stac_landing_is_explicitly_compatibility_only(client, world):
    headers = login(client, world["o1_member"].email)
    response = client.get("/api/stac", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["stac_version"] == "1.1.0"
    assert body["type"] == "Catalog"
    assert body["organization_scoped"] is True
    assert body["x-foggara-certified"] is False
    assert body["x-foggara-api-conformance"] == []
    assert any(link["rel"] == "search" for link in body["links"])


def test_stac_groups_scene_metrics_into_one_item(client, world, db):
    parcel, rows = _scene(db, world)
    headers = login(client, world["o1_member"].email)

    response = client.get(
        "/api/stac/collections/foggara-remote-sensing/items",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/geo+json")
    body = response.json()
    assert body["numberMatched"] == 1
    assert body["numberReturned"] == 1
    item = body["features"][0]
    assert item["stac_version"] == "1.1.0"
    assert item["collection"] == "foggara-remote-sensing"
    assert item["id"] == f"rs-{parcel.id}-{min(row.id for row in rows)}"
    assert item["geometry"] == {
        "type": "Point",
        "coordinates": [float(parcel.lon), float(parcel.lat)],
    }
    assert item["bbox"] == [float(parcel.lon), float(parcel.lat), float(parcel.lon), float(parcel.lat)]
    assert item["properties"]["foggara:provider"] == "sentinel2"
    assert item["properties"]["foggara:scene_id"] == "scene-001"
    assert item["properties"]["foggara:evidence_status"] == "INFERRED"
    assert set(item["properties"]["foggara:metrics"]) == {"ndvi", "lswi", "moisture"}
    assert item["assets"] == {}


def test_stac_org_isolation_and_item_lookup(client, world, db):
    own_parcel, own_rows = _scene(db, world, source_ref="provider:own-scene")
    foreign_parcel, foreign_rows = _scene(db, world, foreign=True, source_ref="provider:foreign-scene")
    headers = login(client, world["o1_member"].email)

    search = client.get("/api/stac/search", headers=headers)
    assert search.status_code == 200
    body = search.json()
    assert body["numberMatched"] == 1
    assert body["features"][0]["properties"]["foggara:scene_id"] == "own-scene"

    own_id = f"rs-{own_parcel.id}-{min(row.id for row in own_rows)}"
    own = client.get(
        f"/api/stac/collections/foggara-remote-sensing/items/{own_id}",
        headers=headers,
    )
    assert own.status_code == 200

    foreign_id = f"rs-{foreign_parcel.id}-{min(row.id for row in foreign_rows)}"
    hidden = client.get(
        f"/api/stac/collections/foggara-remote-sensing/items/{foreign_id}",
        headers=headers,
    )
    assert hidden.status_code == 404


def test_stac_preserves_unknown_geometry_without_inventing_location(client, world, db):
    _parcel, _rows = _scene(db, world, located=False, source_ref="provider:no-location")
    headers = login(client, world["o1_member"].email)

    response = client.get("/api/stac/search", headers=headers)
    assert response.status_code == 200
    item = response.json()["features"][0]
    assert item["geometry"] is None
    assert "bbox" not in item


def test_stac_bbox_datetime_and_collection_filters(client, world, db):
    _scene(db, world, source_ref="sentinel2:scene-filter")
    headers = login(client, world["o1_member"].email)

    bbox = client.get(
        "/api/stac/search?bbox=-1,27,0,29",
        headers=headers,
    )
    assert bbox.status_code == 200
    assert bbox.json()["numberMatched"] == 1

    outside = client.get(
        "/api/stac/search?bbox=2,33,4,35",
        headers=headers,
    )
    assert outside.status_code == 200
    assert outside.json()["numberMatched"] == 0

    time_match = client.get(
        "/api/stac/search?datetime=2026-09-30T09:00:00Z/2026-09-30T11:00:00Z",
        headers=headers,
    )
    assert time_match.status_code == 200
    assert time_match.json()["numberMatched"] == 1

    time_miss = client.get(
        "/api/stac/search?datetime=2026-10-01T00:00:00Z/..",
        headers=headers,
    )
    assert time_miss.status_code == 200
    assert time_miss.json()["numberMatched"] == 0

    other_collection = client.get(
        "/api/stac/search?collections=other",
        headers=headers,
    )
    assert other_collection.status_code == 200
    assert other_collection.json()["numberMatched"] == 0


def test_stac_rejects_invalid_filters(client, world):
    headers = login(client, world["o1_member"].email)

    for bbox in ("1,2,3", "x,2,3,4", "5,2,1,4", "-181,0,1,2"):
        response = client.get(f"/api/stac/search?bbox={bbox}", headers=headers)
        assert response.status_code == 422, (bbox, response.text)
        assert response.json()["detail"]["code"] == "INVALID_BBOX"

    for value in ("bad-date", "../..", "2026-10-02T00:00:00Z/2026-10-01T00:00:00Z"):
        response = client.get(f"/api/stac/search?datetime={value}", headers=headers)
        assert response.status_code == 422, (value, response.text)
        assert response.json()["detail"]["code"] == "INVALID_DATETIME"


def test_stac_collection_extent_is_derived_from_org_records(client, world, db):
    parcel, _rows = _scene(db, world)
    headers = login(client, world["o1_member"].email)

    response = client.get(
        "/api/stac/collections/foggara-remote-sensing",
        headers=headers,
    )
    assert response.status_code == 200
    collection = response.json()
    assert collection["stac_version"] == "1.1.0"
    assert collection["type"] == "Collection"
    assert collection["x-foggara-spatial-extent-known"] is True
    assert collection["extent"]["spatial"]["bbox"] == [[
        float(parcel.lon), float(parcel.lat), float(parcel.lon), float(parcel.lat)
    ]]
    assert collection["summaries"]["foggara:evidence_status"] == ["INFERRED"]


def test_stac_mixed_demo_scene_remains_demo(client, world, db):
    _parcel, rows = _scene(db, world, source_ref="provider:mixed-demo-scene")
    rows[0].is_demo = False
    db.commit()
    headers = login(client, world["o1_member"].email)

    response = client.get("/api/stac/search", headers=headers)
    assert response.status_code == 200
    item = next(
        feature for feature in response.json()["features"]
        if feature["properties"]["foggara:scene_id"] == "mixed-demo-scene"
    )
    assert item["properties"]["foggara:is_demo"] is True
