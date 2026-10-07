from datetime import datetime, timezone

from tests.conftest import login


def test_iot_binding_geojson_only_maps_resolvable_owned_subjects(client, world):
    h1 = login(client, "o1m@t.dz")
    h2 = login(client, "o2m@t.dz")

    site = client.post(
        "/api/sites",
        headers=h1,
        json={"name": "IoT GIS Site", "wilaya": "Laghouat", "lat": 33.79, "lon": 2.91},
    )
    assert site.status_code == 201, site.text
    site_id = site.json()["id"]

    well = client.post(
        "/api/water/wells",
        headers=h1,
        json={"site_id": site_id, "name": "IoT Well", "depth_m": 52},
    )
    assert well.status_code == 201, well.text
    well_id = well.json()["id"]

    device = client.post(
        "/api/telemetry/devices",
        headers=h1,
        json={
            "name": "Mapped simulated controller",
            "device_type": "well_controller",
            "status": "active",
            "subject_type": "well",
            "subject_id": well_id,
            "configuration": {},
        },
    )
    assert device.status_code == 201, device.text

    sensor = client.post(
        "/api/telemetry/sensors",
        headers=h1,
        json={
            "device_id": device.json()["id"],
            "name": "Mapped pressure sensor",
            "sensor_type": "pressure",
            "metric": "pressure",
            "unit": "bar",
            "min_value": 0,
            "max_value": 8,
            "status": "active",
            "subject_type": "well",
            "subject_id": well_id,
            "configuration": {},
        },
    )
    assert sensor.status_code == 201, sensor.text

    unresolved_device = client.post(
        "/api/telemetry/devices",
        headers=h1,
        json={
            "name": "Unresolved simulated controller",
            "device_type": "generic_sensor_node",
            "status": "active",
            "subject_type": "unknown_kind",
            "subject_id": 999999,
            "configuration": {},
        },
    )
    assert unresolved_device.status_code == 201, unresolved_device.text
    unresolved_sensor = client.post(
        "/api/telemetry/sensors",
        headers=h1,
        json={
            "device_id": unresolved_device.json()["id"],
            "name": "Unresolved temperature sensor",
            "sensor_type": "temperature",
            "metric": "temperature",
            "unit": "°C",
            "min_value": -20,
            "max_value": 80,
            "status": "active",
            "subject_type": "unknown_kind",
            "subject_id": 999999,
            "configuration": {},
        },
    )
    assert unresolved_sensor.status_code == 201, unresolved_sensor.text

    response = client.get("/api/gis/iot-bindings.geojson", headers=h1)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["metadata"]["coordinate_scope"] == "resolved_subject_site_not_sensor_gps"
    assert body["metadata"]["exact_sensor_coordinates"] is False
    assert body["metadata"]["live_telemetry_claim"] is False
    assert body["metadata"]["sensor_records"] >= 2
    assert body["metadata"]["unresolved_sensor_records"] >= 1

    feature = next(item for item in body["features"] if item["properties"]["site_id"] == site_id)
    assert feature["geometry"] == {"type": "Point", "coordinates": [2.91, 33.79]}
    assert feature["properties"]["sensor_count"] >= 1
    assert feature["properties"]["simulated_sensor_count"] >= 1
    assert feature["properties"]["non_simulated_sensor_count"] == 0
    assert feature["properties"]["exact_sensor_coordinates"] is False
    assert feature["properties"]["live_telemetry_claim"] is False
    assert "pressure" in feature["properties"]["metrics"]

    other = client.get("/api/gis/iot-bindings.geojson", headers=h2)
    assert other.status_code == 200
    assert all(item["properties"]["site_id"] != site_id for item in other.json()["features"])
