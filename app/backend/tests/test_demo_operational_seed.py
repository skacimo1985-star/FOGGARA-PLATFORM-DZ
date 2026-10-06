"""Operational demo seed coverage and idempotency."""
import os

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import AgriObservation, AgriParcel, AgriPlan, AgriTask, Organization, SimulationRun
from app.operations_models import ValueListing, ValueMatch
from app.platform_models import DataRoom, Opportunity


def test_demo_seed_populates_operational_modules_and_is_idempotent(db, monkeypatch):
    monkeypatch.setenv("SEED_DEMO", "true")
    monkeypatch.setenv("ENV", "dev")

    import seed as seed_module
    seed_module.main()

    def snapshot():
        session = SessionLocal()
        try:
            org = session.scalar(select(Organization).where(Organization.code == "DEMO-ADRAR-ADE"))
            assert org is not None

            parcel = session.scalar(select(AgriParcel).where(
                AgriParcel.org_id == org.id,
                AgriParcel.name == "قطعة نخيل أولف A-01 (تجريبي)",
            ))
            assert parcel is not None
            assert parcel.site_id is not None
            assert parcel.lat is not None and parcel.lon is not None

            observations = session.scalar(select(func.count()).select_from(AgriObservation).where(
                AgriObservation.org_id == org.id,
                AgriObservation.parcel_id == parcel.id,
            ))
            assert observations >= 4
            assert session.scalar(select(func.count()).select_from(AgriPlan).where(
                AgriPlan.org_id == org.id, AgriPlan.parcel_id == parcel.id)) >= 1
            assert session.scalar(select(func.count()).select_from(AgriTask).where(
                AgriTask.org_id == org.id, AgriTask.parcel_id == parcel.id)) >= 1

            room = session.scalar(select(DataRoom).where(
                DataRoom.org_id == org.id,
                DataRoom.title == "Data Room — فڨارة أولف الشرقية (تجريبي)",
            ))
            assert room is not None
            assert room.project_id is not None
            assert room.discoverable is True
            assert room.status == "open"

            published = session.scalars(select(Opportunity).where(
                Opportunity.published.is_(True),
                Opportunity.status == "open",
            )).all()
            assert len(published) >= 2
            assert all(row.consent_at is not None and row.consent_version for row in published)

            listings = session.scalars(select(ValueListing).where(
                ValueListing.org_id == org.id,
                ValueListing.product_code == "demo.drip-irrigation-kit",
            )).all()
            assert {row.kind for row in listings} == {"offer", "demand"}
            assert session.scalar(select(func.count()).select_from(ValueMatch).where(
                ValueMatch.org_id == org.id,
                ValueMatch.status == "suggested",
            )) >= 1

            run = session.scalar(select(SimulationRun).where(
                SimulationRun.org_id == org.id,
                SimulationRun.scenario == "LOW_WATER",
                SimulationRun.seed == 2601001,
            ))
            assert run is not None
            assert run.status == "CREATED"
            assert run.device_id is not None

            models = (AgriParcel, AgriObservation, AgriPlan, AgriTask,
                      SimulationRun, DataRoom, Opportunity, ValueListing, ValueMatch)
            return {
                model.__tablename__: session.scalar(select(func.count()).select_from(model))
                for model in models
            }
        finally:
            session.close()

    first = snapshot()
    seed_module.main()
    second = snapshot()
    assert second == first
