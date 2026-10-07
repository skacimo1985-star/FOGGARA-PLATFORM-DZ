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
                        WaterResource, Well, AgriParcel, AgriObservation,
                        AgriPlan, AgriTask)
from app.security import hash_password
from app.services.indicators import ensure_default_indicator
from app.services.catalog import ensure_service_catalog
from app.services.agriculture_operations import irrigation_scenario

def get_or_create(db, model_cls, defaults=None, **lookup):
    obj = db.execute(select(model_cls).filter_by(**lookup)).scalar_one_or_none()
    if obj is not None:
        return obj, False
    obj = model_cls(**lookup, **(defaults or {}))
    db.add(obj)
    db.flush()
    return obj, True


def seed_agriculture_workspace(db, created, *, org, user, site, code, wilaya_ar, crop):
    """Create deterministic, explicitly synthetic agriculture demo records."""
    area_ha = round(1.5 + (int(code) % 6) * 0.5, 2)
    coords = {}
    if site.lat is not None and site.lon is not None:
        coords = {"lat": float(site.lat), "lon": float(site.lon)}

    parcel, made = get_or_create(
        db, AgriParcel,
        org_id=org.id,
        name=f"قطعة زراعية تجريبية — {wilaya_ar}",
        defaults=dict(
            crop=crop,
            area_ha=area_ha,
            location=wilaya_ar,
            site_id=site.id,
            stage="development",
            created_by=user.id,
            is_demo=True,
            **coords,
        ),
    )
    created["agri_parcels"] += made

    observed_at = datetime(2026, 9, 30, 10, 0, tzinfo=timezone.utc)
    code_num = int(code)
    observations = (
        ("ndvi", round(0.38 + (code_num % 10) * 0.025, 3), "index"),
        ("lswi", round(-0.05 + (code_num % 8) * 0.025, 3), "index"),
        ("moisture", round(24 + (code_num % 12) * 2.5, 2), "% VWC"),
    )
    for metric, value, unit in observations:
        source_ref = f"SYNTHETIC-DEMO-{metric.upper()}-WILAYA-{code}"
        _, made = get_or_create(
            db, AgriObservation,
            org_id=org.id,
            parcel_id=parcel.id,
            metric=metric,
            source_ref=source_ref,
            defaults=dict(
                value=value,
                unit=unit,
                source_type="satellite",
                observed_at=observed_at,
                evidence_status="INFERRED",
                created_by=user.id,
                is_demo=True,
            ),
        )
        created["agri_observations"] += made

    plan = db.scalar(select(AgriPlan).where(
        AgriPlan.org_id == org.id,
        AgriPlan.parcel_id == parcel.id,
        AgriPlan.is_demo == True,
    ))
    if plan is None:
        inputs = dict(
            parcel_id=parcel.id,
            eto_mm_day=6.0,
            kc=0.85,
            effective_rain_mm=2.0,
            efficiency=0.80,
            days=7,
            input_source=f"SYNTHETIC-DEMO-WILAYA-{code}",
            area_ha=area_ha,
        )
        plan = AgriPlan(
            org_id=org.id,
            parcel_id=parcel.id,
            inputs=inputs,
            result=irrigation_scenario(area_ha, 6.0, 0.85, 2.0, 0.80, 7),
            created_by=user.id,
            is_demo=True,
        )
        db.add(plan)
        db.flush()
        created["agri_plans"] += 1

    _, made = get_or_create(
        db, AgriTask,
        org_id=org.id,
        parcel_id=parcel.id,
        title=f"مراجعة خطة الري التجريبية — {wilaya_ar}",
        defaults=dict(
            due_date="2026-10-13",
            completed=False,
            created_by=user.id,
            is_demo=True,
        ),
    )
    created["agri_tasks"] += made

    return parcel


TRUTHY = {"1", "true", "yes"}


def _env_flag(name: str, default: str = "false") -> bool:
    return os.environ.get(name, default).strip().lower() in TRUTHY


def _require_demo_password() -> str:
    """Read the demo-only credential from the environment without logging it."""
    value = os.environ.get("DEMO_PASSWORD", "")
    if not value:
        raise RuntimeError("SEED_DEMO=true requires DEMO_PASSWORD to be set")
    if not 15 <= len(value) <= 128:
        raise RuntimeError("DEMO_PASSWORD must be between 15 and 128 characters")
    return value


def _seed_demo_enabled() -> bool:
    """Allow demo data in prod only on an explicitly isolated demo/expo instance."""
    seed_demo = _env_flag("SEED_DEMO")
    if os.environ.get("ENV", "dev") == "prod" and seed_demo and not _env_flag("DEMO_INSTANCE"):
        raise RuntimeError(
            "SEED_DEMO=true in ENV=prod requires DEMO_INSTANCE=true on an isolated demo/expo instance"
        )
    return seed_demo


