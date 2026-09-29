"""Metrology rules: calibration validity gating for instrument measurements.

Rule (auditable, no hidden heuristics):
  A measurement taken by an instrument may be *submitted* freely, but it can
  only be *validated* (review decision = accepted) if the instrument has a
  calibration whose result is "pass" and whose validity window covers the
  review time (calibrated_on <= now <= next_due).
"""
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Calibration, Certificate


def instrument_has_valid_calibration(db: Session, instrument_id: int,
                                     at: datetime | None = None) -> bool:
    at = at or datetime.now(timezone.utc)
    q = select(Calibration.id).where(
        Calibration.instrument_id == instrument_id,
        Calibration.result == "pass",
        Calibration.calibrated_on <= at,
        Calibration.next_due >= at,
    )
    return db.execute(q.limit(1)).first() is not None


def instrument_has_active_certificate(db: Session, instrument_id: int,
                                      at: datetime | None = None) -> bool:
    at = at or datetime.now(timezone.utc)
    q = select(Certificate.id).where(
        Certificate.instrument_id == instrument_id,
        Certificate.status == "active",
        Certificate.valid_from <= at,
        Certificate.valid_to >= at,
    )
    return db.execute(q.limit(1)).first() is not None
