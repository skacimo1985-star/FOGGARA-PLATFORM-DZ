"""فجوات حرجة: صلاحيات القرارات، عزل explore/GIS، مصفوفة الانتقالات، النافذة الزمنية، منع المراجعة المكررة.

كل اختبار هنا مواصفة سلوكية عبر HTTP فقط (TestClient) — بلا استعلام DB وبلا mocks.
"""
from datetime import datetime, timedelta, timezone

from tests.conftest import login
from tests.test_acceptance import NOW, add_evidence, add_measurement, make_project, review
from tests.test_extensions import review_raw


def make_recommendation(client, member, reviewer, project_id):
    """ينشئ توصية مقترحة عبر المسار الكامل (قياسات معتمدة → توليد)."""
    m1 = add_measurement(client, member, project_id, 0.4)
    review(client, reviewer, "measurement", m1["id"])
    r = client.post(f"/api/projects/{project_id}/recommendations/generate", headers=member)
    assert r.status_code == 201, r.text
    return r.json()


# 1) قرار التوصية قرار حسّاس: للمخوّلين reviewer/admin فقط — العضو العادي ممنوع
def test_recommendation_decision_requires_reviewer_role(client, world, db):
    member = login(client, "o1m@t.dz")
    reviewer = login(client, "o1r@t.dz")
    p = make_project(client, member)
    rec = make_recommendation(client, member, reviewer, p["id"])

    r = client.post(f"/api/recommendations/{rec['id']}/decisions",
                    json={"decision": "approved", "rationale": "محاولة قرار من عضو عادي"},
                    headers=member)
    assert r.status_code == 403 and r.json()["detail"]["code"] == "ROLE_FORBIDDEN"

    # المراجع يقرر بنجاح (المسار القانوني لا يزال مفتوحًا)
    r = client.post(f"/api/recommendations/{rec['id']}/decisions",
                    json={"decision": "approved", "rationale": "قرار مخوّل"}, headers=reviewer)
    assert r.status_code == 201


# 2) explore/GIS لا يسرّبان أي عنصر من مؤسسة أخرى
def test_explore_and_gis_do_not_leak_other_org_data(client, world, db):
    member1 = login(client, "o1m@t.dz")
    member2 = login(client, "o2m@t.dz")

    # مؤسسة 1: مشروع + موقع بإحداثيات + مورد مائي مرتبط
    r = client.post("/api/sites", json={"name": "موقع م1", "wilaya": "أدرار",
                                        "lat": 27.9, "lon": -0.29}, headers=member1)
    assert r.status_code == 201, r.text
    site1 = r.json()
    r = client.post("/api/resources", json={"site_id": site1["id"], "type": "foggara",
                                            "name": "فڨارة م1"}, headers=member1)
    assert r.status_code == 201, r.text
    res1 = r.json()
    p1 = make_project(client, member1, "مشروع مؤسسة 1")

    # sanity: مؤسسة 1 ترى بياناتها
    body = client.get("/api/explore/water", headers=member1).json()
    assert any(r_["id"] == res1["id"] for r_ in body["resources"]["items"])
    gis1 = client.get("/api/gis/sites", headers=member1).json()
    assert any(s["site"]["id"] == site1["id"] for s in gis1["sites"])

    # مؤسسة 2: لا شيء من مؤسسة 1 في explore
    body2 = client.get("/api/explore/water", headers=member2).json()
    assert body2["resources"]["status"] == "planned"  # لا موارد لم2 إطلاقًا
    assert body2["projects"]["status"] == "planned"
    # مؤسسة 2: لا شيء من مؤسسة 1 في GIS
    gis2 = client.get("/api/gis/sites", headers=member2).json()
    assert gis2["count"] == 0 and gis2["sites"] == []
    assert all(s["site"]["id"] != site1["id"] for s in gis2["sites"])


