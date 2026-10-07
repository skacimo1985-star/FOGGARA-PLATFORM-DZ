"""القياس عن بُعد: أجهزة، مستشعرات، استيعاب، تحقق، تجميع (Phase 03 §15..§19).

كل الملكية تُشتق خادميًا من الموارد المصادق عليها — لا يُقبل org_id من العميل (§16).
التحقق صارم: التشوه البنيوي 422، والانتهاك الفيزيائي يُخزَّن موسومًا INVALID (§9/§17).
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import (
    Device, IrrigationZone, Pump, Reservoir, Sensor, TELEMETRY_QUERY_MAX_DAYS,
    TELEMETRY_QUERY_MAX_LIMIT, TELEMETRY_UNITS, TelemetryReading, User, Valve, Well,
)
from ..schemas import (DeviceIn, DeviceOut, SensorIn, SensorOut,
                       EdgeTelemetryIn, TelemetryAggregateOut, TelemetryIngestIn, TelemetryOut,
                       TelemetryValidateOut)
from ..services.telemetry_service import validate_reading

router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])


def _owned_sensor(db: Session, org_id: int, sensor_id: int) -> Sensor:
    s = db.get(Sensor, sensor_id)
    if s is None or s.org_id != org_id:
        api_error(404, "NOT_FOUND", "Sensor not found")
    return s


def _owned_device(db: Session, org_id: int, device_id: int) -> Device:
    d = db.get(Device, device_id)
    if d is None or d.org_id != org_id:
        api_error(404, "NOT_FOUND", "Device not found")
    return d


SPATIAL_SUBJECT_MODELS = {
    "well": Well,
    "reservoir": Reservoir,
    "pump": Pump,
    "valve": Valve,
    "irrigation_zone": IrrigationZone,
    "zone": IrrigationZone,
}


def _validate_subject_reference(
    db: Session,
    org_id: int,
    subject_type: Optional[str],
    subject_id: Optional[int],
) -> tuple[Optional[str], Optional[int]]:
    if (subject_type is None) != (subject_id is None):
        api_error(422, "SUBJECT_REFERENCE_INCOMPLETE", "subject_type and subject_id must be provided together")
    if subject_type is None or subject_id is None:
        return None, None

    normalized = subject_type.strip().lower()
    if not normalized:
        api_error(422, "SUBJECT_TYPE_EMPTY", "subject_type must not be empty")

    model = SPATIAL_SUBJECT_MODELS.get(normalized)
    if model is not None:
        subject = db.get(model, subject_id)
        if subject is None or subject.org_id != org_id:
            api_error(404, "SUBJECT_NOT_FOUND", "Referenced subject was not found in this organization")
    return normalized, subject_id


def _range(from_: Optional[datetime], to: Optional[datetime]):
    if from_ and to:
        f = from_ if from_.tzinfo else from_.replace(tzinfo=timezone.utc)
        t = to if to.tzinfo else to.replace(tzinfo=timezone.utc)
        if t <= f:
            api_error(422, "RANGE_ORDER", "to must be after from")
        if t - f > timedelta(days=TELEMETRY_QUERY_MAX_DAYS):
            api_error(422, "RANGE_TOO_WIDE",
                      f"Range exceeds {TELEMETRY_QUERY_MAX_DAYS} days")
    return from_, to


# ---------- الأجهزة ----------
@router.get("/devices", response_model=list[DeviceOut])
def list_devices(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(Device).where(Device.org_id == user.org_id)
                      .order_by(Device.id)).scalars().all()


@router.post("/devices", response_model=DeviceOut, status_code=201)
def create_device(payload: DeviceIn, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    data = payload.model_dump()
    subject_type, subject_id = _validate_subject_reference(
        db, user.org_id, data.get("subject_type"), data.get("subject_id")
    )
    data["subject_type"] = subject_type
    data["subject_id"] = subject_id
    d = Device(org_id=user.org_id, protocol="simulated", is_simulated=True,
               is_demo=True, **data)
    db.add(d)
    db.flush()
    audit(db, user, "create", "device", entity_id=d.id)
    db.commit()
    return d


# ---------- المستشعرات ----------
@router.get("/sensors", response_model=list[SensorOut])
def list_sensors(device_id: Optional[int] = Query(default=None),
                 user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    q = select(Sensor).where(Sensor.org_id == user.org_id)
    if device_id is not None:
        _owned_device(db, user.org_id, device_id)
        q = q.where(Sensor.device_id == device_id)
    return db.execute(q.order_by(Sensor.id)).scalars().all()


@router.post("/sensors", response_model=SensorOut, status_code=201)
def create_sensor(payload: SensorIn, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    device = _owned_device(db, user.org_id, payload.device_id)
    if payload.unit not in TELEMETRY_UNITS:
        api_error(422, "UNIT_NOT_ALLOWED", "Unit is not in the supported list")
    if payload.min_value is not None and payload.max_value is not None \
            and payload.max_value <= payload.min_value:
        api_error(422, "RANGE_ORDER", "max_value must exceed min_value")
    data = payload.model_dump()
    if data.get("subject_type") is None and data.get("subject_id") is None:
        data["subject_type"] = device.subject_type
        data["subject_id"] = device.subject_id
    subject_type, subject_id = _validate_subject_reference(
        db, user.org_id, data.get("subject_type"), data.get("subject_id")
    )
    data["subject_type"] = subject_type
    data["subject_id"] = subject_id
    s = Sensor(org_id=user.org_id, is_simulated=True, is_demo=True, **data)
    db.add(s)
    db.flush()
    audit(db, user, "create", "sensor", entity_id=s.id)
    db.commit()
    return s


# ---------- الاستيعاب والتحقق (مسارات ثابتة قبل /{id}) ----------
@router.post("/ingest", response_model=TelemetryOut, status_code=201)
def ingest_telemetry(payload: TelemetryIngestIn, response: Response,
                     user: User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    sensor = _owned_sensor(db, user.org_id, payload.sensor_id)
    quality, errors = validate_reading(sensor, payload.value, payload.observed_at)
    reading = TelemetryReading(
        org_id=user.org_id, device_id=sensor.device_id, sensor_id=sensor.id,
        subject_type=sensor.subject_type, subject_id=sensor.subject_id,
        metric=sensor.metric, value=payload.value, unit=sensor.unit,
        quality=quality, observed_at=payload.observed_at,
        source="api", is_demo=sensor.is_demo,
        meta={"validation_errors": errors} if errors else {},
    )
    db.add(reading)
    try:
        db.flush()
    except IntegrityError:
        # حماية من التكرار (§18): نفس (sensor, observed_at, metric) → السجل القائم
        db.rollback()
        existing = db.execute(
            select(TelemetryReading).where(
                TelemetryReading.sensor_id == sensor.id,
                TelemetryReading.observed_at == payload.observed_at,
                TelemetryReading.metric == sensor.metric)
        ).scalar_one()
        response.status_code = 200
        return existing
    audit(db, user, "create", "telemetry_reading", entity_id=reading.id,
          meta={"sensor_id": sensor.id, "quality": quality})
    db.commit()
    return reading


@router.post("/edge/ingest", response_model=TelemetryOut, status_code=201)
def ingest_edge_telemetry(payload: EdgeTelemetryIn, response: Response,
                          user: User = Depends(get_current_user),
                          db: Session = Depends(get_db)):
    """Ingest a normalized reading from an edge gateway without trusting gateway ownership metadata."""
    sensor = _owned_sensor(db, user.org_id, payload.sensor_id)
    quality, errors = validate_reading(sensor, payload.value, payload.observed_at)
    reading = TelemetryReading(
        org_id=user.org_id, device_id=sensor.device_id, sensor_id=sensor.id,
        subject_type=sensor.subject_type, subject_id=sensor.subject_id,
        metric=sensor.metric, value=payload.value, unit=sensor.unit,
        quality=quality, observed_at=payload.observed_at,
        source="api", is_demo=sensor.is_demo,
        meta={"validation_errors": errors, "gateway": payload.gateway,
              "external_device_id": payload.external_device_id,
              "external_message_id": payload.external_message_id},
    )
    db.add(reading)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        existing = db.execute(select(TelemetryReading).where(
            TelemetryReading.sensor_id == sensor.id,
            TelemetryReading.observed_at == payload.observed_at,
            TelemetryReading.metric == sensor.metric)).scalar_one()
        response.status_code = 200
        return existing
    audit(db, user, "create", "telemetry_reading", entity_id=reading.id,
          meta={"sensor_id": sensor.id, "quality": quality, "source": reading.source})
    db.commit()
    return reading


@router.post("/validate", response_model=TelemetryValidateOut)
def validate_only(payload: TelemetryIngestIn, user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    """تحقق تجريبي دون تخزين."""
    sensor = _owned_sensor(db, user.org_id, payload.sensor_id)
    quality, errors = validate_reading(sensor, payload.value, payload.observed_at)
    return TelemetryValidateOut(valid=quality == "VALID", quality=quality, errors=errors)


@router.get("/latest", response_model=list[TelemetryOut])
def latest_readings(sensor_id: Optional[int] = Query(default=None),
                    user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """أحدث قراءة VALID لكل مستشعر (أو لمستشعر محدد)."""
    sensors_q = select(Sensor).where(Sensor.org_id == user.org_id)
    if sensor_id is not None:
        sensors_q = sensors_q.where(Sensor.id == _owned_sensor(db, user.org_id, sensor_id).id)
    out = []
    for s in db.execute(sensors_q).scalars().all():
        r = db.execute(
            select(TelemetryReading).where(
                TelemetryReading.sensor_id == s.id,
                TelemetryReading.quality == "VALID")
            .order_by(TelemetryReading.observed_at.desc()).limit(1)
        ).scalar_one_or_none()
        if r is not None:
            out.append(r)
    return out


@router.get("/series", response_model=list[TelemetryOut])
def series(sensor_id: int, from_: Optional[datetime] = Query(default=None, alias="from"),
           to: Optional[datetime] = Query(default=None),
           limit: int = Query(default=500, le=TELEMETRY_QUERY_MAX_LIMIT),
           user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _owned_sensor(db, user.org_id, sensor_id)
    from_, to = _range(from_, to)
    q = select(TelemetryReading).where(TelemetryReading.sensor_id == sensor_id)
    if from_:
        q = q.where(TelemetryReading.observed_at >= from_)
    if to:
        q = q.where(TelemetryReading.observed_at <= to)
    return db.execute(q.order_by(TelemetryReading.observed_at).limit(limit)).scalars().all()


@router.get("/aggregate", response_model=TelemetryAggregateOut)
def aggregate(sensor_id: int,
              from_: Optional[datetime] = Query(default=None, alias="from"),
              to: Optional[datetime] = Query(default=None),
              user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """تجميع حتمي (§19) على القراءات VALID فقط — يحفظ الوحدة والحدود الزمنية."""
    sensor = _owned_sensor(db, user.org_id, sensor_id)
    from_, to = _range(from_, to)
    q = select(TelemetryReading.value, TelemetryReading.observed_at).where(
        TelemetryReading.sensor_id == sensor.id,
        TelemetryReading.quality == "VALID",
        TelemetryReading.value.is_not(None))
    if from_:
        q = q.where(TelemetryReading.observed_at >= from_)
    if to:
        q = q.where(TelemetryReading.observed_at <= to)
    rows = db.execute(q.order_by(TelemetryReading.observed_at)).all()
    vals = [float(v) for v, _ in rows]
    return TelemetryAggregateOut(
        sensor_id=sensor.id, metric=sensor.metric, unit=sensor.unit,
        latest=vals[-1] if vals else None,
        min=min(vals) if vals else None, max=max(vals) if vals else None,
        avg=round(sum(vals) / len(vals), 4) if vals else None,
        sum=round(sum(vals), 4) if vals else None, count=len(vals))


@router.get("", response_model=list[TelemetryOut])
def list_telemetry(device_id: Optional[int] = Query(default=None),
                   sensor_id: Optional[int] = Query(default=None),
                   metric: Optional[str] = Query(default=None),
                   quality: Optional[str] = Query(default=None),
                   from_: Optional[datetime] = Query(default=None, alias="from"),
                   to: Optional[datetime] = Query(default=None),
                   limit: int = Query(default=200, le=TELEMETRY_QUERY_MAX_LIMIT),
                   user: User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    _range(from_, to)
    q = select(TelemetryReading).where(TelemetryReading.org_id == user.org_id)
    if device_id is not None:
        _owned_device(db, user.org_id, device_id)
        q = q.where(TelemetryReading.device_id == device_id)
    if sensor_id is not None:
        q = q.where(TelemetryReading.sensor_id == sensor_id)
    if metric:
        q = q.where(TelemetryReading.metric == metric)
    if quality:
        q = q.where(TelemetryReading.quality == quality)
    if from_:
        q = q.where(TelemetryReading.observed_at >= from_)
    if to:
        q = q.where(TelemetryReading.observed_at <= to)
    return db.execute(q.order_by(TelemetryReading.observed_at.desc())
                      .limit(limit)).scalars().all()


@router.get("/{reading_id}", response_model=TelemetryOut)
def get_reading(reading_id: int, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    r = db.get(TelemetryReading, reading_id)
    if r is None or r.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Telemetry reading not found")
    return r
