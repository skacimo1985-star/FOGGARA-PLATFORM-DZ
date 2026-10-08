from sqlalchemy import select

from app import config
from app.models import TelemetryReading
from app.mqtt_edge_runtime import MqttPayloadError, ingest_mqtt_payload
from tests.conftest import login


TEL = "/api/telemetry"


def _commission(client, headers):
    response = client.post(
        f"{TEL}/devices",
        headers=headers,
        json={
            "name": "AGRI NODE PRO",
            "device_type": "generic_sensor_node",
            "protocol": "mqtt",
            "subject_type": "parcel",
            "subject_id": 1,
            "configuration": {"external_device_id": "agri-node-001"},
        },
    )
    assert response.status_code == 201, response.text
    device = response.json()
    sensor_response = client.post(
        f"{TEL}/sensors",
        headers=headers,
        json={
            "device_id": device["id"],
            "name": "Soil moisture",
            "sensor_type": "water_level",
            "metric": "soil_moisture",
            "unit": "%",
            "min_value": 0,
            "max_value": 100,
            "subject_type": "parcel",
            "subject_id": 1,
        },
    )
    assert sensor_response.status_code == 201, sensor_response.text
    return device, sensor_response.json()


def test_commission_real_mqtt_device_and_persist_broker_message(client, db, world):
    headers = login(client, "o1r@t.dz")
    device, sensor = _commission(client, headers)

    assert device["protocol"] == "mqtt"
    assert device["is_simulated"] is False
    assert device["is_demo"] is False
    assert sensor["is_simulated"] is False
    assert sensor["is_demo"] is False

    topic = f"{config.MQTT_TOPIC_PREFIX}/{device['org_id']}/{sensor['id']}/telemetry"
    payload = (
        '{"value":27.4,"observed_at":"2026-01-02T10:00:00Z",'
        '"message_id":"node-msg-1","external_device_id":"agri-node-001"}'
    )
    first = ingest_mqtt_payload(topic, payload, qos=1)
    duplicate = ingest_mqtt_payload(topic, payload, qos=1)

    assert first["status"] == "stored"
    assert first["quality"] == "VALID"
    assert duplicate["status"] == "duplicate"
    assert duplicate["reading_id"] == first["reading_id"]

    row = db.scalar(select(TelemetryReading).where(TelemetryReading.id == first["reading_id"]))
    db.refresh(row)
    assert row is not None
    assert row.source == "api"
    assert row.is_demo is False
    assert row.meta["gateway"] == "mqtt"
    assert row.meta["external_message_id"] == "node-msg-1"
    assert row.meta["mqtt_qos"] == 1


def test_real_edge_commissioning_requires_reviewer_and_rejects_inline_secrets(client, world):
    member = login(client, "o1m@t.dz")
    reviewer = login(client, "o1r@t.dz")

    denied = client.post(
        f"{TEL}/devices",
        headers=member,
        json={
            "name": "Member node",
            "device_type": "generic_sensor_node",
            "protocol": "mqtt",
        },
    )
    assert denied.status_code == 403

    secret = client.post(
        f"{TEL}/devices",
        headers=reviewer,
        json={
            "name": "Bad node",
            "device_type": "generic_sensor_node",
            "protocol": "mqtt",
            "configuration": {"password": "must-not-be-stored"},
        },
    )
    assert secret.status_code == 422
    assert secret.json()["detail"]["code"] == "INLINE_CREDENTIAL_FORBIDDEN"


def test_mqtt_topic_tenant_identity_is_enforced(client, world):
    headers = login(client, "o1r@t.dz")
    device, sensor = _commission(client, headers)
    wrong_org_topic = f"{config.MQTT_TOPIC_PREFIX}/{device['org_id'] + 999}/{sensor['id']}/telemetry"

    try:
        ingest_mqtt_payload(
            wrong_org_topic,
            '{"value":40,"observed_at":"2026-01-02T10:05:00Z"}',
        )
    except MqttPayloadError as exc:
        assert "commissioned" in str(exc)
    else:
        raise AssertionError("tenant mismatch must be rejected")


def test_mqtt_status_endpoint_exposes_no_credentials(client, world):
    headers = login(client, "o1r@t.dz")
    _commission(client, headers)
    response = client.get(f"{TEL}/edge/status", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["protocol"] == "mqtt"
    assert body["commissioned_devices"] >= 1
    serialized = str(body).lower()
    assert "password" not in serialized
    assert "username" not in serialized
