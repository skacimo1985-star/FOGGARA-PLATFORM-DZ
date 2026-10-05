"""اختبارات التوسعة: مترولوجيا، خدمات، قرارات بشرية، توضيح، تحليلات شفافة، استكشاف، عزل."""
from datetime import datetime, timedelta, timezone

from tests.conftest import login
from tests.test_acceptance import NOW, add_evidence, add_measurement, make_project

FUTURE = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
PAST = (datetime.now(timezone.utc) - timedelta(days=400)).isoformat()
RECENT = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
EXPIRED = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()


def make_instrument(client, headers, serial="SN-1"):
    r = client.post("/api/instruments", json={
        "type": "flow_meter", "serial_number": serial}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def add_calibration(client, headers, instrument_id, next_due=FUTURE, result="pass"):
    r = client.post(f"/api/instruments/{instrument_id}/calibrations", json={
        "calibrated_on": RECENT, "authority": "مخبر تجريبي",
        "result": result, "next_due": next_due}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def add_instrument_measurement(client, headers, project_id, instrument_id, value=1.0):
    r = client.post("/api/measurements", json={
        "project_id": project_id, "parameter": "flow_rate", "value": value, "unit": "L/s",
        "measured_at": NOW, "source": "قراءة أداة", "method": "آلية",
        "source_type": "instrument", "instrument_id": instrument_id,
    }, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def review_raw(client, headers, target_type, target_id, decision):
    return client.post("/api/reviews", json={
        "target_type": target_type, "target_id": target_id,
        "decision": decision, "note": "ملاحظة", "reason": "سبب"}, headers=headers)


# 1) رفض وحدة غير مطابقة/قيمة غير منطقية على معاملات موسّعة + قبول معاملات WEFEH الجديدة
def test_extended_parameter_dictionary(client, world, db):
    member = login(client, "o1m@t.dz")
    p = make_project(client, member)

    # وحدة غير صحيحة لمعامل جديد
    r = client.post("/api/measurements", json={
        "project_id": p["id"], "parameter": "pressure", "value": 2.0, "unit": "kg",
        "measured_at": NOW, "source": "s", "method": "m"}, headers=member)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "INVALID_UNIT"

    # قيمة غير منطقية (رطوبة > 100%)
    r = client.post("/api/measurements", json={
        "project_id": p["id"], "parameter": "humidity", "value": 140.0, "unit": "%RH",
        "measured_at": NOW, "source": "s", "method": "m"}, headers=member)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "VALUE_OUT_OF_RANGE"

    # معاملات جديدة صحيحة تُقبل
    for parameter, value, unit in [("pressure", 3.5, "bar"), ("voltage", 230.0, "V"),
                                   ("electrical_power", 4.2, "kW"), ("humidity", 45.0, "%RH")]:
        r = client.post("/api/measurements", json={
            "project_id": p["id"], "parameter": parameter, "value": value, "unit": unit,
            "measured_at": NOW, "source": "s", "method": "m"}, headers=member)
        assert r.status_code == 201, (parameter, r.text)
        assert r.json()["source_type"] == "manual"
        assert r.json()["verification_status"] == "unverified"

    # معامل غير موجود في القاموس
    r = client.post("/api/measurements", json={
        "project_id": p["id"], "parameter": "unknown_param", "value": 1.0, "unit": "m",
        "measured_at": NOW, "source": "s", "method": "m"}, headers=member)
    assert r.status_code == 422


# 2) قياس من أداة بمعايرة منتهية يُقدَّم لكن لا يُعتمد؛ وأداة معايرة تُعتمد
def test_calibration_gate(client, world, db):
    member = login(client, "o1m@t.dz")
    reviewer = login(client, "o1r@t.dz")
    p = make_project(client, member)

    inst_no_cal = make_instrument(client, member, "SN-NOCAL")
    m1 = add_instrument_measurement(client, member, p["id"], inst_no_cal["id"])
    assert m1["verification_status"] == "unverified"

    # بلا معايرة إطلاقًا → لا اعتماد
    r = review_raw(client, reviewer, "measurement", m1["id"], "accepted")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "CALIBRATION_REQUIRED"

    # معايرة منتهية → لا اعتماد أيضًا
    inst_expired = make_instrument(client, member, "SN-EXP")
    add_calibration(client, member, inst_expired["id"], next_due=EXPIRED)
    m2 = add_instrument_measurement(client, member, p["id"], inst_expired["id"])
    r = review_raw(client, reviewer, "measurement", m2["id"], "accepted")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "CALIBRATION_REQUIRED"

    # معايرة سارية → اعتماد وتحديث verification_status
    inst_ok = make_instrument(client, member, "SN-OK")
    add_calibration(client, member, inst_ok["id"])
    m3 = add_instrument_measurement(client, member, p["id"], inst_ok["id"])
    r = review_raw(client, reviewer, "measurement", m3["id"], "accepted")
    assert r.status_code == 201, r.text
    r = client.get(f"/api/measurements/{m3['id']}", headers=member)
    assert r.json()["quality_status"] == "validated"
    assert r.json()["verification_status"] == "verified"

    # حالة المترولوجيا للأداة
    r = client.get(f"/api/instruments/{inst_ok['id']}/metrology-status", headers=member)
    assert r.json()["has_valid_calibration"] is True
    r = client.get(f"/api/instruments/{inst_no_cal['id']}/metrology-status", headers=member)
    assert r.json()["has_valid_calibration"] is False


# 3) الشهادة كيان كامل بحالة وصلاحية
def test_certificates_and_inspections(client, world, db):
    member = login(client, "o1m@t.dz")
    inst = make_instrument(client, member, "SN-CERT")
    r = client.post(f"/api/instruments/{inst['id']}/certificates", json={
        "number": "C-1", "issuer": "جهة إصدار تجريبية", "status": "active",
        "valid_from": RECENT, "valid_to": FUTURE,
        "uri": "https://example.invalid/c1.pdf"}, headers=member)
    assert r.status_code == 201, r.text
    cert = r.json()
    assert cert["status"] == "active" and cert["uri"].endswith("c1.pdf")

    r = client.get(f"/api/instruments/{inst['id']}/metrology-status", headers=member)
    assert r.json()["has_active_certificate"] is True

    # تفتيش يتطلب أداة أو أصلًا
    r = client.post("/api/inspections", json={
        "inspected_on": NOW, "inspector": "مفتش", "result": "pass"}, headers=member)
    assert r.status_code == 422
    r = client.post("/api/inspections", json={
        "instrument_id": inst["id"], "inspected_on": NOW,
        "inspector": "مفتش", "result": "conditional", "notes": "ملاحظات"}, headers=member)
    assert r.status_code == 201


# 4) سير ServiceRequest كامل + صلاحيات + عزل
def test_service_request_flow(client, world, db):
    from app.models import Service
    svc = Service(type="calibration", name_ar="خدمة معايرة", name_fr="Étalonnage",
                  name_en="Calibration", provider="مخبر", is_demo=True)
    db.add(svc)
    db.commit()

    member = login(client, "o1m@t.dz")
    reviewer = login(client, "o1r@t.dz")
    member2 = login(client, "o2m@t.dz")

    # الكتالوج عام داخل الجلسة
    r = client.get("/api/services", headers=member2)
    assert r.status_code == 200 and any(s["id"] == svc.id for s in r.json())

    p = make_project(client, member)
    r = client.post("/api/service-requests", json={
        "service_id": svc.id, "project_id": p["id"],
        "requesting_entity": "مصلحة الصيانة", "notes": "طلب تجريبي"}, headers=member)
    assert r.status_code == 201, r.text
    sr = r.json()
    assert sr["status"] == "submitted"

    # سرد طلبات مؤسستي فقط
    r = client.get("/api/service-requests", headers=member)
    assert any(x["id"] == sr["id"] for x in r.json())
    r = client.get("/api/service-requests", headers=member2)
    assert all(x["id"] != sr["id"] for x in r.json())
    assert client.get(f"/api/service-requests/{sr['id']}", headers=member2).status_code == 404

    # العضو العادي لا يغيّر الحالة
    r = client.patch(f"/api/service-requests/{sr['id']}/status",
                     json={"status": "triaged"}, headers=member)
    assert r.status_code == 403

    # سير العمل حتى التنفيذ
    for st in ("triaged", "assigned", "in_progress"):
        r = client.patch(f"/api/service-requests/{sr['id']}/status",
                         json={"status": st}, headers=reviewer)
        assert r.status_code == 200 and r.json()["status"] == st

    # لا إغلاق بلا مخرج موثق
    r = client.patch(f"/api/service-requests/{sr['id']}/status",
                     json={"status": "completed"}, headers=reviewer)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "DELIVERABLE_REQUIRED"

    # تقرير خدمة موثق ومراجع يسمح بالإكمال
    ev = client.post("/api/evidences", headers=member, json={
        "project_id": p["id"], "title": "Service delivery report",
        "doc_type": "report", "license": "internal"}).json()
    from app.models import Evidence
    db.get(Evidence, ev["id"]).status = "verified"; db.commit()
    r = client.patch(f"/api/service-requests/{sr['id']}/status",
                     json={"status": "completed"}, headers=reviewer)
    assert r.status_code == 200 and r.json()["status"] == "completed"

    # انتقال غير مسموح من حالة نهائية
    r = client.patch(f"/api/service-requests/{sr['id']}/status",
                     json={"status": "submitted"}, headers=reviewer)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "INVALID_STATUS_TRANSITION"

    # مراجع مؤسسة أخرى: 404
    reviewer2 = login(client, "o2r@t.dz")
    r = client.patch(f"/api/service-requests/{sr['id']}/status",
                     json={"status": "cancelled"}, headers=reviewer2)
    assert r.status_code == 404


# 5) HumanDecision: صلاحيات، سبب إلزامي، منع القرار الذاتي
def test_human_decision_rules(client, world, db):
    member = login(client, "o1m@t.dz")
    reviewer = login(client, "o1r@t.dz")
    p = make_project(client, member)
    e = add_evidence(client, member, p["id"])

    # العضو العادي ممنوع
    r = client.post("/api/human-decisions", json={
        "project_id": p["id"], "decision": "approve", "reason": "سبب"}, headers=member)
    assert r.status_code == 403

    # السبب إلزامي
    r = client.post("/api/human-decisions", json={
        "project_id": p["id"], "decision": "approve", "reason": ""}, headers=reviewer)
    assert r.status_code == 422

    # قرار صحيح مع أدلة مرتبطة
    r = client.post("/api/human-decisions", json={
        "project_id": p["id"], "decision": "approve", "reason": "مبررات موثقة",
        "evidence_ids": [e["id"]]}, headers=reviewer)
    assert r.status_code == 201, r.text
    dec = r.json()
    assert dec["evidence_ids"] == [e["id"]]

    # المراجع لا يقرر في مشروع أنشأه بنفسه
    p2 = make_project(client, reviewer, "مشروع المراجع")
    r = client.post("/api/human-decisions", json={
        "project_id": p2["id"], "decision": "defer", "reason": "سبب"}, headers=reviewer)
    assert r.status_code == 403 and r.json()["detail"]["code"] == "SELF_DECISION_FORBIDDEN"

    # سرد قرارات المشروع + عزل
    r = client.get(f"/api/projects/{p['id']}/human-decisions", headers=member)
    assert len(r.json()) == 1
    member2 = login(client, "o2m@t.dz")
    assert client.get(f"/api/projects/{p['id']}/human-decisions", headers=member2).status_code == 404


# 6) request_clarification على الدليل ثم إعادة المراجعة
def test_request_clarification_flow(client, world, db):
    member = login(client, "o1m@t.dz")
    reviewer = login(client, "o1r@t.dz")
    p = make_project(client, member)
    e = add_evidence(client, member, p["id"])

    r = client.post("/api/reviews", json={
        "target_type": "evidence", "target_id": e["id"],
        "decision": "request_clarification",
        "note": "وضّح مصدر الصورة وتاريخها", "reason": "نقص معلومات"}, headers=reviewer)
    assert r.status_code == 201, r.text

    r = client.get(f"/api/evidences/{e['id']}", headers=member)
    body = r.json()
    assert body["status"] == "submitted"  # يبقى قابلًا لإعادة المراجعة
    assert body["resolution"] == "request_clarification"
    assert body["clarification_note"] == "وضّح مصدر الصورة وتاريخها"

    # إعادة مراجعة بعد التوضيح
    r = client.post("/api/reviews", json={
        "target_type": "evidence", "target_id": e["id"],
        "decision": "accepted", "note": "تم التوضيح", "reason": "اكتمل"}, headers=reviewer)
    assert r.status_code == 201
    r = client.get(f"/api/evidences/{e['id']}", headers=member)
    assert r.json()["status"] == "verified" and r.json()["resolution"] == "accepted"


# 7) Analytics: شفافية + رفض القياسات غير المعتمدة
def test_analytics_transparency(client, world, db):
    member = login(client, "o1m@t.dz")
    reviewer = login(client, "o1r@t.dz")
    p = make_project(client, member)

    # بيانات غير كافية: رسالة ومفاتيح شفافية موجودة
    r = client.get(f"/api/projects/{p['id']}/indicators/WATER_FLOW_AVG_LS", headers=member)
    ind = r.json()
    assert ind["value"] is None and ind["sufficient"] is False
    assert ind["message"] == "INSUFFICIENT_DATA"
    assert ind["formula"] and ind["name_ar"] and ind["name_fr"] and ind["name_en"]
    assert "valid_from" in ind and "valid_to" in ind and "window_from" in ind

    # قياس pending لا يدخل الحساب
    m_pending = add_measurement(client, member, p["id"], 9.9)
    m_ok = add_measurement(client, member, p["id"], 0.5)
    review_raw(client, reviewer, "measurement", m_ok["id"], "accepted")

    r = client.get(f"/api/projects/{p['id']}/indicators/WATER_FLOW_AVG_LS", headers=member)
    ind = r.json()
    assert ind["sufficient"] is True and abs(ind["value"] - 0.5) < 1e-6
    # المصادر = القياس المعتمد فقط
    assert ind["measurement_ids"] == [m_ok["id"]]
    assert ind["n_measurements"] == 1


# 8) explore: planned للأبعاد غير المنجزة وبيانات حقيقية للماء
def test_explore_domains(client, world, db):
    member = login(client, "o1m@t.dz")
    make_project(client, member)  # مشروع ماء حقيقي

    r = client.get("/api/explore/water", headers=member)
    assert r.status_code == 200
    body = r.json()
    assert body["projects"]["status"] == "available"
    assert body["risks"]["status"] == "planned" and body["risks"]["required_data"]

    for domain in ("energy", "food", "ecosystem", "health"):
        r = client.get(f"/api/explore/{domain}", headers=member)
        assert r.status_code == 200
        body = r.json()
        assert body["resources"]["status"] == "planned"
        assert body["resources"]["required_data"]
        assert body["indicators"]["status"] == "planned"
        assert body["assets"]["status"] == "planned"
        # لا قيم مخترعة: لا items في الأقسام المخططة
        assert "items" not in body["resources"]

    r = client.get("/api/explore/space", headers=member)
    assert r.status_code == 404 and r.json()["detail"]["code"] == "UNKNOWN_DOMAIN"


# 9) GIS + wilayas + IoT/VDE planned
def test_gis_meta_iot_vde(client, world, db):
    member = login(client, "o1m@t.dz")
    r = client.post("/api/sites", json={"name": "موقع", "wilaya": "أدرار",
                                        "lat": 27.9, "lon": -0.29}, headers=member)
    assert r.status_code == 201
    site_id = r.json()["id"]
    r = client.post("/api/sites", json={"name": "بدون إحداثيات", "wilaya": "أدرار"}, headers=member)
    assert r.status_code == 201

    r = client.get("/api/gis/sites", headers=member)
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 1  # فقط ذو الإحداثيات
    assert body["sites"][0]["site"]["id"] == site_id
    assert "projects" in body["sites"][0] and "resources" in body["sites"][0]

    r = client.get("/api/meta/wilayas", headers=member)
    assert r.status_code == 200 and r.json()["count"] == 15
    assert any(w["ar"] == "أدرار" for w in r.json()["wilayas"])

    for path in ("/api/iot/status", "/api/vde/status"):
        r = client.get(path, headers=member)
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "planned" and body["model"] and body["warnings"]


# 10) عزل المؤسسات على endpoints المترولوجيا الجديدة
def test_metrology_isolation(client, world, db):
    member1 = login(client, "o1m@t.dz")
    member2 = login(client, "o2m@t.dz")
    inst = make_instrument(client, member1, "SN-ISO")

    assert client.get(f"/api/instruments/{inst['id']}", headers=member2).status_code == 404
    assert client.get(f"/api/instruments/{inst['id']}/metrology-status", headers=member2).status_code == 404
    r = client.post(f"/api/instruments/{inst['id']}/calibrations", json={
        "calibrated_on": RECENT, "authority": "x", "result": "pass",
        "next_due": FUTURE}, headers=member2)
    assert r.status_code == 404
    r = client.get("/api/instruments", headers=member2)
    assert all(i["id"] != inst["id"] for i in r.json())

    # قياس بأداة مؤسسة أخرى مرفوض
    p2 = make_project(client, member2)
    r = client.post("/api/measurements", json={
        "project_id": p2["id"], "parameter": "flow_rate", "value": 1.0, "unit": "L/s",
        "measured_at": NOW, "source": "s", "method": "m",
        "source_type": "instrument", "instrument_id": inst["id"]}, headers=member2)
    assert r.status_code == 404

    # قياس مشروع مؤسسة أولى لا يمكن اعتماده من مراجع المؤسسة الثانية (موجود أصلًا لكن مع أداة)
    reviewer2 = login(client, "o2r@t.dz")
    p1 = make_project(client, member1)
    m1 = add_instrument_measurement(client, member1, p1["id"], inst["id"])
    r = review_raw(client, reviewer2, "measurement", m1["id"], "accepted")
    assert r.status_code == 404
