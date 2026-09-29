"""خدمة القياس عن بُعد: التحقق + محرك القواعد الحتمي (Phase 03 §17/§20..§24).

التحقق خادمي صارم: لا قبول صامت لقراءات مستحيلة.
محرك القواعد: عوامل صريحة فقط (لا eval)، يقترح قرارات PROPOSED فقط —
لا يعتمد ولا يخوّل ولا ينفّذ أبدًا (§23/§25).
"""
import operator as _op
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..models import (GovDecision, GovDecisionEvidence, GovDecisionTransition,
                      Sensor, TelemetryReading, TelemetryRule, User)

# عوامل صريحة — ممنوع eval أو عبارات اعتباطية (§21)
_OPERATORS = {
    "GT": _op.gt, "GTE": _op.ge, "LT": _op.lt,
    "LTE": _op.le, "EQ": _op.eq, "NEQ": _op.ne,
}

# أولوية القرار ومخاطرته تُشتقان من شدة القاعدة بشكل حتمي
_SEVERITY_TO_PRIORITY = {"low": "low", "medium": "medium", "high": "high",
                         "critical": "critical"}


def validate_reading(sensor: Sensor, value: float | None,
                     observed_at: datetime) -> tuple[str, list[str]]:
    """تحقق حتمي من قراءة مقابل حدود المستشعر — يعيد (quality, errors)."""
    errors: list[str] = []
    if value is None:
        return "MISSING", errors
    if sensor.min_value is not None and value < float(sensor.min_value):
        errors.append("VALUE_BELOW_MIN")
    if sensor.max_value is not None and value > float(sensor.max_value):
        errors.append("VALUE_ABOVE_MAX")
    now = datetime.now(timezone.utc)
    obs = observed_at if observed_at.tzinfo else observed_at.replace(tzinfo=timezone.utc)
    if obs > now.replace(microsecond=0) and (obs - now).total_seconds() > 300:
        errors.append("TIMESTAMP_IN_FUTURE")
    if errors:
        return "INVALID", errors
    return "VALID", errors


def evaluate_rules(db: Session, org_id: int, readings: list[TelemetryReading],
                   actor: User) -> list[GovDecision]:
    """تقييم القواعد على قراءات — ينشئ اقتراحات PROPOSED فقط مع منع التكرار.

    منع التكرار حتمي: لا اقتراح جديد إن وُجد قرار غير مغلق بنفس
    (org, decision_type, subject_type, subject_id).
    """
    rules = db.execute(
        select(TelemetryRule).where(TelemetryRule.org_id == org_id,
                                    TelemetryRule.enabled.is_(True))
    ).scalars().all()
    if not rules:
        return []

    created: list[GovDecision] = []
    for reading in readings:
        if reading.quality not in ("VALID", "SUSPECT") or reading.value is None:
            continue
        value = float(reading.value)
        for rule in rules:
            if rule.metric != reading.metric or rule.unit != reading.unit:
                continue
            if not _OPERATORS[rule.operator](value, float(rule.threshold)):
                continue
            # dedup: قرار مفتوح قائم لنفس الموضوع والنوع؟
            existing = db.execute(
                select(GovDecision.id).where(
                    GovDecision.org_id == org_id,
                    GovDecision.decision_type == rule.decision_type,
                    GovDecision.subject_type == (reading.subject_type or ""),
                    GovDecision.subject_id == reading.subject_id,
                    GovDecision.status.notin_(["CANCELLED", "VERIFIED"]))
            ).first()
            if existing is not None:
                continue

            reason = (f"rule:{rule.name} — {reading.metric}={value}{reading.unit} "
                      f"{rule.operator} {float(rule.threshold)}{rule.unit} "
                      f"(telemetry#{reading.id})")
            d = GovDecision(
                org_id=org_id, domain=rule.domain, decision_type=rule.decision_type,
                title=f"[AUTO] {rule.name}", status="PROPOSED",
                priority=_SEVERITY_TO_PRIORITY[rule.severity],
                risk_level=rule.severity,
                subject_type=reading.subject_type, subject_id=reading.subject_id,
                source_type="telemetry_rule", source_id=str(rule.id),
                proposed_by=actor.id, reason=reason,
                expected_result=rule.configuration.get("expected_result"),
                meta={"rule_id": rule.id, "telemetry_id": reading.id,
                      "trigger_value": value, "threshold": float(rule.threshold),
                      "operator": rule.operator},
                is_demo=reading.is_demo,
            )
            db.add(d)
            db.flush()
            db.add(GovDecisionEvidence(
                decision_id=d.id, evidence_type="measurement",
                source_type="telemetry", source_id=str(reading.id),
                value=value, unit=reading.unit,
                observed_at=reading.observed_at, quality=reading.quality))
            db.add(GovDecisionTransition(
                decision_id=d.id, from_status="", to_status="PROPOSED",
                actor_id=actor.id, actor_role=actor.role,
                reason=f"auto-proposed by rule #{rule.id}"))
            audit(db, actor, "create", "gov_decision", entity_id=d.id,
                  meta={"domain": rule.domain, "decision_type": rule.decision_type,
                        "auto": True, "rule_id": rule.id,
                        "telemetry_id": reading.id})
            created.append(d)
    return created
