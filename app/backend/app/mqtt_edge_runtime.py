"""Real MQTT edge ingestion for commissioned FOGGARA devices.

Topic contract:
    <prefix>/<org_id>/<sensor_id>/telemetry

Payload:
    {"value": 12.3, "observed_at": "2026-10-08T22:00:00Z",
     "message_id": "optional", "external_device_id": "optional"}

The broker credential is server-side only. Tenant/sensor ownership is derived from
the topic and database; payload ownership metadata is never trusted.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
import logging
import math
import uuid

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from . import config
from .db import SessionLocal
from .models import Device, Sensor, TelemetryReading
from .services.telemetry_service import validate_reading

log = logging.getLogger("foggara.mqtt_edge")
MAX_PAYLOAD_BYTES = 16_384

runtime = {
    "state": "disabled" if not config.MQTT_EDGE_ENABLED else "stopped",
    "connected": False,
    "last_connect": None,
    "last_message": None,
    "last_error": None,
    "messages_received": 0,
    "messages_stored": 0,
    "messages_rejected": 0,
}


class MqttPayloadError(ValueError):
    pass


def _topic_identity(topic: str) -> tuple[int, int]:
    parts = topic.split("/")
    if len(parts) != 4 or parts[0] != config.MQTT_TOPIC_PREFIX or parts[3] != "telemetry":
        raise MqttPayloadError("invalid topic")
    try:
        org_id = int(parts[1])
        sensor_id = int(parts[2])
    except (TypeError, ValueError) as exc:
        raise MqttPayloadError("invalid topic identity") from exc
    if org_id <= 0 or sensor_id <= 0:
        raise MqttPayloadError("invalid topic identity")
    return org_id, sensor_id


def _aware_datetime(value) -> datetime:
    if not isinstance(value, str) or len(value) > 64:
        raise MqttPayloadError("observed_at must be an ISO-8601 string")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise MqttPayloadError("observed_at must be ISO-8601") from exc
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise MqttPayloadError("observed_at must include timezone")
    return parsed.astimezone(timezone.utc)


def _finite_value(value):
    if value is None:
        return None
    if isinstance(value, bool):
        raise MqttPayloadError("value must be numeric")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise MqttPayloadError("value must be numeric") from exc
    if not math.isfinite(number):
        raise MqttPayloadError("value must be finite")
    return number


def ingest_mqtt_payload(topic: str, payload: bytes | bytearray | str, *, qos: int = 0) -> dict:
    """Validate and persist one broker message. Safe to call from a worker thread."""
    if isinstance(payload, str):
        raw = payload.encode("utf-8")
    elif isinstance(payload, (bytes, bytearray)):
        raw = bytes(payload)
    else:
        raise MqttPayloadError("payload must be UTF-8 JSON")
    if not raw or len(raw) > MAX_PAYLOAD_BYTES:
        raise MqttPayloadError("payload size is invalid")
    try:
        body = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise MqttPayloadError("payload must be UTF-8 JSON") from exc
    if not isinstance(body, dict):
        raise MqttPayloadError("payload must be a JSON object")

    allowed = {"value", "observed_at", "message_id", "external_device_id", "sensor_id", "org_id"}
    if set(body) - allowed:
        raise MqttPayloadError("payload contains unsupported fields")

    org_id, sensor_id = _topic_identity(topic)
    if "org_id" in body and body["org_id"] != org_id:
        raise MqttPayloadError("payload org_id does not match topic")
    if "sensor_id" in body and body["sensor_id"] != sensor_id:
        raise MqttPayloadError("payload sensor_id does not match topic")

    observed_at = _aware_datetime(body.get("observed_at"))
    value = _finite_value(body.get("value"))
    message_id = body.get("message_id")
    external_device_id = body.get("external_device_id")
    if message_id is not None and (not isinstance(message_id, str) or len(message_id) > 255):
        raise MqttPayloadError("message_id must be a string up to 255 characters")
    if external_device_id is not None and (
        not isinstance(external_device_id, str) or len(external_device_id) > 255
    ):
        raise MqttPayloadError("external_device_id must be a string up to 255 characters")

    with SessionLocal() as db:
        sensor = db.scalar(
            select(Sensor).where(
                Sensor.id == sensor_id,
                Sensor.org_id == org_id,
                Sensor.status == "active",
                Sensor.is_simulated.is_(False),
            )
        )
        if sensor is None:
            raise MqttPayloadError("sensor is not commissioned for this organization")
        device = db.scalar(
            select(Device).where(
                Device.id == sensor.device_id,
                Device.org_id == org_id,
                Device.status == "active",
                Device.protocol == "mqtt",
                Device.is_simulated.is_(False),
            )
        )
        if device is None:
            raise MqttPayloadError("device is not an active MQTT device")

        quality, errors = validate_reading(sensor, value, observed_at)
        reading = TelemetryReading(
            org_id=org_id,
            device_id=device.id,
            sensor_id=sensor.id,
            subject_type=sensor.subject_type,
            subject_id=sensor.subject_id,
            metric=sensor.metric,
            value=value,
            unit=sensor.unit,
            quality=quality,
            observed_at=observed_at,
            source="api",
            is_demo=False,
            meta={
                "gateway": "mqtt",
                "mqtt_topic": topic,
                "mqtt_qos": int(qos),
                "external_device_id": external_device_id,
                "external_message_id": message_id,
                "validation_errors": errors,
            },
        )
        db.add(reading)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            existing = db.scalar(
                select(TelemetryReading).where(
                    TelemetryReading.sensor_id == sensor.id,
                    TelemetryReading.observed_at == observed_at,
                    TelemetryReading.metric == sensor.metric,
                )
            )
            if existing is None:
                raise
            return {"status": "duplicate", "reading_id": existing.id, "quality": existing.quality}

        reading_id = reading.id
        db.commit()
        return {"status": "stored", "reading_id": reading_id, "quality": quality}


def _safe_ingest(topic, payload, qos):
    runtime["messages_received"] += 1
    runtime["last_message"] = datetime.now(timezone.utc).isoformat()
    try:
        result = ingest_mqtt_payload(topic, payload, qos=qos)
        if result["status"] == "stored":
            runtime["messages_stored"] += 1
        runtime["last_error"] = None
    except Exception as exc:
        runtime["messages_rejected"] += 1
        runtime["last_error"] = type(exc).__name__
        log.warning("mqtt message rejected topic=%s error=%s", topic, type(exc).__name__)


async def run_mqtt_edge(stop: asyncio.Event):
    """Connect/reconnect to the configured broker until application shutdown."""
    if not config.MQTT_EDGE_ENABLED:
        runtime["state"] = "disabled"
        return

    from gmqtt import Client as MQTTClient

    runtime["state"] = "starting"
    while not stop.is_set():
        disconnected = asyncio.Event()
        client = MQTTClient(f"foggara-{uuid.uuid4().hex[:12]}")
        if config.MQTT_USERNAME:
            client.set_auth_credentials(config.MQTT_USERNAME, config.MQTT_PASSWORD)

        def on_connect(_client, _flags, _rc, _properties):
            runtime.update(
                state="running",
                connected=True,
                last_connect=datetime.now(timezone.utc).isoformat(),
                last_error=None,
            )
            _client.subscribe(f"{config.MQTT_TOPIC_PREFIX}/+/+/telemetry", qos=1)

        def on_disconnect(_client, _packet, exc=None):
            runtime["connected"] = False
            disconnected.set()
            if exc is not None:
                runtime["last_error"] = type(exc).__name__

        def on_message(_client, topic, payload, qos, _properties):
            asyncio.get_running_loop().create_task(
                asyncio.to_thread(_safe_ingest, topic, payload, qos)
            )

        client.on_connect = on_connect
        client.on_disconnect = on_disconnect
        client.on_message = on_message

        try:
            await client.connect(
                config.MQTT_BROKER_HOST,
                port=config.MQTT_BROKER_PORT,
                ssl=config.MQTT_TLS,
                keepalive=60,
            )
            stop_task = asyncio.create_task(stop.wait())
            disconnected_task = asyncio.create_task(disconnected.wait())
            done, pending = await asyncio.wait(
                {stop_task, disconnected_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()
            await asyncio.gather(*pending, return_exceptions=True)
            if stop.is_set():
                try:
                    await client.disconnect()
                except Exception:
                    pass
                break
        except Exception as exc:
            runtime.update(
                state="degraded",
                connected=False,
                last_error=type(exc).__name__,
            )
            log.warning("mqtt broker connection failed: %s", type(exc).__name__)

        if not stop.is_set():
            try:
                await asyncio.wait_for(stop.wait(), timeout=config.MQTT_RECONNECT_SECONDS)
            except asyncio.TimeoutError:
                pass

    runtime.update(state="stopped", connected=False)
