"""Seed DEMO data — all rows are synthetic and flagged is_demo=True.

Run:  python3 seed.py
Idempotent: every block checks existence (by a natural key) before inserting,
so running the script multiple times never duplicates rows.
Passwords below are for synthetic demo instances only. Never enable demo seeding on a real production dataset.
"""
from datetime import datetime, timedelta, timezone
import os

from sqlalchemy import select

from app.db import SessionLocal
from app.models import (VFD, Asset, Calibration, Certificate, Evidence,
                        Device, GovDecision, GovDecisionEvidence,
                        GovDecisionTransition, Sensor, TelemetryRule,
                        Inspection, Instrument, IrrigationZone, Measurement,
                        Organization, Project, Pump, Reservoir, Service,
                        ServiceRequest, Site, User, Valve, WaterAllocation,
                        WaterResource, Well)
from app.security import hash_password
from app.services.indicators import ensure_default_indicator
from app.services.catalog import ensure_service_catalog

DEMO_PASSWORD = os.environ.get("DEMO_PASSWORD", "demo-password-change-me")


def get_or_create(db, model_cls, defaults=None, **lookup):
    obj = db.execute(select(model_cls).filter_by(**lookup)).scalar_one_or_none()
    if obj is not None:
        return obj, False
    obj = model_cls(**lookup, **(defaults or {}))
    db.add(obj)
    db.flush()
    return obj, True