# 3) مصفوفة انتقالات ServiceRequest: لا قفزات ولا رجوع ولا خروج من cancelled
def test_service_request_rejects_skip_backward_and_cancelled_transitions(client, world, db):
    from app.models import Service
    svc = Service(type="inspection", name_ar="خدمة تفتيش", name_fr="Inspection",
                  name_en="Inspection", provider="مخبر", is_demo=True)
    db.add(svc)
    db.commit()

    member = login(client, "o1m@t.dz")
    reviewer = login(client, "o1r@t.dz")  # تغيير الحالة للمخوّلين فقط (القاعدة الحاكمة)
    p = make_project(client, member)

    def make_sr():
        r = client.post("/api/service-requests", json={
            "service_id": svc.id, "project_id": p["id"],
            "requesting_entity": "مصلحة"}, headers=member)
        assert r.status_code == 201, r.text
        return r.json()

    def set_status(sr_id, status):
        return client.patch(f"/api/service-requests/{sr_id}/status",
                            json={"status": status}, headers=reviewer)

    # قفزة: submitted → in_progress مرفوضة
    sr1 = make_sr()
    r = set_status(sr1["id"], "in_progress")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "INVALID_STATUS_TRANSITION"
    assert client.get(f"/api/service-requests/{sr1['id']}", headers=member).json()["status"] == "submitted"

    # رجوع: in_progress → triaged مرفوض
    sr2 = make_sr()
    assert set_status(sr2["id"], "triaged").status_code == 200
    assert set_status(sr2["id"], "assigned").status_code == 200
    assert set_status(sr2["id"], "in_progress").status_code == 200
    r = set_status(sr2["id"], "triaged")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "INVALID_STATUS_TRANSITION"

    # cancelled حالة نهائية: أي انتقال منها مرفوض
    sr3 = make_sr()
    assert set_status(sr3["id"], "cancelled").status_code == 200
    for st in ("triaged", "assigned", "in_progress", "completed", "submitted"):
        r = set_status(sr3["id"], st)
        assert r.status_code == 409 and r.json()["detail"]["code"] == "INVALID_STATUS_TRANSITION", st

    # المسار القانوني الكامل ينجح: submitted→triaged→assigned→in_progress→completed
    sr4 = make_sr()
    for st in ("triaged", "assigned", "in_progress", "completed"):
        r = set_status(sr4["id"], st)
        assert r.status_code == 200 and r.json()["status"] == st, (st, r.text)


# 4) النافذة الزمنية للمؤشر: الافتراضية (30 يومًا) والمخصصة (window_from/window_to)
def test_indicator_excludes_measurements_outside_time_window(client, world, db):
    member = login(client, "o1m@t.dz")
    reviewer = login(client, "o1r@t.dz")
    p = make_project(client, member)

    now = datetime.now(timezone.utc)
    old_at = (now - timedelta(days=400)).isoformat()   # أقدم بكثير من النافذة الافتراضية

    def add_validated(value, measured_at):
        r = client.post("/api/measurements", json={
            "project_id": p["id"], "parameter": "flow_rate", "value": value, "unit": "L/s",
            "measured_at": measured_at, "source": "s", "method": "m"}, headers=member)
        assert r.status_code == 201, r.text
        m = r.json()
        review(client, reviewer, "measurement", m["id"])
        return m

    m_old = add_validated(1.0, old_at)     # validated لكن خارج النافذة الافتراضية
    m_new = add_validated(0.5, NOW)        # validated داخل النافذة

    # النافذة الافتراضية: القياس القديم مستبعد من القيمة ومن measurement_ids
    r = client.get(f"/api/projects/{p['id']}/indicators/WATER_FLOW_AVG_LS", headers=member)
    assert r.status_code == 200
    ind = r.json()
    assert ind["sufficient"] is True and abs(ind["value"] - 0.5) < 1e-6
    assert m_old["id"] not in ind["measurement_ids"]
    assert ind["measurement_ids"] == [m_new["id"]]
    assert ind["n_measurements"] == 1

    # نافذة مخصصة تغطي القياس القديم فقط → هو وحده الداخل في الحساب
    wfrom = (now - timedelta(days=500)).isoformat()
    wto = (now - timedelta(days=300)).isoformat()
    r = client.get(f"/api/projects/{p['id']}/indicators/WATER_FLOW_AVG_LS",
                   params={"window_from": wfrom, "window_to": wto}, headers=member)
    ind = r.json()
    assert ind["sufficient"] is True and abs(ind["value"] - 1.0) < 1e-6
    assert ind["measurement_ids"] == [m_old["id"]]
    assert ind["n_measurements"] == 1

    # نافذة مخصصة فارغة (لا قياسات داخلها) → بيانات غير كافية
    r = client.get(f"/api/projects/{p['id']}/indicators/WATER_FLOW_AVG_LS",
                   params={"window_from": (now - timedelta(days=900)).isoformat(),
                           "window_to": (now - timedelta(days=800)).isoformat()},
                   headers=member)
    ind = r.json()
    assert ind["sufficient"] is False and ind["value"] is None
    assert ind["measurement_ids"] == []


