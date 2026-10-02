"""اختبارات القبول الإلزامية لمنصة FOGGARA-DZ."""
from datetime import datetime, timezone

from tests.conftest import login

NOW = datetime.now(timezone.utc).isoformat()


def make_project(client, headers, title="مشروع اختبار"):
    r = client.post("/api/projects", json={"title": title, "domain": "water"}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def add_measurement(client, headers, project_id, value=1.2, unit="L/s"):
    r = client.post("/api/measurements", json={
        "project_id": project_id, "parameter": "flow_rate", "value": value, "unit": unit,
        "measured_at": NOW, "source": "مصدر اختبار", "method": "طريقة اختبار",
    }, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def add_evidence(client, headers, project_id, measurement_id=None):
    body = {"project_id": project_id, "title": "دليل اختبار", "doc_type": "report",
            "license": "CC0"}
    if measurement_id:
        body["measurement_id"] = measurement_id
    r = client.post("/api/evidences", json=body, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def review(client, headers, target_type, target_id, decision="accepted"):
    r = client.post("/api/reviews", json={
        "target_type": target_type, "target_id": target_id,
        "decision": decision, "note": "ملاحظة مراجعة", "reason": "سبب القرار",
    }, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


# 1) سير العمل الكامل: مشروع → قياس → دليل → مراجعة → مؤشر → توصية → قرار → إجراء → متابعة
def test_full_workflow(client, world, db):
    member = login(client, "o1m@t.dz")
    reviewer = login(client, "o1r@t.dz")

    p = make_project(client, member)
    assert p["status"] == "draft"
    r = client.patch(f"/api/projects/{p['id']}", json={"status": "active"}, headers=member)
    assert r.status_code == 200 and r.json()["status"] == "active"

    m1 = add_measurement(client, member, p["id"], 0.4)
    m2 = add_measurement(client, member, p["id"], 0.6)
    e = add_evidence(client, member, p["id"], m1["id"])
    assert e["status"] == "submitted"  # verified ليست افتراضية

    review(client, reviewer, "measurement", m1["id"])
    review(client, reviewer, "measurement", m2["id"])
    review(client, reviewer, "evidence", e["id"])

    r = client.get(f"/api/projects/{p['id']}/measurements", headers=member)
    assert all(m["quality_status"] == "validated" for m in r.json())
    r = client.get(f"/api/evidences/{e['id']}", headers=member)
    assert r.json()["status"] == "verified"

    r = client.get(f"/api/projects/{p['id']}/indicators/WATER_FLOW_AVG_LS", headers=member)
    assert r.status_code == 200
    ind = r.json()
    assert ind["sufficient"] is True and abs(ind["value"] - 0.5) < 1e-6

    r = client.post(f"/api/projects/{p['id']}/recommendations/generate", headers=member)
    assert r.status_code == 201, r.text
    rec = r.json()
    assert rec["evidence_ids"] == [e["id"]]
    assert "threshold" in rec["basis"]

    r = client.post(f"/api/recommendations/{rec['id']}/decisions",
                    json={"decision": "approved", "rationale": "قرار بشري موثق"}, headers=reviewer)
    assert r.status_code == 201
    dec = r.json()

    r = client.post("/api/actions", json={
        "project_id": p["id"], "decision_id": dec["id"], "title": "فحص القنوات",
        "assignee": "فريق الصيانة"}, headers=member)
    assert r.status_code == 201
    act = r.json()
    r = client.patch(f"/api/actions/{act['id']}",
                     json={"status": "done", "result_note": "تم الفحص والتنظيف"}, headers=member)
    assert r.status_code == 200 and r.json()["status"] == "done"

    r = client.get(f"/api/projects/{p['id']}/history", headers=member)
    actions = [h["action"] for h in r.json()]
    for expected in ("create", "update", "review", "decide", "generate"):
        assert expected in actions


# 2) عزل المؤسسات عبر API حتى بمعرفة المعرّف
def test_cross_org_isolation(client, world, db):
    member1 = login(client, "o1m@t.dz")
    member2 = login(client, "o2m@t.dz")
    p = make_project(client, member1)
    m = add_measurement(client, member1, p["id"])
    e = add_evidence(client, member1, p["id"], m["id"])

    assert client.get(f"/api/projects/{p['id']}", headers=member2).status_code == 404
    assert client.patch(f"/api/projects/{p['id']}", json={"title": "x"}, headers=member2).status_code == 404
    assert client.get(f"/api/evidences/{e['id']}", headers=member2).status_code == 404
    assert client.get(f"/api/measurements/{m['id']}", headers=member2).status_code == 404
    assert client.get(f"/api/projects/{p['id']}/measurements", headers=member2).status_code == 404
    r = client.get("/api/projects", headers=member2)
    assert all(x["id"] != p["id"] for x in r.json()["items"])

    # مراجع مؤسسة أخرى لا يستطيع مراجعة هدف المؤسسة الأولى
    reviewer2 = login(client, "o2r@t.dz")
    r = client.post("/api/reviews", json={"target_type": "measurement", "target_id": m["id"],
                                          "decision": "accepted", "note": "n", "reason": "r"},
                    headers=reviewer2)
    assert r.status_code == 404


# 3) لا مؤشر من قياسات ناقصة أو غير متحقق منها
def test_indicator_requires_validated_data(client, world, db):
    member = login(client, "o1m@t.dz")
    p = make_project(client, member)

    # لا قياسات إطلاقًا
    r = client.get(f"/api/projects/{p['id']}/indicators/WATER_FLOW_AVG_LS", headers=member)
    assert r.json()["sufficient"] is False and r.json()["value"] is None

    # قياسات pending فقط (غير متحقق منها)
    add_measurement(client, member, p["id"], 2.0)
    r = client.get(f"/api/projects/{p['id']}/indicators/WATER_FLOW_AVG_LS", headers=member)
    assert r.json()["sufficient"] is False and r.json()["value"] is None

    # لا توصية دون بيانات كافية
    r = client.post(f"/api/projects/{p['id']}/recommendations/generate", headers=member)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "INSUFFICIENT_DATA"


# 4) المستفيد العادي لا يستطيع منح verified لنفسه
def test_member_cannot_verify(client, world, db):
    member = login(client, "o1m@t.dz")
    p = make_project(client, member)
    e = add_evidence(client, member, p["id"])

    r = client.post("/api/reviews", json={"target_type": "evidence", "target_id": e["id"],
                                          "decision": "accepted", "note": "n", "reason": "r"},
                    headers=member)
    assert r.status_code == 403

    # حتى المراجع لا يتحقق من دليل قدّمه بنفسه
    reviewer = login(client, "o1r@t.dz")
    p2 = make_project(client, reviewer, "مشروع المراجع")
    e2 = add_evidence(client, reviewer, p2["id"])
    r = client.post("/api/reviews", json={"target_type": "evidence", "target_id": e2["id"],
                                          "decision": "accepted", "note": "n", "reason": "r"},
                    headers=reviewer)
    assert r.status_code == 403 and r.json()["detail"]["code"] == "SELF_REVIEW_FORBIDDEN"


# 5) رفض القيم والوحدات غير الصالحة برسالة مفهومة
def test_invalid_measurements_rejected(client, world, db):
    member = login(client, "o1m@t.dz")
    p = make_project(client, member)

    r = client.post("/api/measurements", json={
        "project_id": p["id"], "parameter": "flow_rate", "value": 1.0, "unit": "kg",
        "measured_at": NOW, "source": "s", "method": "m"}, headers=member)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "INVALID_UNIT"

    r = client.post("/api/measurements", json={
        "project_id": p["id"], "parameter": "ph", "value": 99.0, "unit": "pH",
        "measured_at": NOW, "source": "s", "method": "m"}, headers=member)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "VALUE_OUT_OF_RANGE"

    r = client.post("/api/measurements", json={
        "project_id": p["id"], "parameter": "flow_rate", "value": -3.0, "unit": "L/s",
        "measured_at": NOW, "source": "s", "method": "m"}, headers=member)
    assert r.status_code == 422


# 6) حالة الدليل لا تكون verified افتراضيًا ولا يمكن فرضها عبر الإنشاء
def test_evidence_default_status(client, world, db):
    member = login(client, "o1m@t.dz")
    p = make_project(client, member)
    e = add_evidence(client, member, p["id"])
    assert e["status"] == "submitted"


# 7) المصادقة مطلوبة
def test_auth_required(client, world, db):
    assert client.get("/api/projects").status_code in (401, 403)
    r = client.post("/api/auth/login", json={"email": "o1m@t.dz", "password": "wrong"})
    assert r.status_code == 401