def main():
    # Real production remains demo-free by default. A deliberately isolated
    # expo/demo deployment may opt in with both SEED_DEMO=true and
    # DEMO_INSTANCE=true. The authored indicator/service catalog is ensured
    # even when synthetic business data is disabled.
    seed_demo = _seed_demo_enabled()
    demo_password = _require_demo_password() if seed_demo else None
    demo_password_hash = hash_password(demo_password) if demo_password is not None else None
    db = SessionLocal()
    created = {"orgs": 0, "users": 0, "sites": 0, "resources": 0, "assets": 0,
               "projects": 0, "measurements": 0, "evidences": 0, "instruments": 0,
               "calibrations": 0, "certificates": 0, "inspections": 0,
               "services": 0, "service_requests": 0, "water": 0, "decisions": 0, "iot": 0,
               "agri_parcels": 0, "agri_observations": 0, "agri_plans": 0, "agri_tasks": 0}
    try:
        created["services"] += ensure_service_catalog(db)
        if not seed_demo:
            ensure_default_indicator(db)
            db.commit()
            print("SEED_DEMO=false — no demo data inserted (indicator and authored service catalog ensured).")
            return
        # ---- Organizations ----
        org1, c = get_or_create(db, Organization, code="DEMO-ADRAR-ADE", defaults=dict(
            name_ar="مديرية الموارد المائية — أدرار (تجريبي)",
            name_fr="Direction des ressources en eau — Adrar (démo)",
            name_en="Water Resources Directorate — Adrar (demo)", is_demo=True))
        created["orgs"] += c
        org2, c = get_or_create(db, Organization, code="DEMO-TND-AGRI", defaults=dict(
            name_ar="مديرية المصالح الفلاحية — تندوف (تجريبي)",
            name_fr="Direction des services agricoles — Tindouf (démo)",
            name_en="Agricultural Services Directorate — Tindouf (demo)", is_demo=True))
        created["orgs"] += c

        # ---- Users ----
        member1, c = get_or_create(db, User, email="member@demo1.dz", defaults=dict(
            org_id=org1.id, password_hash=demo_password_hash,
            full_name="مستخدم تجريبي — عضو 1", role="member"))
        created["users"] += c
        reviewer1, c = get_or_create(db, User, email="reviewer@demo1.dz", defaults=dict(
            org_id=org1.id, password_hash=demo_password_hash,
            full_name="مراجع تجريبي 1", role="reviewer"))
        created["users"] += c
        admin1, c = get_or_create(db, User, email="admin@demo1.dz", defaults=dict(
            org_id=org1.id, password_hash=demo_password_hash,
            full_name="مشرف تجريبي 1", role="admin"))
        created["users"] += c
        member2, c = get_or_create(db, User, email="member@demo2.dz", defaults=dict(
            org_id=org2.id, password_hash=demo_password_hash,
            full_name="مستخدم تجريبي — عضو 2", role="member"))
        created["users"] += c
        _, c = get_or_create(db, User, email="reviewer@demo2.dz", defaults=dict(
            org_id=org2.id, password_hash=demo_password_hash,
            full_name="مراجع تجريبي 2", role="reviewer"))
        created["users"] += c

        # ---- Sites / resources / assets / project ----
        site1, c = get_or_create(db, Site, org_id=org1.id, name="واحة أولف — أدرار (تجريبي)",
                                 defaults=dict(wilaya="أدرار", commune="أولف",
                                               lat=27.90, lon=-0.29, is_demo=True))
        created["sites"] += c
        site2, c = get_or_create(db, Site, org_id=org2.id, name="منطقة أم العسل — تندوف (تجريبي)",
                                 defaults=dict(wilaya="تندوف", commune="أم العسل",
                                               lat=27.67, lon=-8.15, is_demo=True))
        created["sites"] += c

        seed_agriculture_workspace(
            db, created, org=org1, user=member1, site=site1,
            code="01", wilaya_ar="أدرار", crop="date_palm",
        )
        seed_agriculture_workspace(
            db, created, org=org2, user=member2, site=site2,
            code="37", wilaya_ar="تندوف", crop="wheat",
        )

        # ---- Additional wilayas (national coverage expansion) ----
        # 67 wilayas beyond Adrar(01) and Tindouf(37), covering codes 01–69.
        # Existing demo classifications are synthetic. New 2026 wilayas use generic borehole demo resources until field data is verified.
        # Each wilaya receives 1 organization, 1 member user, 1 site,
        # 1 water resource, and 1 project — all flagged is_demo=True.
        extra_wilayas = [
            dict(code="02", wilaya_ar="الشلف", wilaya_fr="Chlef", wilaya_en="Chlef",
                 lat=36.16, lon=1.33, commune_ar="تنس",
                 org_code="DEMO-CHLEF-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر تنس 1 (تجريبي)",
                 site_name="منطقة تنس — الشلف (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — الشلف (تجريبي)"),
            dict(code="03", wilaya_ar="الأغواط", wilaya_fr="Laghouat", wilaya_en="Laghouat",
                 lat=33.8, lon=2.87, commune_ar="تاجموت",
                 org_code="DEMO-LAGHO-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة تاجموت 1 (تجريبي)",
                 site_name="واحة تاجموت — الأغواط (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — الأغواط (تجريبي)"),
            dict(code="04", wilaya_ar="أم البواقي", wilaya_fr="Oum El Bouaghi", wilaya_en="Oum El Bouaghi",
                 lat=35.88, lon=7.11, commune_ar="عين البيضاء",
                 org_code="DEMO-OUMEL-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر عين البيضاء 1 (تجريبي)",
                 site_name="منطقة عين البيضاء — أم البواقي (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — أم البواقي (تجريبي)"),
            dict(code="05", wilaya_ar="باتنة", wilaya_fr="Batna", wilaya_en="Batna",
                 lat=35.55, lon=6.17, commune_ar="مروانة",
                 org_code="DEMO-BATNA-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر مروانة 1 (تجريبي)",
                 site_name="منطقة مروانة — باتنة (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — باتنة (تجريبي)"),
            dict(code="06", wilaya_ar="بجاية", wilaya_fr="Bejaia", wilaya_en="Bejaia",
                 lat=36.75, lon=5.08, commune_ar="أقبو",
                 org_code="DEMO-BEJAI-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر أقبو 1 (تجريبي)",
                 site_name="منطقة أقبو — بجاية (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — بجاية (تجريبي)"),
            dict(code="07", wilaya_ar="بسكرة", wilaya_fr="Biskra", wilaya_en="Biskra",
                 lat=34.85, lon=5.73, commune_ar="سيدي عقبة",
                 org_code="DEMO-BISKR-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة سيدي عقبة 1 (تجريبي)",
                 site_name="واحة سيدي عقبة — بسكرة (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — بسكرة (تجريبي)"),
            dict(code="08", wilaya_ar="بشار", wilaya_fr="Bechar", wilaya_en="Bechar",
                 lat=31.62, lon=-2.22, commune_ar="بشار",
                 org_code="DEMO-BECHA-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة بشار 1 (تجريبي)",
                 site_name="واحة بشار — بشار (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — بشار (تجريبي)"),
            dict(code="09", wilaya_ar="البليدة", wilaya_fr="Blida", wilaya_en="Blida",
                 lat=36.47, lon=2.83, commune_ar="بوفاريك",
                 org_code="DEMO-BLIDA-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر بوفاريك 1 (تجريبي)",
                 site_name="منطقة بوفاريك — البليدة (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — البليدة (تجريبي)"),
            dict(code="10", wilaya_ar="البويرة", wilaya_fr="Bouira", wilaya_en="Bouira",
                 lat=36.37, lon=3.9, commune_ar="سور الغزلان",
                 org_code="DEMO-BOUIR-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر سور الغزلان 1 (تجريبي)",
                 site_name="منطقة سور الغزلان — البويرة (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — البويرة (تجريبي)"),
            dict(code="11", wilaya_ar="تمنراست", wilaya_fr="Tamanrasset", wilaya_en="Tamanrasset",
                 lat=22.79, lon=5.47, commune_ar="تمنراست",
                 org_code="DEMO-TAMAN-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة تمنراست 1 (تجريبي)",
                 site_name="واحة تمنراست — تمنراست (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — تمنراست (تجريبي)"),
            dict(code="12", wilaya_ar="تبسة", wilaya_fr="Tebessa", wilaya_en="Tebessa",
                 lat=35.4, lon=8.12, commune_ar="الشريعة",
                 org_code="DEMO-TEBES-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر الشريعة 1 (تجريبي)",
                 site_name="منطقة الشريعة — تبسة (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — تبسة (تجريبي)"),
            dict(code="13", wilaya_ar="تلمسان", wilaya_fr="Tlemcen", wilaya_en="Tlemcen",
                 lat=34.88, lon=-1.32, commune_ar="ندرومة",
                 org_code="DEMO-TLEMC-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر ندرومة 1 (تجريبي)",
                 site_name="منطقة ندرومة — تلمسان (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — تلمسان (تجريبي)"),
            dict(code="14", wilaya_ar="تيارت", wilaya_fr="Tiaret", wilaya_en="Tiaret",
                 lat=35.37, lon=1.32, commune_ar="تخمارت",
                 org_code="DEMO-TIARE-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر تخمارت 1 (تجريبي)",
                 site_name="منطقة تخمارت — تيارت (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — تيارت (تجريبي)"),
            dict(code="15", wilaya_ar="تيزي وزو", wilaya_fr="Tizi Ouzou", wilaya_en="Tizi Ouzou",
                 lat=36.72, lon=4.05, commune_ar="ذراع بن خدة",
                 org_code="DEMO-TIZIO-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر ذراع بن خدة 1 (تجريبي)",
                 site_name="منطقة ذراع بن خدة — تيزي وزو (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — تيزي وزو (تجريبي)"),
            dict(code="16", wilaya_ar="الجزائر", wilaya_fr="Alger", wilaya_en="Alger",
                 lat=36.75, lon=3.06, commune_ar="الحراش",
                 org_code="DEMO-ALGER-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر الحراش 1 (تجريبي)",
                 site_name="منطقة الحراش — الجزائر (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — الجزائر (تجريبي)"),
            dict(code="17", wilaya_ar="الجلفة", wilaya_fr="Djelfa", wilaya_en="Djelfa",
                 lat=34.67, lon=3.25, commune_ar="حاسي بحبح",
                 org_code="DEMO-DJELF-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة حاسي بحبح 1 (تجريبي)",
                 site_name="واحة حاسي بحبح — الجلفة (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — الجلفة (تجريبي)"),
            dict(code="18", wilaya_ar="جيجل", wilaya_fr="Jijel", wilaya_en="Jijel",
                 lat=36.62, lon=5.77, commune_ar="الميلية",
                 org_code="DEMO-JIJEL-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر الميلية 1 (تجريبي)",
                 site_name="منطقة الميلية — جيجل (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — جيجل (تجريبي)"),
            dict(code="19", wilaya_ar="سطيف", wilaya_fr="Setif", wilaya_en="Setif",
                 lat=36.19, lon=5.41, commune_ar="العلمة",
                 org_code="DEMO-SETIF-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر العلمة 1 (تجريبي)",
                 site_name="منطقة العلمة — سطيف (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — سطيف (تجريبي)"),
            dict(code="20", wilaya_ar="سعيدة", wilaya_fr="Saida", wilaya_en="Saida",
                 lat=34.83, lon=0.15, commune_ar="سيدي بوبكر",
                 org_code="DEMO-SAIDA-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر سيدي بوبكر 1 (تجريبي)",
                 site_name="منطقة سيدي بوبكر — سعيدة (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — سعيدة (تجريبي)"),
            dict(code="21", wilaya_ar="سكيكدة", wilaya_fr="Skikda", wilaya_en="Skikda",
                 lat=36.88, lon=6.9, commune_ar="تمالوس",
                 org_code="DEMO-SKIKD-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر تمالوس 1 (تجريبي)",
                 site_name="منطقة تمالوس — سكيكدة (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — سكيكدة (تجريبي)"),
            dict(code="22", wilaya_ar="سيدي بلعباس", wilaya_fr="Sidi Bel Abbes", wilaya_en="Sidi Bel Abbes",
                 lat=35.19, lon=-0.63, commune_ar="بن باديس",
                 org_code="DEMO-SIDIB-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر بن باديس 1 (تجريبي)",
                 site_name="منطقة بن باديس — سيدي بلعباس (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — سيدي بلعباس (تجريبي)"),
            dict(code="23", wilaya_ar="عنابة", wilaya_fr="Annaba", wilaya_en="Annaba",
                 lat=36.9, lon=7.77, commune_ar="البوني",
                 org_code="DEMO-ANNAB-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر البوني 1 (تجريبي)",
                 site_name="منطقة البوني — عنابة (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — عنابة (تجريبي)"),
            dict(code="24", wilaya_ar="قالمة", wilaya_fr="Guelma", wilaya_en="Guelma",
                 lat=36.46, lon=7.43, commune_ar="وادي الزناتي",
                 org_code="DEMO-GUELM-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر وادي الزناتي 1 (تجريبي)",
                 site_name="منطقة وادي الزناتي — قالمة (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — قالمة (تجريبي)"),
            dict(code="25", wilaya_ar="قسنطينة", wilaya_fr="Constantine", wilaya_en="Constantine",
                 lat=36.36, lon=6.61, commune_ar="الخروب",
                 org_code="DEMO-CONST-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر الخروب 1 (تجريبي)",
                 site_name="منطقة الخروب — قسنطينة (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — قسنطينة (تجريبي)"),
            dict(code="26", wilaya_ar="المدية", wilaya_fr="Medea", wilaya_en="Medea",
                 lat=36.27, lon=2.75, commune_ar="تابلاط",
                 org_code="DEMO-MEDEA-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر تابلاط 1 (تجريبي)",
                 site_name="منطقة تابلاط — المدية (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — المدية (تجريبي)"),
            dict(code="27", wilaya_ar="مستغانم", wilaya_fr="Mostaganem", wilaya_en="Mostaganem",
                 lat=35.93, lon=0.09, commune_ar="عشعاشة",
                 org_code="DEMO-MOSTA-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر عشعاشة 1 (تجريبي)",
                 site_name="منطقة عشعاشة — مستغانم (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — مستغانم (تجريبي)"),
            dict(code="28", wilaya_ar="المسيلة", wilaya_fr="Msila", wilaya_en="Msila",
                 lat=35.71, lon=4.54, commune_ar="سيدي عيسى",
                 org_code="DEMO-MSILA-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة سيدي عيسى 1 (تجريبي)",
                 site_name="واحة سيدي عيسى — المسيلة (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — المسيلة (تجريبي)"),
            dict(code="29", wilaya_ar="معسكر", wilaya_fr="Mascara", wilaya_en="Mascara",
                 lat=35.4, lon=0.14, commune_ar="حسيين",
                 org_code="DEMO-MASCA-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر حسيين 1 (تجريبي)",
                 site_name="منطقة حسيين — معسكر (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — معسكر (تجريبي)"),
            dict(code="30", wilaya_ar="ورقلة", wilaya_fr="Ouargla", wilaya_en="Ouargla",
                 lat=31.95, lon=5.33, commune_ar="ورقلة",
                 org_code="DEMO-OUARG-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة ورقلة 1 (تجريبي)",
                 site_name="واحة ورقلة — ورقلة (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — ورقلة (تجريبي)"),
            dict(code="31", wilaya_ar="وهران", wilaya_fr="Oran", wilaya_en="Oran",
                 lat=35.69, lon=-0.64, commune_ar="السانية",
                 org_code="DEMO-ORAN-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر السانية 1 (تجريبي)",
                 site_name="منطقة السانية — وهران (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — وهران (تجريبي)"),
            dict(code="32", wilaya_ar="البيض", wilaya_fr="El Bayadh", wilaya_en="El Bayadh",
                 lat=33.68, lon=1.0, commune_ar="بريزينة",
                 org_code="DEMO-ELBAY-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة بريزينة 1 (تجريبي)",
                 site_name="واحة بريزينة — البيض (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — البيض (تجريبي)"),
            dict(code="33", wilaya_ar="إليزي", wilaya_fr="Illizi", wilaya_en="Illizi",
                 lat=26.5, lon=8.42, commune_ar="جانت",
                 org_code="DEMO-ILLIZ-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة جانت 1 (تجريبي)",
                 site_name="واحة جانت — إليزي (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — إليزي (تجريبي)"),
            dict(code="34", wilaya_ar="برج بوعريريج", wilaya_fr="Bordj Bou Arreridj", wilaya_en="Bordj Bou Arreridj",
                 lat=36.07, lon=4.75, commune_ar="الرابيطة",
                 org_code="DEMO-BORDJ-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر الرابيطة 1 (تجريبي)",
                 site_name="منطقة الرابيطة — برج بوعريريج (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — برج بوعريريج (تجريبي)"),
            dict(code="35", wilaya_ar="بومرداس", wilaya_fr="Boumerdes", wilaya_en="Boumerdes",
                 lat=36.76, lon=3.48, commune_ar="خميس الخميسة",
                 org_code="DEMO-BOUME-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر خميس الخميسة 1 (تجريبي)",
                 site_name="منطقة خميس الخميسة — بومرداس (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — بومرداس (تجريبي)"),
            dict(code="36", wilaya_ar="الطارف", wilaya_fr="El Tarf", wilaya_en="El Tarf",
                 lat=36.78, lon=8.31, commune_ar="القالة",
                 org_code="DEMO-ELTAR-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر القالة 1 (تجريبي)",
                 site_name="منطقة القالة — الطارف (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — الطارف (تجريبي)"),
            dict(code="38", wilaya_ar="تيسمسيلت", wilaya_fr="Tissemsilt", wilaya_en="Tissemsilt",
                 lat=35.31, lon=1.83, commune_ar="برج بومعراس",
                 org_code="DEMO-TISSE-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر برج بومعراس 1 (تجريبي)",
                 site_name="منطقة برج بومعراس — تيسمسيلت (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — تيسمسيلت (تجريبي)"),
            dict(code="39", wilaya_ar="الوادي", wilaya_fr="El Oued", wilaya_en="El Oued",
                 lat=33.5, lon=6.78, commune_ar="الوادي",
                 org_code="DEMO-ELOUE-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة الوادي 1 (تجريبي)",
                 site_name="واحة الوادي — الوادي (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — الوادي (تجريبي)"),
            dict(code="40", wilaya_ar="خنشلة", wilaya_fr="Khenchela", wilaya_en="Khenchela",
                 lat=35.43, lon=7.14, commune_ar="بابار",
                 org_code="DEMO-KHENC-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر بابار 1 (تجريبي)",
                 site_name="منطقة بابار — خنشلة (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — خنشلة (تجريبي)"),
            dict(code="41", wilaya_ar="سوق أهراس", wilaya_fr="Souk Ahras", wilaya_en="Souk Ahras",
                 lat=36.28, lon=7.95, commune_ar="مداوروش",
                 org_code="DEMO-SOUKA-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر مداوروش 1 (تجريبي)",
                 site_name="منطقة مداوروش — سوق أهراس (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — سوق أهراس (تجريبي)"),
            dict(code="42", wilaya_ar="تيبازة", wilaya_fr="Tipaza", wilaya_en="Tipaza",
                 lat=36.59, lon=2.42, commune_ar="شرشال",
                 org_code="DEMO-TIPAZ-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر شرشال 1 (تجريبي)",
                 site_name="منطقة شرشال — تيبازة (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — تيبازة (تجريبي)"),
            dict(code="43", wilaya_ar="ميلة", wilaya_fr="Mila", wilaya_en="Mila",
                 lat=36.45, lon=6.27, commune_ar="فرجيوة",
                 org_code="DEMO-MILA-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر فرجيوة 1 (تجريبي)",
                 site_name="منطقة فرجيوة — ميلة (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — ميلة (تجريبي)"),
            dict(code="44", wilaya_ar="عين الدفلى", wilaya_fr="Ain Defla", wilaya_en="Ain Defla",
                 lat=36.26, lon=1.97, commune_ar="العبادية",
                 org_code="DEMO-AINDE-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر العبادية 1 (تجريبي)",
                 site_name="منطقة العبادية — عين الدفلى (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — عين الدفلى (تجريبي)"),
            dict(code="45", wilaya_ar="النعامة", wilaya_fr="Naama", wilaya_en="Naama",
                 lat=33.27, lon=-0.31, commune_ar="النعامة",
                 org_code="DEMO-NAAMA-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة النعامة 1 (تجريبي)",
                 site_name="واحة النعامة — النعامة (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — النعامة (تجريبي)"),
            dict(code="46", wilaya_ar="عين تموشنت", wilaya_fr="Ain Temouchent", wilaya_en="Ain Temouchent",
                 lat=35.3, lon=-1.14, commune_ar="حمام بوحجر",
                 org_code="DEMO-AINTE-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر حمام بوحجر 1 (تجريبي)",
                 site_name="منطقة حمام بوحجر — عين تموشنت (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — عين تموشنت (تجريبي)"),
            dict(code="47", wilaya_ar="غرداية", wilaya_fr="Ghardaia", wilaya_en="Ghardaia",
                 lat=32.49, lon=3.67, commune_ar="غرداية",
                 org_code="DEMO-GHARD-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة غرداية 1 (تجريبي)",
                 site_name="واحة غرداية — غرداية (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — غرداية (تجريبي)"),
            dict(code="48", wilaya_ar="غليزان", wilaya_fr="Relizane", wilaya_en="Relizane",
                 lat=35.74, lon=0.56, commune_ar="عمي موسى",
                 org_code="DEMO-RELIZ-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="بئر عمي موسى 1 (تجريبي)",
                 site_name="منطقة عمي موسى — غليزان (تجريبي)",
                 project_domain="food",
                 project_title="مشروع تنمية فلاحية — غليزان (تجريبي)"),
            dict(code="49", wilaya_ar="تيميمون", wilaya_fr="Timimoun", wilaya_en="Timimoun",
                 lat=29.26, lon=0.24, commune_ar="تيميمون",
                 org_code="DEMO-TIMIM-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة تيميمون 1 (تجريبي)",
                 site_name="واحة تيميمون — تيميمون (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — تيميمون (تجريبي)"),
            dict(code="50", wilaya_ar="برج باجي مختار", wilaya_fr="Bordj Badji Mokhtar", wilaya_en="Bordj Badji Mokhtar",
                 lat=19.55, lon=4.47, commune_ar="برج باجي مختار",
                 org_code="DEMO-BORDJ-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة برج باجي مختار 1 (تجريبي)",
                 site_name="واحة برج باجي مختار — برج باجي مختار (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — برج باجي مختار (تجريبي)"),
            dict(code="51", wilaya_ar="أولاد جلال", wilaya_fr="Ouled Djellal", wilaya_en="Ouled Djellal",
                 lat=34.68, lon=5.07, commune_ar="أولاد جلال",
                 org_code="DEMO-OULED-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة أولاد جلال 1 (تجريبي)",
                 site_name="واحة أولاد جلال — أولاد جلال (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — أولاد جلال (تجريبي)"),
            dict(code="52", wilaya_ar="بني عباس", wilaya_fr="Beni Abbes", wilaya_en="Beni Abbes",
                 lat=30.13, lon=-2.2, commune_ar="بني عباس",
                 org_code="DEMO-BENIA-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة بني عباس 1 (تجريبي)",
                 site_name="واحة بني عباس — بني عباس (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — بني عباس (تجريبي)"),
            dict(code="53", wilaya_ar="إن صالح", wilaya_fr="In Salah", wilaya_en="In Salah",
                 lat=27.19, lon=2.47, commune_ar="إن صالح",
                 org_code="DEMO-INSAL-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة إن صالح 1 (تجريبي)",
                 site_name="واحة إن صالح — إن صالح (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — إن صالح (تجريبي)"),
            dict(code="54", wilaya_ar="إن قزام", wilaya_fr="In Guezzam", wilaya_en="In Guezzam",
                 lat=19.58, lon=5.73, commune_ar="إن قزام",
                 org_code="DEMO-INGUE-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة إن قزام 1 (تجريبي)",
                 site_name="واحة إن قزام — إن قزام (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — إن قزام (تجريبي)"),
            dict(code="55", wilaya_ar="تقرت", wilaya_fr="Touggourt", wilaya_en="Touggourt",
                 lat=33.11, lon=6.7, commune_ar="تقرت",
                 org_code="DEMO-TOUGG-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة تقرت 1 (تجريبي)",
                 site_name="واحة تقرت — تقرت (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — تقرت (تجريبي)"),
            dict(code="56", wilaya_ar="جانت", wilaya_fr="Djanet", wilaya_en="Djanet",
                 lat=24.55, lon=9.46, commune_ar="جانت",
                 org_code="DEMO-DJANE-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة جانت 1 (تجريبي)",
                 site_name="واحة جانت — جانت (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — جانت (تجريبي)"),
            dict(code="57", wilaya_ar="المغير", wilaya_fr="El Mghair", wilaya_en="El Mghair",
                 lat=33.14, lon=6.28, commune_ar="المغير",
                 org_code="DEMO-ELMGH-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة المغير 1 (تجريبي)",
                 site_name="واحة المغير — المغير (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — المغير (تجريبي)"),
            dict(code="58", wilaya_ar="المنيعة", wilaya_fr="El Meniaa", wilaya_en="El Meniaa",
                 lat=30.58, lon=2.89, commune_ar="المنيعة",
                 org_code="DEMO-ELMEN-ADE", org_kind="water",
                 resource_type="foggara", resource_status="degraded",
                 resource_name="فڨارة المنيعة 1 (تجريبي)",
                 site_name="واحة المنيعة — المنيعة (تجريبي)",
                 project_domain="water",
                 project_title="إعادة تأهيل فڨارة — المنيعة (تجريبي)"),
            dict(code="59", wilaya_ar="أفلو", wilaya_fr="Aflou", wilaya_en="Aflou",
                 lat=None, lon=None, commune_ar="أفلو",
                 org_code="DEMO-AFLOU-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="مورد مائي أفلو 1 (تجريبي)",
                 site_name="موقع أفلو الوطني (تجريبي)",
                 project_domain="food",
                 project_title="مشروع موارد وإنتاج — أفلو (تجريبي)"),
            dict(code="60", wilaya_ar="بريكة", wilaya_fr="Barika", wilaya_en="Barika",
                 lat=None, lon=None, commune_ar="بريكة",
                 org_code="DEMO-BARIK-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="مورد مائي بريكة 1 (تجريبي)",
                 site_name="موقع بريكة الوطني (تجريبي)",
                 project_domain="food",
                 project_title="مشروع موارد وإنتاج — بريكة (تجريبي)"),
            dict(code="61", wilaya_ar="القنطرة", wilaya_fr="El Kantara", wilaya_en="El Kantara",
                 lat=None, lon=None, commune_ar="القنطرة",
                 org_code="DEMO-KANTA-ADE", org_kind="water",
                 resource_type="borehole", resource_status="active",
                 resource_name="مورد مائي القنطرة 1 (تجريبي)",
                 site_name="موقع القنطرة الوطني (تجريبي)",
                 project_domain="water",
                 project_title="مشروع موارد مائية — القنطرة (تجريبي)"),
            dict(code="62", wilaya_ar="بئر العاتر", wilaya_fr="Bir El Ater", wilaya_en="Bir El Ater",
                 lat=None, lon=None, commune_ar="بئر العاتر",
                 org_code="DEMO-BIRAT-ADE", org_kind="water",
                 resource_type="borehole", resource_status="active",
                 resource_name="مورد مائي بئر العاتر 1 (تجريبي)",
                 site_name="موقع بئر العاتر الوطني (تجريبي)",
                 project_domain="water",
                 project_title="مشروع موارد مائية — بئر العاتر (تجريبي)"),
            dict(code="63", wilaya_ar="العريشة", wilaya_fr="El Aricha", wilaya_en="El Aricha",
                 lat=None, lon=None, commune_ar="العريشة",
                 org_code="DEMO-ARICH-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="مورد مائي العريشة 1 (تجريبي)",
                 site_name="موقع العريشة الوطني (تجريبي)",
                 project_domain="food",
                 project_title="مشروع موارد وإنتاج — العريشة (تجريبي)"),
            dict(code="64", wilaya_ar="قصر الشلالة", wilaya_fr="Ksar Chellala", wilaya_en="Ksar Chellala",
                 lat=None, lon=None, commune_ar="قصر الشلالة",
                 org_code="DEMO-KCHEL-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="مورد مائي قصر الشلالة 1 (تجريبي)",
                 site_name="موقع قصر الشلالة الوطني (تجريبي)",
                 project_domain="food",
                 project_title="مشروع موارد وإنتاج — قصر الشلالة (تجريبي)"),
            dict(code="65", wilaya_ar="عين وسارة", wilaya_fr="Aïn Ouessara", wilaya_en="Aïn Ouessara",
                 lat=None, lon=None, commune_ar="عين وسارة",
                 org_code="DEMO-AOUSS-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="مورد مائي عين وسارة 1 (تجريبي)",
                 site_name="موقع عين وسارة الوطني (تجريبي)",
                 project_domain="food",
                 project_title="مشروع موارد وإنتاج — عين وسارة (تجريبي)"),
            dict(code="66", wilaya_ar="مسعد", wilaya_fr="Messaad", wilaya_en="Messaad",
                 lat=None, lon=None, commune_ar="مسعد",
                 org_code="DEMO-MESSA-ADE", org_kind="water",
                 resource_type="borehole", resource_status="active",
                 resource_name="مورد مائي مسعد 1 (تجريبي)",
                 site_name="موقع مسعد الوطني (تجريبي)",
                 project_domain="water",
                 project_title="مشروع موارد مائية — مسعد (تجريبي)"),
            dict(code="67", wilaya_ar="قصر البخاري", wilaya_fr="Ksar El Boukhari", wilaya_en="Ksar El Boukhari",
                 lat=None, lon=None, commune_ar="قصر البخاري",
                 org_code="DEMO-KBOUK-AGRI", org_kind="agri",
                 resource_type="borehole", resource_status="active",
                 resource_name="مورد مائي قصر البخاري 1 (تجريبي)",
                 site_name="موقع قصر البخاري الوطني (تجريبي)",
                 project_domain="food",
                 project_title="مشروع موارد وإنتاج — قصر البخاري (تجريبي)"),
            dict(code="68", wilaya_ar="بوسعادة", wilaya_fr="Bou Saada", wilaya_en="Bou Saada",
                 lat=None, lon=None, commune_ar="بوسعادة",
                 org_code="DEMO-BOUSA-ADE", org_kind="water",
                 resource_type="borehole", resource_status="active",
                 resource_name="مورد مائي بوسعادة 1 (تجريبي)",
                 site_name="موقع بوسعادة الوطني (تجريبي)",
                 project_domain="water",
                 project_title="مشروع موارد مائية — بوسعادة (تجريبي)"),
            dict(code="69", wilaya_ar="الأبيض سيدي الشيخ", wilaya_fr="El Abiodh Sidi Cheikh", wilaya_en="El Abiodh Sidi Cheikh",
                 lat=None, lon=None, commune_ar="الأبيض سيدي الشيخ",
                 org_code="DEMO-EASCH-ADE", org_kind="water",
                 resource_type="borehole", resource_status="active",
                 resource_name="مورد مائي الأبيض سيدي الشيخ 1 (تجريبي)",
                 site_name="موقع الأبيض سيدي الشيخ الوطني (تجريبي)",
                 project_domain="water",
                 project_title="مشروع موارد مائية — الأبيض سيدي الشيخ (تجريبي)"),
        ]
        for w in extra_wilayas:
            if w["org_kind"] == "water":
                org_defaults = dict(
                    name_ar=f"مديرية الموارد المائية — {w['wilaya_ar']} (تجريبي)",
                    name_fr=f"Direction des ressources en eau — {w['wilaya_fr']} (démo)",
                    name_en=f"Water Resources Directorate — {w['wilaya_en']} (demo)",
                    is_demo=True)
            else:
                org_defaults = dict(
                    name_ar=f"مديرية المصالح الفلاحية — {w['wilaya_ar']} (تجريبي)",
                    name_fr=f"Direction des services agricoles — {w['wilaya_fr']} (démo)",
                    name_en=f"Agricultural Services Directorate — {w['wilaya_en']} (demo)",
                    is_demo=True)
            org_x, c = get_or_create(db, Organization, code=w["org_code"], defaults=org_defaults)
            created["orgs"] += c

            usr_x, c = get_or_create(db, User,
                email=f"member@{w['org_code'].lower()}.dz",
                defaults=dict(org_id=org_x.id, password_hash=demo_password_hash,
                              full_name=f"عضو تجريبي — {w['wilaya_ar']}", role="member"))
            created["users"] += c

            site_x, c = get_or_create(db, Site, org_id=org_x.id, name=w["site_name"],
                defaults=dict(wilaya=w["wilaya_ar"], commune=w["commune_ar"],
                              lat=w["lat"], lon=w["lon"], is_demo=True))
            created["sites"] += c

            res_x, c = get_or_create(db, WaterResource, org_id=org_x.id, name=w["resource_name"],
                defaults=dict(site_id=site_x.id, type=w["resource_type"],
                              status=w["resource_status"], is_demo=True))
            created["resources"] += c

            project_x, c = get_or_create(db, Project, org_id=org_x.id, title=f"مساحة تشغيل تجريبية — {w['site_name'].replace(' (تجريبي)', '')}",
                defaults=dict(description="مشروع تجريبي لاختبار سير عمل المنصة — ليس مشروعًا وطنيًا حقيقيًا.",
                              domain=w["project_domain"], status="active",
                              site_id=site_x.id, resource_id=res_x.id, is_demo=True,
                              created_by=usr_x.id))
            created["projects"] += c

            # One deterministic operational signal and one evidence record per
            # national demo workspace. These are synthetic investor/expo data,
            # never field observations and never national statistics.
            demo_observed_at = datetime(2026, 9, 30, 12, 0, tzinfo=timezone.utc)
            demo_flow = round(0.25 + (int(w["code"]) % 10) * 0.03, 2)
            _, c = get_or_create(
                db, Measurement,
                org_id=org_x.id, project_id=project_x.id, parameter="flow_rate",
                value=demo_flow, unit="L/s",
                source=f"SYNTHETIC-DEMO-WILAYA-{w['code']}",
                defaults=dict(
                    resource_id=res_x.id,
                    measured_at=demo_observed_at,
                    method="Synthetic baseline generated for investor/expo demonstration",
                    source_type="manual",
                    quality_status="pending",
                    verification_status="unverified",
                    is_demo=True,
                    submitted_by=usr_x.id,
                ),
            )
            created["measurements"] += c

            _, c = get_or_create(
                db, Evidence,
                org_id=org_x.id,
                project_id=project_x.id,
                title=f"Baseline national demo — {w['wilaya_ar']}",
                defaults=dict(
                    doc_type="report",
                    license="Synthetic demo data — internal demonstration",
                    content_note=(
                        f"DEMO_ONLY; wilaya_code={w['code']}; "
                        "synthetic baseline for interface and workflow demonstration; "
                        "not a field measurement, official statistic, or verified national dataset."
                    ),
                    status="submitted",
                    is_demo=True,
                    submitted_by=usr_x.id,
                ),
            )
            created["evidences"] += c

            seed_agriculture_workspace(
                db, created,
                org=org_x,
                user=usr_x,
                site=site_x,
                code=w["code"],
                wilaya_ar=w["wilaya_ar"],
                crop="date_palm" if w["org_kind"] == "water" else "wheat",
            )

        res1, c = get_or_create(db, WaterResource, org_id=org1.id, name="فڨارة أولف الشرقية (تجريبية)",
                                defaults=dict(site_id=site1.id, type="foggara",
                                              status="degraded", is_demo=True))
        created["resources"] += c
        res2, c = get_or_create(db, WaterResource, org_id=org2.id, name="بئر أم العسل 3 (تجريبي)",
                                defaults=dict(site_id=site2.id, type="borehole",
                                              status="active", is_demo=True))
        created["resources"] += c

        proj2, c = get_or_create(
            db, Project, org_id=org2.id,
            title="مساحة تشغيل تجريبية — منطقة أم العسل — تندوف",
            defaults=dict(
                description="مشروع اصطناعي للعرض واختبار سير العمل — ليس مشروعًا ميدانيًا أو إحصاءً رسميًا.",
                domain="food", status="active", site_id=site2.id,
                resource_id=res2.id, is_demo=True, created_by=member2.id,
            ),
        )
        created["projects"] += c

        _, c = get_or_create(
            db, Measurement,
            org_id=org2.id, project_id=proj2.id, parameter="flow_rate",
            value=0.36, unit="L/s", source="SYNTHETIC-DEMO-WILAYA-37",
            defaults=dict(
                resource_id=res2.id,
                measured_at=datetime(2026, 9, 30, 12, 0, tzinfo=timezone.utc),
                method="Synthetic baseline generated for investor/expo demonstration",
                source_type="manual", quality_status="pending",
                verification_status="unverified", is_demo=True,
                submitted_by=member2.id,
            ),
        )
        created["measurements"] += c

        _, c = get_or_create(
            db, Evidence,
            org_id=org2.id, project_id=proj2.id,
            title="Baseline national demo — تندوف",
            defaults=dict(
                doc_type="report",
                license="Synthetic demo data — internal demonstration",
                content_note=(
                    "DEMO_ONLY; wilaya_code=37; synthetic baseline for interface and workflow "
                    "demonstration; not a field measurement, official statistic, or verified national dataset."
                ),
                status="submitted", is_demo=True, submitted_by=member2.id,
            ),
        )
        created["evidences"] += c

        asset1, c = get_or_create(db, Asset, org_id=org1.id, resource_id=res1.id,
                                  name="المعرّف الرئيسي للفڨارة (تجريبي)",
                                  defaults=dict(kind="gallery", status="maintenance", is_demo=True))
        created["assets"] += c

        proj, c = get_or_create(db, Project, org_id=org1.id,
                                title="مساحة تشغيل تجريبية — واحة أولف — أدرار",
                                defaults=dict(
                                    description="مشروع تجريبي لاختبار سير عمل المنصة — ليس مشروعًا وطنيًا حقيقيًا.",
                                    domain="water", status="active", site_id=site1.id,
                                    resource_id=res1.id, asset_id=asset1.id, is_demo=True,
                                    created_by=member1.id))
        created["projects"] += c

        now = datetime.now(timezone.utc)

        # ---- Measurements (manual, legacy-style) ----
        for i, val in enumerate([0.42, 0.38, 0.47]):
            m, c = get_or_create(
                db, Measurement, org_id=org1.id, project_id=proj.id, parameter="flow_rate",
                value=val, unit="L/s", source="قياس ميداني تجريبي",
                defaults=dict(resource_id=res1.id,
                              measured_at=now - timedelta(days=3 - i),
                              method="قنطرة قياس يدوية (تجريبي)", source_type="manual",
                              quality_status="pending", verification_status="unverified",
                              is_demo=True, submitted_by=member1.id))
            created["measurements"] += c

        ev, c = get_or_create(db, Evidence, org_id=org1.id, project_id=proj.id,
                              title="تقرير معاينة أولية (تجريبي)",
                              defaults=dict(doc_type="report", license="وثيقة داخلية تجريبية — CC0",
                                            content_note="معاينة بصرية لحالة القنوات — بيانات اصطناعية للعرض فقط.",
                                            status="submitted", is_demo=True,
                                            submitted_by=member1.id))
        created["evidences"] += c

        # ---- Metrology DEMO ----
        inst_ok, c = get_or_create(db, Instrument, org_id=org1.id, serial_number="FM-DEMO-001",
                                   defaults=dict(type="flow_meter", site_id=site1.id,
                                                 asset_id=asset1.id, status="active", is_demo=True))
        created["instruments"] += c
        inst_bad, c = get_or_create(db, Instrument, org_id=org1.id, serial_number="PH-DEMO-002",
                                    defaults=dict(type="ph_meter", site_id=site1.id,
                                                  status="active", is_demo=True))
        created["instruments"] += c

        cert_ok, c = get_or_create(db, Certificate, org_id=org1.id, number="CERT-DEMO-2026-001",
                                   defaults=dict(instrument_id=inst_ok.id,
                                                 issuer="مخبر المترولوجيا الوطني (تجريبي)",
                                                 status="active",
                                                 valid_from=now - timedelta(days=100),
                                                 valid_to=now + timedelta(days=265),
                                                 uri="https://example.invalid/cert/CERT-DEMO-2026-001.pdf",
                                                 is_demo=True))
        created["certificates"] += c
        _, c = get_or_create(db, Certificate, org_id=org1.id, number="CERT-DEMO-2024-002",
                             defaults=dict(instrument_id=inst_bad.id,
                                           issuer="مخبر المترولوجيا الوطني (تجريبي)",
                                           status="expired",
                                           valid_from=now - timedelta(days=500),
                                           valid_to=now - timedelta(days=135),
                                           is_demo=True))
        created["certificates"] += c

        _, c = get_or_create(db, Calibration, org_id=org1.id, instrument_id=inst_ok.id,
                             authority="مخبر المترولوجيا الوطني (تجريبي)",
                             defaults=dict(calibrated_on=now - timedelta(days=100),
                                           result="pass", next_due=now + timedelta(days=265),
                                           certificate_id=cert_ok.id))
        created["calibrations"] += c
        _, c = get_or_create(db, Calibration, org_id=org1.id, instrument_id=inst_bad.id,
                             authority="مخبر المترولوجيا الوطني (تجريبي)",
                             defaults=dict(calibrated_on=now - timedelta(days=500),
                                           result="pass", next_due=now - timedelta(days=135)))
        created["calibrations"] += c

        _, c = get_or_create(db, Inspection, org_id=org1.id, asset_id=asset1.id,
                             inspector="مهندس فحص تجريبي",
                             defaults=dict(inspected_on=now - timedelta(days=10),
                                           result="conditional",
                                           notes="ترسبات في القناة الرئيسية — بيانات تجريبية.",
                                           is_demo=True))
        created["inspections"] += c

        m, c = get_or_create(
            db, Measurement, org_id=org1.id, project_id=proj.id, parameter="flow_rate",
            value=0.44, unit="L/s", instrument_id=inst_ok.id,
            defaults=dict(measured_at=now - timedelta(hours=6),
                          resource_id=res1.id, asset_id=asset1.id,
                          source="عداد تصريح FM-DEMO-001 (تجريبي)", method="قراءة آلية",
                          source_type="instrument", quality_status="pending",
                          verification_status="unverified", is_demo=True,
                          submitted_by=member1.id))
        created["measurements"] += c
        m, c = get_or_create(
            db, Measurement, org_id=org1.id, project_id=proj.id, parameter="ph",
            value=7.3, unit="pH", instrument_id=inst_bad.id,
            defaults=dict(measured_at=now - timedelta(hours=5),
                          resource_id=res1.id,
                          source="مقياس pH PH-DEMO-002 بمعايرة منتهية (تجريبي)", method="قراءة آلية",
                          source_type="instrument", quality_status="pending",
                          verification_status="unverified", is_demo=True,
                          submitted_by=member1.id))
        created["measurements"] += c

        # ---- Services catalog DEMO (نموذج تجريبي) ----
        services_demo = [
            dict(type="calibration", domain=None,
                 name_ar="خدمة معايرة أدوات القياس (نموذج تجريبي)",
                 name_fr="Service d'étalonnage d'instruments (démo)",
                 name_en="Instrument calibration service (demo)",
                 provider="مخبر المترولوجيا الوطني (تجريبي)",
                 description="معايرة عدادات التصريف ومقاييس الجودة — نموذج تجريبي."),
            dict(type="inspection", domain="water",
                 name_ar="خدمة فحص الفڨارات والقنوات (نموذج تجريبي)",
                 name_fr="Service d'inspection des foggaras (démo)",
                 name_en="Foggara and channel inspection service (demo)",
                 provider="مديرية الموارد المائية — أدرار (تجريبي)",
                 description="فحص ميداني موثق للمعارف والآبار الأم — نموذج تجريبي."),
            dict(type="irrigation_service", domain="food",
                 name_ar="خدمة استشارة ري (نموذج تجريبي)",
                 name_fr="Service de conseil en irrigation (démo)",
                 name_en="Irrigation advisory service (demo)",
                 provider="مديرية المصالح الفلاحية — تندوف (تجريبي)",
                 description="برمجة الري حسب رطوبة التربة — نموذج تجريبي."),
            dict(type="technical_study", domain=None,
                 name_ar="دراسة تقنية WEFEH (نموذج تجريبي)",
                 name_fr="Étude technique WEFEH (démo)",
                 name_en="WEFEH technical study (demo)",
                 provider="فريق FOGGARA-DZ (تجريبي)",
                 description="دراسة تقاطع مياه/طاقة/غذاء — نموذج تجريبي."),
        ]
        svc_ids = []
        for spec in services_demo:
            svc, c = get_or_create(db, Service, name_en=spec["name_en"],
                                   defaults={**{k: v for k, v in spec.items() if k != "name_en"},
                                             "is_demo": True})
            created["services"] += c
            svc_ids.append(svc.id)

        # ---- Service request DEMO ----
        _, c = get_or_create(db, ServiceRequest, org_id=org1.id, service_id=svc_ids[1],
                             project_id=proj.id,
                             defaults=dict(site_id=site1.id,
                                           requesting_entity="مصلحة الصيانة — أدرار (تجريبي)",
                                           status="submitted",
                                           notes="طلب فحص للقناة الرئيسية — نموذج تجريبي.",
                                           is_demo=True, created_by=member1.id))
        created["service_requests"] += c

        # ---- Water domain DEMO (Contract §4) ----
        well1, c = get_or_create(db, Well, org_id=org1.id, name="بئر أم — فڨارة أولف (تجريبي)",
                                 defaults=dict(site_id=site1.id, depth_m=38.5, status="active", is_demo=True))
        created["water"] += c
        resv1, c = get_or_create(db, Reservoir, org_id=org1.id, name="خزان القصور — أولف (تجريبي)",
                                 defaults=dict(site_id=site1.id, capacity_m3=1200, min_level_m=1.2,
                                               status="active", is_demo=True))
        created["water"] += c
        pump1, c = get_or_create(db, Pump, org_id=org1.id, name="مضخة الفڨارة الرئيسية (تجريبية)",
                                 defaults=dict(site_id=site1.id, well_id=well1.id, reservoir_id=None,
                                               rated_power_kw=11, rated_flow_l_s=8, status="active", is_demo=True))
        created["water"] += c
        _, c = get_or_create(db, VFD, org_id=org1.id, pump_id=pump1.id, model="VFD-DEMO-11kW",
                             defaults=dict(max_frequency_hz=50, status="active", is_demo=True))
        created["water"] += c
        zone1, c = get_or_create(db, IrrigationZone, org_id=org1.id, name="منطقة النخيل الشرقية (تجريبية)",
                                 defaults=dict(site_id=site1.id, area_ha=4.5, soil_type="رملي طيني",
                                               crop_hint="نخيل", is_demo=True))
        created["water"] += c
        _, c = get_or_create(db, Valve, org_id=org1.id, name="صمام توزيع القناة الرئيسية (تجريبي)",
                             defaults=dict(site_id=site1.id, zone_id=zone1.id, diameter_mm=110,
                                           normally_open=False, status="active", is_demo=True))
        created["water"] += c
        alloc1, c = get_or_create(db, WaterAllocation, org_id=org1.id, zone_id=zone1.id,
                             period_start=datetime(2026, 9, 27, 6, 0, tzinfo=timezone.utc),
                             defaults=dict(well_id=well1.id, reservoir_id=None, volume_m3=950,
                                           period_end=datetime(2026, 10, 2, 18, 0, tzinfo=timezone.utc),
                                           status="proposed", created_by=member1.id, is_demo=True))
        created["water"] += c

        # ---- Demo decisions ----
        dec1, c = get_or_create(db, GovDecision, org_id=org1.id,
                                title="اعتماد تخصيص مياه النخيل الشرقية (تجريبي)",
                                defaults=dict(
                                    domain="water", decision_type="water_allocation_approval",
                                    description="قرار تجريبي يعتمد التخصيص الموسوم DEMO لمنطقة النخيل الشرقية.",
                                    status="REVIEW_REQUIRED", priority="high", risk_level="medium",
                                    subject_type="water_allocation", subject_id=alloc1.id,
                                    proposed_by=member1.id, reviewed_by=reviewer1.id,
                                    reason="طلب موسم فلاحي", expected_result="ريّ متوازن للموسم",
                                    is_demo=True))
        created["decisions"] += c
        if c:
            db.add(GovDecisionTransition(
                decision_id=dec1.id, from_status="", to_status="PROPOSED",
                actor_id=member1.id, actor_role="member",
                created_at=datetime(2026, 9, 28, 8, 0, tzinfo=timezone.utc)))
            db.add(GovDecisionTransition(
                decision_id=dec1.id, from_status="PROPOSED", to_status="REVIEW_REQUIRED",
                actor_id=member1.id, actor_role="member", reason="إحالة للمراجعة",
                created_at=datetime(2026, 9, 28, 8, 5, tzinfo=timezone.utc)))
            db.add(GovDecisionEvidence(
                decision_id=dec1.id, evidence_type="measurement", source_type="well",
                source_id=str(alloc1.id), value=950, unit="m3", quality="demo",
                observed_at=datetime(2026, 9, 27, 6, 0, tzinfo=timezone.utc)))
        dec2, c = get_or_create(db, GovDecision, org_id=org1.id,
                                title="دراسة إغلاق بئر متدنية الجودة (تجريبي)",
                                defaults=dict(
                                    domain="water", decision_type="well_closure_study",
                                    description="قرار تجريبي في حالة اقتراح أولي.",
                                    status="PROPOSED", priority="medium", risk_level="high",
                                    subject_type="well", proposed_by=reviewer1.id,
                                    reason="ملوحة متصاعدة", is_demo=True))
        created["decisions"] += c
        if c:
            db.add(GovDecisionTransition(
                decision_id=dec2.id, from_status="", to_status="PROPOSED",
                actor_id=reviewer1.id, actor_role="reviewer",
                created_at=datetime(2026, 9, 28, 9, 0, tzinfo=timezone.utc)))

        # ---- Demo IoT/simulator ----
        dev1, c = get_or_create(db, Device, org_id=org1.id,
                                name="وحدة تحكم البئر الأول (محاكاة)",
                                defaults=dict(
                                    device_type="well_controller",
                                    subject_type="well", subject_id=well1.id,
                                    protocol="simulated", is_simulated=True,
                                    is_demo=True))
        created["iot"] += c
        sen_level, c = get_or_create(db, Sensor, org_id=org1.id, device_id=dev1.id,
                                     metric="water_level",
                                     defaults=dict(
                                         name="مستوى ماء البئر (محاكاة)",
                                         sensor_type="water_level", unit="m",
                                         min_value=0, max_value=10,
                                         subject_type="well", subject_id=well1.id,
                                         configuration={"base_value": 5.0},
                                         is_simulated=True, is_demo=True))
        created["iot"] += c
        _, c = get_or_create(db, Sensor, org_id=org1.id, device_id=dev1.id,
                             metric="flow_rate",
                             defaults=dict(
                                 name="تدفق البئر (محاكاة)", sensor_type="flow_rate",
                                 unit="L/s", min_value=0, max_value=30,
                                 subject_type="well", subject_id=well1.id,
                                 configuration={"base_value": 12.0},
                                 is_simulated=True, is_demo=True))
        created["iot"] += c
        _, c = get_or_create(db, Sensor, org_id=org1.id, device_id=dev1.id,
                             metric="pressure",
                             defaults=dict(
                                 name="ضغط الخط (محاكاة)", sensor_type="pressure",
                                 unit="bar", min_value=0, max_value=6,
                                 subject_type="well", subject_id=well1.id,
                                 configuration={"base_value": 3.0},
                                 is_simulated=True, is_demo=True))
        created["iot"] += c
        _, c = get_or_create(db, TelemetryRule, org_id=org1.id,
                             name="تحذير انخفاض مستوى البئر (تجريبي)",
                             defaults=dict(
                                 domain="water", metric="water_level",
                                 operator="LT", threshold=2.0, unit="m",
                                 severity="high",
                                 decision_type="water_level_warning",
                                 configuration={
                                     "expected_result": "استعادة المستوى الآمن للبئر"},
                                 is_demo=True))
        created["iot"] += c

        ensure_default_indicator(db)
        db.commit()

        total = sum(created.values())
        if total == 0:
            print("Seed already up to date — nothing inserted (idempotent).")
        else:
            print("Inserted:", {k: v for k, v in created.items() if v})
        print("Demo users seeded; credential supplied through DEMO_PASSWORD and not logged.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
