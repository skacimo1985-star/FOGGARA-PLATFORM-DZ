"""اختبارات المرحلة 3 — القياس عن بُعد + المحاكي الحتمي (Phase 03 §34).

تغطية: حتمية المحاكي، السيناريوهات، الحدود، الاستيعاب، التحقق، الوحدات،
الطوابع الزمنية، منع التكرار، التجميع، القواعد، التكامل مع محرك القرارات،
عزل المستأجرين، IDOR، RBAC.
"""
import pytest

from app.models import User
from app.security import hash_password
from tests.conftest import login

TEL = "/api/telemetry"
SIM = "/api/simulator"
RULES = "/api/telemetry-rules"


@pytest.fixture()
def admins(db, world):
    for org, prefix in ((world["org1"], "o1"), (world["org2"], "o2")):
        db.add(User(org_id=org.id, email=f"{prefix}a@t.dz",
                    password_hash=hash_password("pass#1"),
                    full_name=f"{prefix} admin", role="admin"))
    db.commit()
    return world


def _device(client, h, name="جهاز اختبار"):
    site = client.post("/api/sites", json={
        "name": f"{name} site", "wilaya": "Laghouat", "lat": 33.8, "lon": 2.9
    }, headers=h)
    assert site.status_code == 201, site.text
    well = client.post("/api/water/wells", json={
        "site_id": site.json()["id"], "name": f"{name} well", "depth_m": 40
    }, headers=h)
    assert well.status_code == 201, well.text
    r = client.post(f"{TEL}/devices", json={
        "name": name, "device_type": "well_controller",
        "subject_type": "well", "subject_id": well.json()["id"]}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def _sensor(client, h, device_id, metric="water_level", sensor_type="water_level",
            unit="m", min_value=0, max_value=10, base=5.0):
    r = client.post(f"{TEL}/sensors", json={
        "device_id": device_id, "name": f"مستشعر {metric}", "sensor_type": sensor_type,
        "metric": metric, "unit": unit, "min_value": min_value, "max_value": max_value,
        "configuration": {"base_value": base}}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def _run(client, h, device_id, scenario="NORMAL", seed=42, steps=10,
         step_seconds=3600, start="2026-01-01T00:00:00Z"):
    r = client.post(f"{SIM}/runs", json={
        "device_id": device_id, "scenario": scenario, "seed": seed,
        "steps": steps, "step_seconds": step_seconds, "start_time": start}, headers=h)
    assert r.status_code == 201, r.text
    return r.json()


def _exec(client, h, run_id):
    return client.post(f"{SIM}/runs/{run_id}/run", headers=h)


def _series(client, h, sensor_id):
    return client.get(f"{TEL}/series", params={"sensor_id": sensor_id,
                                               "limit": 1000}, headers=h).json()


# ---------- المحاكي ----------
def test_simulator_determinism_same_seed(admins, client):
    h = login(client, "o1r@t.dz")
    dev = _device(client, h)
    s1 = _sensor(client, h, dev["id"])
    r1 = _run(client, h, dev["id"], seed=42, start="2026-01-01T00:00:00Z")
    assert _exec(client, h, r1["id"]).status_code == 200
    v1 = [p["value"] for p in _series(client, h, s1["id"])]

    # نفس المدخلات (بداية زمنية مختلفة لتفادي هوية الاستيعاب) → نفس القيم
    r2 = _run(client, h, dev["id"], seed=42, start="2026-02-01T00:00:00Z")
    assert _exec(client, h, r2["id"]).status_code == 200
    v2 = [p["value"] for p in _series(client, h, s1["id"])
          if p["simulation_run_id"] == r2["id"]]
    assert v1 == v2 and len(v1) == 10

    # بذرة مختلفة → تسلسل مختلف حتميًا
    r3 = _run(client, h, dev["id"], seed=43, start="2026-03-01T00:00:00Z")
    assert _exec(client, h, r3["id"]).status_code == 200
    v3 = [p["value"] for p in _series(client, h, s1["id"])
          if p["simulation_run_id"] == r3["id"]]
    assert v3 != v1


def test_simulator_scenarios_behavior(admins, client):
    h = login(client, "o1r@t.dz")
    dev = _device(client, h)
    s_level = _sensor(client, h, dev["id"], base=5.0)
    _sensor(client, h, dev["id"], metric="flow_rate", sensor_type="flow_rate",
            unit="L/s", min_value=0, max_value=30, base=12.0)

    # LOW_WATER: هبوط تدريجي
    r = _run(client, h, dev["id"], scenario="LOW_WATER", seed=7)
    res = _exec(client, h, r["id"])
    assert res.status_code == 200 and res.json()["run"]["status"] == "COMPLETED"
    lv = [p["value"] for p in _series(client, h, s_level["id"])
          if p["simulation_run_id"] == r["id"]]
    assert lv[0] > lv[-1] and abs(lv[-1] - 1.5) < 0.01  # 5 × (1-0.7)

    # SENSOR_FAILURE: قراءات MISSING وINVALID بنمط حتمي
    r2 = _run(client, h, dev["id"], scenario="SENSOR_FAILURE", seed=7,
              start="2026-02-01T00:00:00Z")
    _exec(client, h, r2["id"])
    rows = _series(client, h, s_level["id"])
    failed = [p for p in rows if p["simulation_run_id"] == r2["id"]]
    assert any(p["quality"] == "MISSING" and p["value"] is None for p in failed)
    assert any(p["quality"] == "INVALID" for p in failed)


def test_simulator_limits_and_validation(admins, client):
    h = login(client, "o1r@t.dz")
    dev = _device(client, h)
    # سيناريو غير مسموح / بذرة سالبة / تجاوز الحد الأقصى للخطوات
    assert client.post(f"{SIM}/runs", json={"device_id": dev["id"],
                       "scenario": "HACK", "seed": 1, "steps": 5,
                       "step_seconds": 60}, headers=h).status_code == 422
    assert client.post(f"{SIM}/runs", json={"device_id": dev["id"],
                       "scenario": "NORMAL", "seed": -1, "steps": 5,
                       "step_seconds": 60}, headers=h).status_code == 422
    assert client.post(f"{SIM}/runs", json={"device_id": dev["id"],
                       "scenario": "NORMAL", "seed": 1, "steps": 1001,
                       "step_seconds": 60}, headers=h).status_code == 422
    # إعادة تنفيذ تشغيلة مكتملة → 409 (لا تكرار)
    _sensor(client, h, dev["id"])
    r = _run(client, h, dev["id"], steps=3)
    assert _exec(client, h, r["id"]).status_code == 200
    assert _exec(client, h, r["id"]).status_code == 409
    d = client.get(f"{SIM}/runs/{r['id']}", headers=h).json()
    assert d["status"] == "COMPLETED" and d["generated_count"] == 3


def test_simulator_rbac(admins, client):
    member_h = login(client, "o1m@t.dz")
    reviewer_h = login(client, "o1r@t.dz")
    dev = _device(client, reviewer_h)
    # عضو لا ينشئ ولا ينفذ تشغيلات
    assert client.post(f"{SIM}/runs", json={"device_id": dev["id"],
                       "scenario": "NORMAL", "seed": 1, "steps": 5,
                       "step_seconds": 60}, headers=member_h).status_code == 403
    r = _run(client, reviewer_h, dev["id"], steps=2)
    assert _exec(client, member_h, r["id"]).status_code == 403


# ---------- الاستيعاب والتحقق ----------
def test_ingestion_validation_and_duplicates(admins, client):
    h = login(client, "o1m@t.dz")
    dev = _device(client, h)
    s = _sensor(client, h, dev["id"], min_value=0, max_value=10)

    # قراءة صحيحة → VALID
    r = client.post(f"{TEL}/ingest", json={"sensor_id": s["id"], "value": 4.2,
                    "observed_at": "2026-01-01T10:00:00Z"}, headers=h)
    assert r.status_code == 201 and r.json()["quality"] == "VALID"
    first_id = r.json()["id"]

    # خارج المجال → تُخزَّن موسومة INVALID (لا قبول صامت)
    r = client.post(f"{TEL}/ingest", json={"sensor_id": s["id"], "value": 99.0,
                    "observed_at": "2026-01-01T11:00:00Z"}, headers=h)
    assert r.status_code == 201 and r.json()["quality"] == "INVALID"

    # طابع مستقبلي → INVALID
    r = client.post(f"{TEL}/ingest", json={"sensor_id": s["id"], "value": 4.0,
                    "observed_at": "2999-01-01T00:00:00Z"}, headers=h)
    assert r.json()["quality"] == "INVALID"

    # تكرار نفس (sensor, observed_at) → نفس السجل، لا نسخة
    r1 = client.post(f"{TEL}/ingest", json={"sensor_id": s["id"], "value": 4.2,
                     "observed_at": "2026-01-01T10:00:00Z"}, headers=h)
    assert r1.status_code == 200 and r1.json()["id"] == first_id
    lst = client.get(TEL, params={"sensor_id": s["id"]}, headers=h).json()
    at_ten = [x for x in lst if x["observed_at"].startswith("2026-01-01T10:00")]
    assert len(at_ten) == 1

    # التحقق التجريبي دون تخزين
    v = client.post(f"{TEL}/validate", json={"sensor_id": s["id"], "value": 50.0,
                    "observed_at": "2026-01-01T12:00:00Z"}, headers=h)
    assert v.status_code == 200 and v.json()["valid"] is False
    assert "VALUE_ABOVE_MAX" in v.json()["errors"]

    # مستشعر غير موجود → 404
    assert client.post(f"{TEL}/ingest", json={"sensor_id": 9999, "value": 1,
                       "observed_at": "2026-01-01T10:00:00Z"}, headers=h).status_code == 404


def test_vendor_neutral_edge_ingestion(admins, client):
    h = login(client, "o1m@t.dz")
    dev = _device(client, h)
    s = _sensor(client, h, dev["id"], min_value=0, max_value=10)
    body = {"sensor_id": s["id"], "value": 4.6, "observed_at": "2026-01-02T10:00:00Z",
            "gateway": "thingsboard_gateway", "external_device_id": "agri-node-01",
            "external_message_id": "msg-001"}
    r = client.post(f"{TEL}/edge/ingest", json=body, headers=h)
    assert r.status_code == 201, r.text
    assert r.json()["quality"] == "VALID"
    assert r.json()["source"] == "api"
    first = r.json()["id"]
    duplicate = client.post(f"{TEL}/edge/ingest", json=body, headers=h)
    assert duplicate.status_code == 200
    assert duplicate.json()["id"] == first


def test_edge_ingestion_is_tenant_isolated_and_gateway_is_allowlisted(admins, client):
    h1 = login(client, "o1m@t.dz")
    h2 = login(client, "o2m@t.dz")
    dev = _device(client, h1)
    s = _sensor(client, h1, dev["id"])
    body = {"sensor_id": s["id"], "value": 4.0, "observed_at": "2026-01-03T10:00:00Z", "gateway": "mqtt"}
    assert client.post(f"{TEL}/edge/ingest", json=body, headers=h2).status_code == 404
    bad = dict(body, gateway="untrusted-vendor")
    assert client.post(f"{TEL}/edge/ingest", json=bad, headers=h1).status_code == 422


def test_unit_enforcement(admins, client):
    h = login(client, "o1m@t.dz")
    dev = _device(client, h)
    r = client.post(f"{TEL}/sensors", json={
        "device_id": dev["id"], "name": "x", "sensor_type": "flow_rate",
        "metric": "flow_rate", "unit": "furlong/fortnight"}, headers=h)
    assert r.status_code == 422


# ---------- التجميع ----------
def test_aggregation_exact(admins, client):
    h = login(client, "o1m@t.dz")
    dev = _device(client, h)
    s = _sensor(client, h, dev["id"])
    for i, v in enumerate([2.0, 4.0, 6.0]):
        r = client.post(f"{TEL}/ingest", json={
            "sensor_id": s["id"], "value": v,
            "observed_at": f"2026-01-0{i+1}T00:00:00Z"}, headers=h)
        assert r.status_code == 201
    agg = client.get(f"{TEL}/aggregate", params={"sensor_id": s["id"]}, headers=h).json()
    assert agg["count"] == 3 and agg["min"] == 2.0 and agg["max"] == 6.0
    assert agg["sum"] == 12.0 and agg["avg"] == 4.0 and agg["latest"] == 6.0
    assert agg["unit"] == "m"

    # نطاق زمني مفرط → 422
    r = client.get(f"{TEL}/aggregate", params={
        "sensor_id": s["id"], "from": "2020-01-01T00:00:00Z",
        "to": "2026-01-01T00:00:00Z"}, headers=h)
    assert r.status_code == 422


# ---------- القواعد + التكامل مع محرك القرارات ----------
def test_rule_triggers_proposal_only(admins, client):
    reviewer_h = login(client, "o1r@t.dz")
    admin_h = login(client, "o1a@t.dz")
    dev = _device(client, reviewer_h)
    _sensor(client, reviewer_h, dev["id"], base=5.0)  # water_level 5→1.5

    # إدارة القواعد للمدير فقط
    assert client.post(RULES, json={
        "name": "قاعدة", "domain": "water", "metric": "water_level",
        "operator": "LT", "threshold": 2.0, "unit": "m",
        "decision_type": "water_level_warning"}, headers=reviewer_h).status_code == 403
    r = client.post(RULES, json={
        "name": "تحذير مستوى", "domain": "water", "metric": "water_level",
        "operator": "LT", "threshold": 2.0, "unit": "m", "severity": "high",
        "decision_type": "water_level_warning"}, headers=admin_h)
    assert r.status_code == 201

    # LOW_WATER يهبط دون العتبة → اقتراح PROPOSED
    run = _run(client, reviewer_h, dev["id"], scenario="LOW_WATER", seed=5)
    res = _exec(client, reviewer_h, run["id"]).json()
    assert len(res["proposals"]) == 1
    prop = res["proposals"][0]
    assert prop["status"] == "PROPOSED"           # اقتراح فقط — §23/§25
    assert prop["approved_by"] is None and prop["authorized_by"] is None
    assert prop["executed_by"] is None and prop["verified_by"] is None
    assert prop["domain"] == "water" and prop["risk_level"] == "high"
    assert prop["subject_type"] == "well"

    # السلسلة: telemetry → evidence → decision
    ev = client.get(f"/api/decisions/{prop['id']}/evidence", headers=reviewer_h).json()
    assert len(ev) == 1 and ev[0]["evidence_type"] == "measurement"
    assert ev[0]["source_type"] == "telemetry"
    assert 0 < ev[0]["value"] < 2.0  # أول قراءة دون العتبة


def test_rule_dedup_and_non_triggering(admins, client):
    reviewer_h = login(client, "o1r@t.dz")
    admin_h = login(client, "o1a@t.dz")
    dev = _device(client, reviewer_h)
    _sensor(client, reviewer_h, dev["id"], base=5.0)
    client.post(RULES, json={
        "name": "تحذير مستوى", "domain": "water", "metric": "water_level",
        "operator": "LT", "threshold": 2.0, "unit": "m",
        "decision_type": "water_level_warning"}, headers=admin_h)

    # تشغيلتان متجاوزتان للعتبة → اقتراح واحد فقط (منع التكرار)
    r1 = _run(client, reviewer_h, dev["id"], scenario="LOW_WATER", seed=5)
    n1 = len(_exec(client, reviewer_h, r1["id"]).json()["proposals"])
    r2 = _run(client, reviewer_h, dev["id"], scenario="LOW_WATER", seed=5,
              start="2026-02-01T00:00:00Z")
    n2 = len(_exec(client, reviewer_h, r2["id"]).json()["proposals"])
    assert n1 == 1 and n2 == 0

    # NORMAL لا يتجاوز العتبة → لا اقتراحات
    r3 = _run(client, reviewer_h, dev["id"], scenario="NORMAL", seed=5,
              start="2026-03-01T00:00:00Z")
    assert len(_exec(client, reviewer_h, r3["id"]).json()["proposals"]) == 0


def test_rule_operators_unit(admins, client):
    """عوامل المقارنة الستة — تقييم حتمي مباشر عبر الخدمة."""
    from app.services.telemetry_service import _OPERATORS
    assert _OPERATORS["GT"](5, 4) and not _OPERATORS["GT"](4, 4)
    assert _OPERATORS["GTE"](4, 4) and not _OPERATORS["GTE"](3, 4)
    assert _OPERATORS["LT"](3, 4) and not _OPERATORS["LT"](4, 4)
    assert _OPERATORS["LTE"](4, 4) and not _OPERATORS["LTE"](5, 4)
    assert _OPERATORS["EQ"](4, 4) and not _OPERATORS["EQ"](4, 5)
    assert _OPERATORS["NEQ"](4, 5) and not _OPERATORS["NEQ"](4, 4)


# ---------- الأمن ----------
def test_tenant_isolation_and_idor(admins, client):
    o1 = login(client, "o1r@t.dz")
    o1a = login(client, "o1a@t.dz")
    o2 = login(client, "o2r@t.dz")
    o2a = login(client, "o2a@t.dz")
    dev = _device(client, o1)
    s = _sensor(client, o1, dev["id"])
    run = _run(client, o1, dev["id"], steps=2)
    _exec(client, o1, run["id"])
    reading = _series(client, o1, s["id"])[0]
    rule = client.post(RULES, json={
        "name": "قاعدة org1", "domain": "water", "metric": "water_level",
        "operator": "LT", "threshold": 2.0, "unit": "m",
        "decision_type": "water_level_warning"}, headers=o1a).json()

    # قوائم org2 فارغة من أصول org1
    assert all(d["id"] != dev["id"] for d in client.get(f"{TEL}/devices", headers=o2).json())
    assert all(x["id"] != s["id"] for x in client.get(f"{TEL}/sensors", headers=o2).json())
    assert all(r["id"] != run["id"] for r in client.get(f"{SIM}/runs", headers=o2).json())

    # IDOR — كل الوصول المباشر مرفوض 404
    assert client.get(f"{TEL}/{reading['id']}", headers=o2).status_code == 404
    assert client.get(f"{TEL}/series", params={"sensor_id": s["id"]},
                      headers=o2).status_code == 404
    assert client.get(f"{TEL}/aggregate", params={"sensor_id": s["id"]},
                      headers=o2).status_code == 404
    assert client.post(f"{TEL}/ingest", json={"sensor_id": s["id"], "value": 1,
                       "observed_at": "2026-01-01T00:00:00Z"}, headers=o2).status_code == 404
    assert client.get(f"{SIM}/runs/{run['id']}", headers=o2).status_code == 404
    assert _exec(client, o2, run["id"]).status_code == 404
    # قواعد org1 غير مرئية/قابلة للتعديل من org2
    assert all(r["id"] != rule["id"] for r in client.get(RULES, headers=o2a).json())
    assert client.patch(f"{RULES}/{rule['id']}", json={"enabled": False},
                        headers=o2a).status_code == 404


def test_unauthenticated_rejected(client, world):
    assert client.get(TEL).status_code == 401
    assert client.get(f"{SIM}/runs").status_code == 401
    assert client.get(RULES).status_code == 401



def test_spatial_subject_binding_is_owned_and_inherited(admins, client):
    h1 = login(client, "o1m@t.dz")
    h2 = login(client, "o2m@t.dz")

    dev1 = _device(client, h1, "owned binding")
    sensor = _sensor(client, h1, dev1["id"])
    assert sensor["subject_type"] == "well"
    assert sensor["subject_id"] == dev1["subject_id"]

    site2 = client.post("/api/sites", json={
        "name": "other tenant site", "wilaya": "Laghouat", "lat": 33.7, "lon": 2.8
    }, headers=h2)
    assert site2.status_code == 201
    well2 = client.post("/api/water/wells", json={
        "site_id": site2.json()["id"], "name": "other tenant well", "depth_m": 35
    }, headers=h2)
    assert well2.status_code == 201

    cross = client.post(f"{TEL}/devices", json={
        "name": "cross tenant device",
        "device_type": "well_controller",
        "subject_type": "well",
        "subject_id": well2.json()["id"],
        "configuration": {},
    }, headers=h1)
    assert cross.status_code == 404
    assert cross.json()["detail"]["code"] == "SUBJECT_NOT_FOUND"

    incomplete = client.post(f"{TEL}/devices", json={
        "name": "incomplete subject",
        "device_type": "generic_sensor_node",
        "subject_type": "well",
        "configuration": {},
    }, headers=h1)
    assert incomplete.status_code == 422
    assert incomplete.json()["detail"]["code"] == "SUBJECT_REFERENCE_INCOMPLETE"
