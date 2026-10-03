"""Seed DEMO data — all rows are synthetic and flagged is_demo=True.

Run:  python3 seed.py
Idempotent: every block checks existence (by a natural key) before inserting,
so running the script multiple times never duplicates rows.
Passwords below are for local demo only. Never use in production.
"""
from datetime import datetime, timedelta, timezone
import os

from sqlalchemy import select

from app.db import SessionLocal
from app.admin_reference import ensure_2026_wilaya_reference
from app.models import (VFD, Asset, Calibration, Certificate, Evidence,
                        Device, GovDecision, GovDecisionEvidence,
                        GovDecisionTransition, Sensor, TelemetryRule,
                        Inspection, Instrument, IrrigationZone, Measurement,
                        Organization, Project, Pump, Reservoir, Service,
                        ServiceRequest, Site, User, Valve, WaterAllocation,
                        WaterResource, Well)
from app.security import hash_password
from app.services.indicators import ensure_default_indicator

DEMO_PASSWORD = "Demo#2026"


def get_or_create(db, model_cls, defaults=None, **lookup):
    obj = db.execute(select(model_cls).filter_by(**lookup)).scalar_one_or_none()
    if obj is not None:
        return obj, False
    obj = model_cls(**lookup, **(defaults or {}))
    db.add(obj)
    db.flush()
    return obj, True


def main():
    # SEED_DEMO: في الإنتاج (ENV=prod) الافتراضي false — لا حسابات/بيانات تجريبية
    # إطلاقًا ما لم تُضبط القيمة صراحة. المؤشر الافتراضي يُنشأ دائمًا.
    seed_demo = os.environ.get(
        "SEED_DEMO", "false"
    ).strip().lower() in ("1", "true", "yes")
    if os.environ.get("ENV", "dev") == "prod" and seed_demo:
        raise RuntimeError("Demo business data is forbidden in production")
    db = SessionLocal()
    created = {"orgs": 0, "users": 0, "sites": 0, "resources": 0, "assets": 0,
               "projects": 0, "measurements": 0, "evidences": 0, "instruments": 0,
               "calibrations": 0, "certificates": 0, "inspections": 0,
               "services": 0, "service_requests": 0, "water": 0, "decisions": 0, "iot": 0}
    try:
        # National reference data is authoritative platform data, never DEMO.
        ensure_2026_wilaya_reference(db)
        if not seed_demo:
            ensure_default_indicator(db)
            db.commit()
            print("SEED_DEMO=false — national reference + default indicator ensured; no demo business data inserted.")
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
            org_id=org1.id, password_hash=hash_password(DEMO_PASSWORD),
            full_name="مستخدم تجريبي — عضو 1", role="member"))
        created["users"] += c
        reviewer1, c = get_or_create(db, User, email="reviewer@demo1.dz", defaults=dict(
            org_id=org1.id, password_hash=hash_password(DEMO_PASSWORD),
            full_name="مراجع تجريبي 1", role="reviewer"))
        created["users"] += c
        admin1, c = get_or_create(db, User, email="admin@demo1.dz", defaults=dict(
            org_id=org1.id, password_hash=hash_password(DEMO_PASSWORD),
            full_name="مشرف تجريبي 1", role="admin"))
        created["users"] += c
        member2, c = get_or_create(db, User, email="member@demo2.dz", defaults=dict(
            org_id=org2.id, password_hash=hash_password(DEMO_PASSWORD),
            full_name="مستخدم تجريبي — عضو 2", role="member"))
        created["users"] += c
        _, c = get_or_create(db, User, email="reviewer@demo2.dz", defaults=dict(
            org_id=org2.id, password_hash=hash_password(DEMO_PASSWORD),
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

        res1, c = get_or_create(db, WaterResource, org_id=org1.id, name="فڨارة أولف الشرقية (تجريبية)",
                                defaults=dict(site_id=site1.id, type="foggara",
                                              status="degraded", is_demo=True))
        created["resources"] += c
        res2, c = get_or_create(db, WaterResource, org_id=org2.id, name="بئر أم العسل 3 (تجريبي)",
                                defaults=dict(site_id=site2.id, type="borehole",
                                              status="active", is_demo=True))
        created["resources"] += c

        asset1, c = get_or_create(db, Asset, org_id=org1.id, resource_id=res1.id,
                                  name="المعرّف الرئيسي للفڨارة (تجريبي)",
                                  defaults=dict(kind="gallery", status="maintenance", is_demo=True))
        created["assets"] += c

        proj, c = get_or_create(db, Project, org_id=org1.id,
                                title="إعادة تأهيل فڨارة أولف الشرقية (تجريبي)",
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
        # أداة 1: عداد تصريف بمعايرة سارية وشهادة active
        inst_ok, c = get_or_create(db, Instrument, org_id=org1.id, serial_number="FM-DEMO-001",
                                   defaults=dict(type="flow_meter", site_id=site1.id,
                                                 asset_id=asset1.id, status="active", is_demo=True))
        created["instruments"] += c
        # أداة 2: مقياس pH بمعايرة منتهية وشهادة expired
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

        # قياسان من أدوات: واحد من أداة معايرة (قابل للاعتماد) وآخر من أداة بمعايرة منتهية
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

        # ---- Water domain DEMO (Contract §4) — مصدر → ضخ → توزيع → سقي → تخصيص ----
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


        # ---- Demo decisions (Contract §25 — المرحلة 2، بيانات تجريبية موسومة) ----
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


        # ---- Demo IoT/simulator (Phase 03 §33 — محاكاة موسومة DEMO) ----
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
        print(f"Demo password for all seeded users: {DEMO_PASSWORD}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
