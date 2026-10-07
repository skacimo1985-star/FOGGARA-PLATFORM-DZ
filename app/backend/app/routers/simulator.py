"""المحاكي الحتمي + قواعد القياس (Phase 03 §14/§20..§24).

تشغيل المحاكاة يولّد قراءات حتمية ثم يقيّم القواعد — وقد ينشئ
«اقتراحات قرارات» PROPOSED فقط عبر محرك المرحلة 2. لا اعتماد ولا
تخويل ولا تنفيذ آلي إطلاقًا (§25). إدارة القواعد للمدير فقط (§31).
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import (SIM_MAX_STEPS, Sensor, SimulationRun, TelemetryReading,
                      TelemetryRule, User)
from ..schemas import (GovDecisionOut, SimulationResultOut, SimulationRunIn,
                       SimulationRunOut, TelemetryRuleIn, TelemetryRuleOut,
                       TelemetryRulePatchIn)
from ..services.simulator import simulate_sensor
from ..services.telemetry_service import evaluate_rules

router = APIRouter(prefix="/api/simulator", tags=["simulator"])
rules_router = APIRouter(prefix="/api/telemetry-rules", tags=["telemetry-rules"])


def _require_reviewer(user: User):
    if user.role not in ("reviewer", "admin"):
        api_error(403, "ROLE_FORBIDDEN", "Reviewer role required")
    return user


def _require_admin(user: User):
    if user.role != "admin":
        api_error(403, "ROLE_FORBIDDEN", "Admin role required")
    return user


# ---------- تشغيلات المحاكاة ----------
@router.post("/runs", response_model=SimulationRunOut, status_code=201)
def create_run(payload: SimulationRunIn, user: User = Depends(get_current_user),
               db: Session = Depends(get_db)):
    _require_reviewer(user)
    if payload.steps > SIM_MAX_STEPS:  # دفاع إضافي فوق Pydantic (§32)
        api_error(422, "STEPS_LIMIT", f"steps must not exceed {SIM_MAX_STEPS}")
    from ..models import Device
    device = db.get(Device, payload.device_id)
    if device is None or device.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Device not found")
    if not device.is_simulated:
        api_error(
            422,
            "SIMULATED_DEVICE_REQUIRED",
            "Simulation runs require a simulated device",
        )
    start = payload.start_time or datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
    run = SimulationRun(org_id=user.org_id, device_id=device.id,
                        scenario=payload.scenario, seed=payload.seed,
                        steps=payload.steps, step_seconds=payload.step_seconds,
                        start_time=start, created_by=user.id,
                        is_demo=device.is_demo)
    db.add(run)
    db.flush()
    audit(db, user, "create", "simulation_run", entity_id=run.id,
          meta={"scenario": run.scenario, "seed": run.seed, "steps": run.steps})
    db.commit()
    return run


@router.get("/runs", response_model=list[SimulationRunOut])
def list_runs(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(SimulationRun).where(SimulationRun.org_id == user.org_id)
                      .order_by(SimulationRun.id.desc()).limit(200)).scalars().all()


@router.get("/runs/{run_id}", response_model=SimulationRunOut)
def get_run(run_id: int, user: User = Depends(get_current_user),
            db: Session = Depends(get_db)):
    run = db.get(SimulationRun, run_id)
    if run is None or run.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Simulation run not found")
    return run


@router.post("/runs/{run_id}/run", response_model=SimulationResultOut)
def execute_run(run_id: int, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """تنفيذ حتمي متزامن: توليد → تخزين → تقييم قواعد → اقتراحات فقط."""
    _require_reviewer(user)
    run = db.get(SimulationRun, run_id)
    if run is None or run.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Simulation run not found")
    if run.status != "CREATED":
        api_error(409, "RUN_ALREADY_EXECUTED",
                  "Only CREATED runs can be executed (idempotent)")

    run.status = "RUNNING"
    db.flush()
    sensors = db.execute(
        select(Sensor).where(Sensor.device_id == run.device_id,
                             Sensor.org_id == user.org_id,
                             Sensor.status == "active")
    ).scalars().all()
    if not sensors:
        run.status = "FAILED"
        db.commit()
        api_error(422, "NO_SENSORS", "Device has no active sensors")

    generated: list[TelemetryReading] = []
    try:
        for sensor in sensors:
            for raw in simulate_sensor(sensor, run.scenario, run.start_time,
                                       run.steps, run.step_seconds, run.seed):
                reading = TelemetryReading(
                    org_id=user.org_id, device_id=run.device_id, sensor_id=sensor.id,
                    subject_type=sensor.subject_type, subject_id=sensor.subject_id,
                    metric=sensor.metric, value=raw["value"], unit=sensor.unit,
                    quality=raw["quality"], observed_at=raw["observed_at"],
                    source="simulator", simulation_run_id=run.id,
                    is_demo=run.is_demo)
                db.add(reading)
                try:
                    db.flush()
                    generated.append(reading)
                except IntegrityError:
                    db.rollback()
                    raise RuntimeError("DUPLICATE_READING")
        # تقييم القواعد → اقتراحات PROPOSED فقط (§23)
        proposals = evaluate_rules(db, user.org_id, generated, user)
        run.status = "COMPLETED"
        run.generated_count = len(generated)
        run.end_time = run.start_time + timedelta(seconds=run.steps * run.step_seconds)
        audit(db, user, "execute", "simulation_run", entity_id=run.id,
              meta={"generated": len(generated), "proposals": len(proposals)})
        db.commit()
    except RuntimeError:
        db.rollback()
        run2 = db.get(SimulationRun, run_id)
        run2.status = "FAILED"
        db.commit()
        api_error(409, "DUPLICATE_READING",
                  "Readings for this time window already exist")

    return SimulationResultOut(
        run=SimulationRunOut.model_validate(run),
        generated=len(generated),
        proposals=[GovDecisionOut.model_validate(p) for p in proposals])


# ---------- إدارة القواعد (admin فقط للكتابة) ----------
@rules_router.get("", response_model=list[TelemetryRuleOut])
def list_rules(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(TelemetryRule).where(TelemetryRule.org_id == user.org_id)
                      .order_by(TelemetryRule.id)).scalars().all()


@rules_router.post("", response_model=TelemetryRuleOut, status_code=201)
def create_rule(payload: TelemetryRuleIn, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    _require_admin(user)
    # User-authored deterministic rules are operational organization data,
    # even when they are exercised against synthetic simulation readings.
    r = TelemetryRule(org_id=user.org_id, is_demo=False, **payload.model_dump())
    db.add(r)
    db.flush()
    audit(db, user, "create", "telemetry_rule", entity_id=r.id,
          meta={"metric": r.metric, "operator": r.operator})
    db.commit()
    return r


@rules_router.patch("/{rule_id}", response_model=TelemetryRuleOut)
def patch_rule(rule_id: int, payload: TelemetryRulePatchIn,
               user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _require_admin(user)
    r = db.get(TelemetryRule, rule_id)
    if r is None or r.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Rule not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(r, field, value)
    audit(db, user, "update", "telemetry_rule", entity_id=r.id)
    db.commit()
    return r
