"""اختبارات المرحلة 2 — محرك القرارات العام (Contract §26).

تغطية: CRUD، آلة الحالات (صحيح/خاطئ)، RBAC، فصل المهام، عزل المستأجرين،
IDOR، التدقيق، الأدلة، التنفيذ (مع الحماية من التكرار)، التحقق.
"""
import pytest

from app.models import User
from app.security import hash_password
from tests.conftest import login

API = "/api/decisions"


@pytest.fixture()
def admins(db, world):
    for org, prefix in ((world["org1"], "o1"), (world["org2"], "o2")):
        db.add(User(org_id=org.id, email=f"{prefix}a@t.dz",
                    password_hash=hash_password("pass#1"),
                    full_name=f"{prefix} admin", role="admin"))
    db.commit()
    return world


def _create(client, headers, **over):
    payload = {"domain": "water", "decision_type": "water_allocation_approval",
               "title": "قرار اختبار", "priority": "high", "risk_level": "medium",
               "subject_type": "water_allocation", "subject_id": 17,
               "expected_result": "نتيجة متوقعة"}
    payload.update(over)
    r = client.post(API, json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def _to(client, headers, did, to, **kw):
    return client.post(f"{API}/{did}/transition", json={"to": to, **kw}, headers=headers)


def _full_path_to_authorized(client, world):
    """إنشاء قرار ودفعه حتى EXECUTION_AUTHORIZED — يعيد (id, member_h, reviewer_h, admin_h)."""
    member_h = login(client, "o1m@t.dz")
    reviewer_h = login(client, "o1r@t.dz")
    admin_h = login(client, "o1a@t.dz")
    d = _create(client, member_h)
    assert _to(client, member_h, d["id"], "REVIEW_REQUIRED").status_code == 200
    assert _to(client, reviewer_h, d["id"], "APPROVED").status_code == 200
    assert _to(client, admin_h, d["id"], "EXECUTION_AUTHORIZED").status_code == 200
    return d["id"], member_h, reviewer_h, admin_h


# ---------- CRUD ----------
def test_crud_create_list_get(client, world):
    h = login(client, "o1m@t.dz")
    d = _create(client, h)
    assert d["status"] == "PROPOSED" and d["domain"] == "water"
    assert d["proposed_by"] == world["o1_member"].id

    lst = client.get(API, headers=h).json()
    assert any(x["id"] == d["id"] for x in lst)
    by_domain = client.get(API, params={"domain": "water"}, headers=h).json()
    assert any(x["id"] == d["id"] for x in by_domain)
    none = client.get(API, params={"domain": "energy"}, headers=h).json()
    assert all(x["id"] != d["id"] for x in none)

    got = client.get(f"{API}/{d['id']}", headers=h)
    assert got.status_code == 200 and got.json()["title"] == "قرار اختبار"


def test_patch_rules(client, world):
    member_h = login(client, "o1m@t.dz")
    reviewer_h = login(client, "o1r@t.dz")
    d = _create(client, member_h)

    # المقترح يعدّل في PROPOSED
    r = client.patch(f"{API}/{d['id']}", json={"title": "عنوان معدّل", "risk_level": "high"},
                     headers=member_h)
    assert r.status_code == 200 and r.json()["title"] == "عنوان معدّل"

    # مراجع (ليس المقترح وليس مديرًا) لا يعدّل
    r = client.patch(f"{API}/{d['id']}", json={"title": "x"}, headers=reviewer_h)
    assert r.status_code == 403

    # بعد الإحالة للمراجعة يُقفل التعديل
    assert _to(client, member_h, d["id"], "REVIEW_REQUIRED").status_code == 200
    r = client.patch(f"{API}/{d['id']}", json={"title": "y"}, headers=member_h)
    assert r.status_code == 409


def test_validation_422(client, world):
    h = login(client, "o1m@t.dz")
    r = client.post(API, json={"domain": "mars", "decision_type": "x", "title": "t"}, headers=h)
    assert r.status_code == 422
    r = client.post(API, json={"domain": "water", "decision_type": "x"}, headers=h)
    assert r.status_code == 422


# ---------- آلة الحالات ----------
def test_full_lifecycle_to_verified(client, admins):
    did, member_h, reviewer_h, admin_h = _full_path_to_authorized(client, admins)

    # EXECUTED يتطلب سجل تنفيذ ناجحًا
    r = _to(client, admin_h, did, "EXECUTED")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "EXECUTION_RECORD_REQUIRED"

    ex = client.post(f"{API}/{did}/execution",
                     json={"execution_type": "field_operation", "success": True,
                           "result": "تم التنفيذ الميداني وتسجيله"},
                     headers=admin_h)
    assert ex.status_code == 201, ex.text
    r = _to(client, admin_h, did, "EXECUTED")
    assert r.status_code == 200 and r.json()["status"] == "EXECUTED"
    assert r.json()["executed_by"] is not None and r.json()["executed_at"] is not None

    # VERIFIED يتطلب سجل تحقق PASSED
    r = _to(client, reviewer_h, did, "VERIFIED")
    assert r.status_code == 409 and r.json()["detail"]["code"] == "VERIFICATION_RECORD_REQUIRED"
    v = client.post(f"{API}/{did}/verification",
                    json={"verification_status": "PASSED",
                          "observed_result": "النتيجة مطابقة"},
                    headers=reviewer_h)
    assert v.status_code == 201, v.text
    r = _to(client, reviewer_h, did, "VERIFIED")
    assert r.status_code == 200 and r.json()["status"] == "VERIFIED"

    # سجل الانتقالات يوثّق المسار كاملًا (بما فيه الإنشاء)
    tr = client.get(f"{API}/{did}/transitions", headers=reviewer_h).json()
    seq = [(t["from_status"], t["to_status"]) for t in tr]
    assert ("", "PROPOSED") in seq
    assert ("PROPOSED", "REVIEW_REQUIRED") in seq
    assert ("REVIEW_REQUIRED", "APPROVED") in seq
    assert ("APPROVED", "EXECUTION_AUTHORIZED") in seq
    assert ("EXECUTION_AUTHORIZED", "EXECUTED") in seq
    assert ("EXECUTED", "VERIFIED") in seq
    assert all(t["actor_id"] and t["actor_role"] for t in tr)


def test_invalid_transitions_rejected_409(client, admins):
    did, member_h, reviewer_h, admin_h = _full_path_to_authorized(client, admins)
    for bad in ("PROPOSED", "REVIEW_REQUIRED", "APPROVED", "VERIFIED"):
        r = _to(client, admin_h, did, bad)
        assert r.status_code == 409, (bad, r.text)
    # لم يتغير شيء
    d = client.get(f"{API}/{did}", headers=admin_h).json()
    assert d["status"] == "EXECUTION_AUTHORIZED"

    # عكسي ممنوع: REVIEW_REQUIRED → PROPOSED
    member_h2 = login(client, "o1m@t.dz")
    d2 = _create(client, member_h2)
    _to(client, member_h2, d2["id"], "REVIEW_REQUIRED")
    r = _to(client, member_h2, d2["id"], "PROPOSED")
    assert r.status_code == 409


def test_cancel_paths(client, admins):
    # PROPOSED → CANCELLED من المقترح نفسه
    member_h = login(client, "o1m@t.dz")
    reviewer_h = login(client, "o1r@t.dz")
    d = _create(client, member_h)
    r = _to(client, member_h, d["id"], "CANCELLED")
    assert r.status_code == 200 and r.json()["status"] == "CANCELLED"
    assert r.json()["cancelled_at"] is not None

    # REVIEW_REQUIRED → CANCELLED من مراجع
    d2 = _create(client, member_h)
    _to(client, member_h, d2["id"], "REVIEW_REQUIRED")
    r = _to(client, reviewer_h, d2["id"], "CANCELLED")
    assert r.status_code == 200

    # الملغى مغلق نهائيًا — لا انتقالات منه
    r = _to(client, reviewer_h, d2["id"], "APPROVED")
    assert r.status_code == 409


# ---------- RBAC وفصل المهام ----------
def test_rbac_enforced_server_side(client, admins):
    member_h = login(client, "o1m@t.dz")
    reviewer_h = login(client, "o1r@t.dz")
    admin_h = login(client, "o1a@t.dz")
    d = _create(client, member_h)

    # عضو لا يعتمد
    _to(client, member_h, d["id"], "REVIEW_REQUIRED")
    r = _to(client, member_h, d["id"], "APPROVED")
    assert r.status_code == 403 and r.json()["detail"]["code"] == "ROLE_FORBIDDEN"

    # فصل المهام: المقترح لا يعتمد قراره حتى لو كان مديرًا
    d_admin = _create(client, admin_h)
    _to(client, admin_h, d_admin["id"], "REVIEW_REQUIRED")
    r = _to(client, admin_h, d_admin["id"], "APPROVED")
    assert r.status_code == 403 and r.json()["detail"]["code"] == "SEPARATION_OF_DUTIES"

    # مراجع لا يخوّل التنفيذ (admin فقط)
    assert _to(client, reviewer_h, d["id"], "APPROVED").status_code == 200
    r = _to(client, reviewer_h, d["id"], "EXECUTION_AUTHORIZED")
    assert r.status_code == 403

    # عضو لا يسجّل تنفيذًا ولا تحققًا
    assert _to(client, admin_h, d["id"], "EXECUTION_AUTHORIZED").status_code == 200
    r = client.post(f"{API}/{d['id']}/execution",
                    json={"execution_type": "x", "success": True}, headers=member_h)
    assert r.status_code == 403
    r = client.post(f"{API}/{d['id']}/verification",
                    json={"verification_status": "PASSED"}, headers=member_h)
    assert r.status_code == 403


# ---------- عزل المستأجرين وIDOR ----------
def test_tenant_isolation_and_idor(client, admins):
    o1_member = login(client, "o1m@t.dz")
    o2_member = login(client, "o2m@t.dz")
    o2_reviewer = login(client, "o2r@t.dz")
    o2_admin = login(client, "o2a@t.dz")
    d = _create(client, o1_member)

    # القائمة لا تُظهر قرارات المؤسسة الأخرى
    lst2 = client.get(API, headers=o2_member).json()
    assert all(x["id"] != d["id"] for x in lst2)

    # كل محاولات الوصول المباشر (IDOR) → 404
    assert client.get(f"{API}/{d['id']}", headers=o2_member).status_code == 404
    assert _to(client, o2_reviewer, d["id"], "CANCELLED").status_code == 404
    assert client.get(f"{API}/{d['id']}/evidence", headers=o2_member).status_code == 404
    assert client.post(f"{API}/{d['id']}/evidence",
                       json={"evidence_type": "manual_observation"},
                       headers=o2_member).status_code == 404
    assert client.get(f"{API}/{d['id']}/execution", headers=o2_admin).status_code == 404
    assert client.post(f"{API}/{d['id']}/execution",
                       json={"execution_type": "x", "success": True},
                       headers=o2_admin).status_code == 404
    assert client.get(f"{API}/{d['id']}/verification", headers=o2_reviewer).status_code == 404
    assert client.post(f"{API}/{d['id']}/verification",
                       json={"verification_status": "PASSED"},
                       headers=o2_reviewer).status_code == 404


# ---------- الأدلة ----------
def test_evidence_crud_and_closure(client, world):
    member_h = login(client, "o1m@t.dz")
    d = _create(client, member_h)
    r = client.post(f"{API}/{d['id']}/evidence",
                    json={"evidence_type": "measurement", "value": 42.5, "unit": "m3",
                          "source_type": "well", "source_id": "12", "quality": "good"},
                    headers=member_h)
    assert r.status_code == 201, r.text
    ev = client.get(f"{API}/{d['id']}/evidence", headers=member_h).json()
    assert len(ev) == 1 and ev[0]["evidence_type"] == "measurement"

    # نوع دليل غير مدعوم → 422
    r = client.post(f"{API}/{d['id']}/evidence",
                    json={"evidence_type": "dream"}, headers=member_h)
    assert r.status_code == 422

    # قرار ملغى لا يقبل أدلة
    _to(client, member_h, d["id"], "CANCELLED")
    r = client.post(f"{API}/{d['id']}/evidence",
                    json={"evidence_type": "rule"}, headers=member_h)
    assert r.status_code == 409


# ---------- التنفيذ: حالة + حماية من التكرار ----------
def test_execution_state_gate_and_idempotency(client, admins):
    member_h = login(client, "o1m@t.dz")
    admin_h = login(client, "o1a@t.dz")
    d = _create(client, member_h)

    # التسجيل قبل التخويل → 409
    r = client.post(f"{API}/{d['id']}/execution",
                    json={"execution_type": "x", "success": True}, headers=admin_h)
    assert r.status_code == 409

    did, _, _, admin_h = _full_path_to_authorized(client, admins)
    payload = {"execution_type": "field_operation", "success": True,
               "result_code": "DONE"}
    r1 = client.post(f"{API}/{did}/execution", json=payload,
                     headers={**admin_h, "Idempotency-Key": "exec-abc-1"})
    r2 = client.post(f"{API}/{did}/execution", json=payload,
                     headers={**admin_h, "Idempotency-Key": "exec-abc-1"})
    assert r1.status_code == 201
    assert r2.status_code == 200  # نفس السجل، لا نسخة ثانية
    assert r1.json()["id"] == r2.json()["id"]
    ex = client.get(f"{API}/{did}/execution", headers=admin_h).json()
    assert len(ex) == 1


# ---------- التحقق ----------
def test_verification_rules(client, admins):
    did, member_h, reviewer_h, admin_h = _full_path_to_authorized(client, admins)

    # لا تحقق قبل التنفيذ
    r = client.post(f"{API}/{did}/verification",
                    json={"verification_status": "PASSED"}, headers=reviewer_h)
    assert r.status_code == 409

    client.post(f"{API}/{did}/execution",
                json={"execution_type": "field_operation", "success": True},
                headers=admin_h)
    _to(client, admin_h, did, "EXECUTED")

    # تحقق FAILED مسموح كسجل لكنه لا يفتح VERIFIED
    v = client.post(f"{API}/{did}/verification",
                    json={"verification_status": "FAILED",
                          "observed_result": "غير مطابق"}, headers=reviewer_h)
    assert v.status_code == 201
    r = _to(client, reviewer_h, did, "VERIFIED")
    assert r.status_code == 409

    # PASSED يفتح VERIFIED
    client.post(f"{API}/{did}/verification",
                json={"verification_status": "PASSED"}, headers=reviewer_h)
    r = _to(client, reviewer_h, did, "VERIFIED")
    assert r.status_code == 200 and r.json()["status"] == "VERIFIED"


# ---------- التدقيق ----------
def test_audit_trail(client, admins):
    did, member_h, reviewer_h, admin_h = _full_path_to_authorized(client, admins)
    client.post(f"{API}/{did}/evidence",
                json={"evidence_type": "inspection"}, headers=member_h)
    client.post(f"{API}/{did}/execution",
                json={"execution_type": "field_operation", "success": True}, headers=admin_h)

    logs = client.get("/api/audit", headers=admin_h).json()
    pairs = {(l["action"], l["entity_type"]) for l in logs}
    assert ("create", "gov_decision") in pairs
    assert ("transition", "gov_decision") in pairs
    assert ("create", "gov_decision_evidence") in pairs
    assert ("create", "gov_decision_execution") in pairs
    # قيد الانتقال يحمل from/to
    tr_log = [l for l in logs if l["entity_type"] == "gov_decision"
              and l["action"] == "transition"][0]
    assert tr_log["meta"]["to"] == "EXECUTION_AUTHORIZED"