# 5) منع المراجعة المكررة: هدف validated/verified أو rejected لا يُراجَع ثانية (وحتى من مراجع آخر)
def test_reviewer_cannot_review_already_reviewed_target(client, world, db):
    from app.models import User
    from app.security import hash_password
    db.add(User(org_id=world["org1"].id, email="o1r2@t.dz",
                password_hash=hash_password("pass#1"),
                full_name="o1 reviewer2", role="reviewer"))
    db.commit()

    member = login(client, "o1m@t.dz")
    reviewer1 = login(client, "o1r@t.dz")
    reviewer2 = login(client, "o1r2@t.dz")
    p = make_project(client, member)

    # قياس اعتُمد (validated): مراجعة ثانية من المراجع نفسه ومن مراجع آخر مرفوضة
    m_ok = add_measurement(client, member, p["id"], 0.7)
    r = review_raw(client, reviewer1, "measurement", m_ok["id"], "accepted")
    assert r.status_code == 201
    r = review_raw(client, reviewer1, "measurement", m_ok["id"], "rejected")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "ALREADY_REVIEWED"
    r = review_raw(client, reviewer2, "measurement", m_ok["id"], "accepted")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "ALREADY_REVIEWED"

    # قياس مرفوض (rejected) نهائي أيضًا: لا إعادة مراجعة
    m_no = add_measurement(client, member, p["id"], 0.8)
    assert review_raw(client, reviewer1, "measurement", m_no["id"], "rejected").status_code == 201
    r = review_raw(client, reviewer2, "measurement", m_no["id"], "accepted")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "ALREADY_REVIEWED"

    # دليل اعتُمد (verified): مراجعة ثانية مرفوضة من أي مراجع
    e = add_evidence(client, member, p["id"])
    r = review_raw(client, reviewer1, "evidence", e["id"], "accepted")
    assert r.status_code == 201
    r = review_raw(client, reviewer2, "evidence", e["id"], "rejected")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "ALREADY_REVIEWED"


def test_unit_canonicalization_feeds_indicator(client, db, world):
    """قياس flow_rate بوحدة 'l/s' (يقبلها قاموس التحقق) يجب أن يدخل حساب المؤشر —
    يكشف عدم اتساق: التحقق يقبل l/s بينما الحساب كان يستبعدها بسبب حالة الأحرف."""
    from datetime import datetime, timedelta, timezone
    m = login(client, "o1m@t.dz")
    rev = login(client, "o1r@t.dz")
    r = client.post("/api/projects", headers=m,
                    json={"title": "unit-case", "domain": "water"})
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    r = client.post("/api/measurements", headers=m, json={
        "project_id": pid, "parameter": "flow_rate", "value": 9.0, "unit": "l/s",
        "measured_at": past, "source": "t", "method": "t", "source_type": "manual"})
    assert r.status_code == 201, r.text
    mid = r.json()["id"]
    r = client.post("/api/reviews", headers=rev, json={
        "target_type": "measurement", "target_id": mid,
        "decision": "accepted", "note": "ok", "reason": "ok"})
    assert r.status_code == 201, r.text
    r = client.get(f"/api/projects/{pid}/indicators/WATER_FLOW_AVG_LS", headers=rev)
    assert r.status_code == 200
    body = r.json()
    assert mid in body["measurement_ids"], f"unit 'l/s' excluded from indicator: {body}"
