"""اختبارات نطاق المياه (Contract §4 — المرحلة 1).

تغطي: الإنشاء والسرد، العزل بين المؤسستين (القاعدة 6)، قيود التحقق (§8/§23)،
آلة حالات التخصيص بانتقالات مخوَّلة (القاعدة 5)، وسجل التدقيق (§22).
كل الاختبارات عبر واجهة HTTP العامة فقط.
"""
from datetime import datetime, timedelta, timezone

from tests.conftest import login


def _site(client, headers, name="موقع اختبار"):
    r = client.post("/api/sites", json={"name": name, "wilaya": "أدرار"}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _well(client, headers, site_id, name="بئر اختبار"):
    r = client.post("/api/water/wells", json={"site_id": site_id, "name": name, "depth_m": 30},
                    headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _reservoir(client, headers, site_id):
    r = client.post("/api/water/reservoirs",
                    json={"site_id": site_id, "name": "خزان اختبار", "capacity_m3": 500},
                    headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _zone(client, headers, site_id):
    r = client.post("/api/water/zones",
                    json={"site_id": site_id, "name": "منطقة اختبار", "area_ha": 2.5},
                    headers=headers)
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _alloc_payload(zone_id, well_id):
    start = datetime.now(timezone.utc) - timedelta(days=1)
    return {"zone_id": zone_id, "well_id": well_id, "volume_m3": 100,
            "period_start": start.isoformat(),
            "period_end": (start + timedelta(days=2)).isoformat()}


def test_create_and_list_water_chain(client, world):
    h = login(client, "o1m@t.dz")
    sid = _site(client, h)
    wid = _well(client, h, sid)
    rid = _reservoir(client, h, sid)
    zid = _zone(client, h, sid)

    r = client.post("/api/water/pumps",
                    json={"site_id": sid, "name": "مضخة 1", "well_id": wid}, headers=h)
    assert r.status_code == 201, r.text
    pid = r.json()["id"]

    r = client.post("/api/water/vfds", json={"pump_id": pid, "model": "VFD-X"}, headers=h)
    assert r.status_code == 201, r.text

    r = client.post("/api/water/valves",
                    json={"site_id": sid, "name": "صمام 1", "zone_id": zid, "diameter_mm": 90},
                    headers=h)
    assert r.status_code == 201, r.text

    for ep, expected in (("wells", 1), ("reservoirs", 1), ("pumps", 1),
                         ("vfds", 1), ("zones", 1), ("valves", 1)):
        r = client.get(f"/api/water/{ep}", headers=h)
        assert r.status_code == 200
        assert len(r.json()) == expected


def test_tenant_isolation_water_entities(client, world):
    h1 = login(client, "o1m@t.dz")
    h2 = login(client, "o2m@t.dz")
    sid1 = _site(client, h1, "موقع م1")
    _well(client, h1, sid1)

    # مؤسسة 2 لا ترى شيئًا
    for ep in ("wells", "reservoirs", "pumps", "vfds", "zones", "valves", "allocations"):
        r = client.get(f"/api/water/{ep}", headers=h2)
        assert r.status_code == 200 and r.json() == []

    # مؤسسة 2 لا تستطيع البناء فوق كيانات مؤسسة 1 (404 لا 403 — لا تسريب للوجود)
    sid2 = _site(client, h2, "موقع م2")
    wid1 = client.get("/api/water/wells", headers=h1).json()[0]["id"]
    r = client.post("/api/water/pumps",
                    json={"site_id": sid2, "name": "مضخة متسللة", "well_id": wid1}, headers=h2)
    assert r.status_code == 404
    r = client.post("/api/water/wells", json={"site_id": sid1, "name": "بئر متسلل"}, headers=h2)
    assert r.status_code == 404


def test_pump_requires_exactly_one_source(client, world):
    h = login(client, "o1m@t.dz")
    sid = _site(client, h)
    wid = _well(client, h, sid)
    rid = _reservoir(client, h, sid)

    r = client.post("/api/water/pumps", json={"site_id": sid, "name": "بلا مصدر"}, headers=h)
    assert r.status_code == 422
    r = client.post("/api/water/pumps",
                    json={"site_id": sid, "name": "مصدران", "well_id": wid, "reservoir_id": rid},
                    headers=h)
    assert r.status_code == 422
    r = client.post("/api/water/pumps",
                    json={"site_id": sid, "name": "مصدر واحد", "reservoir_id": rid}, headers=h)
    assert r.status_code == 201


def test_allocation_validation(client, world):
    h = login(client, "o1m@t.dz")
    h2 = login(client, "o2m@t.dz")
    sid = _site(client, h)
    wid = _well(client, h, sid)
    zid = _zone(client, h, sid)

    # حجم سالب → 422 (قيد مخطط + قيد DB)
    bad = _alloc_payload(zid, wid)
    bad["volume_m3"] = -5
    assert client.post("/api/water/allocations", json=bad, headers=h).status_code == 422

    # نهاية قبل البداية → 422
    bad = _alloc_payload(zid, wid)
    bad["period_end"] = bad["period_start"]
    assert client.post("/api/water/allocations", json=bad, headers=h).status_code == 422

    # منطقة تابعة لمؤسسة أخرى → 404
    r = client.post("/api/water/allocations", json=_alloc_payload(zid, wid), headers=h2)
    assert r.status_code == 404


def test_allocation_state_machine(client, world):
    h = login(client, "o1m@t.dz")
    hr = login(client, "o1r@t.dz")
    sid = _site(client, h)
    wid = _well(client, h, sid)
    zid = _zone(client, h, sid)
    r = client.post("/api/water/allocations", json=_alloc_payload(zid, wid), headers=h)
    assert r.status_code == 201, r.text
    aid = r.json()["id"]
    assert r.json()["status"] == "proposed"

    # انتقال غير مشروع: proposed → executed مباشرة → 409
    r = client.post(f"/api/water/allocations/{aid}/transition", json={"to": "executed"}, headers=hr)
    assert r.status_code == 409

    # عضو عادي لا يعتمد → 403
    r = client.post(f"/api/water/allocations/{aid}/transition", json={"to": "approved"}, headers=h)
    assert r.status_code == 403

    # مراجع يعتمد ثم ينفذ → 200
    r = client.post(f"/api/water/allocations/{aid}/transition", json={"to": "approved"}, headers=hr)
    assert r.status_code == 200 and r.json()["status"] == "approved"
    assert r.json()["decided_by"] is not None
    r = client.post(f"/api/water/allocations/{aid}/transition", json={"to": "executed"}, headers=hr)
    assert r.status_code == 200 and r.json()["status"] == "executed"

    # executed حالة نهائية → 409
    r = client.post(f"/api/water/allocations/{aid}/transition", json={"to": "cancelled"}, headers=hr)
    assert r.status_code == 409

    # تخصيص مؤسسة أخرى غير مرئي → 404
    h2r = login(client, "o2r@t.dz")
    r = client.post(f"/api/water/allocations/{aid}/transition", json={"to": "cancelled"}, headers=h2r)
    assert r.status_code == 404


def test_water_audit_trail(client, world):
    h = login(client, "o1m@t.dz")
    hr = login(client, "o1r@t.dz")
    sid = _site(client, h)
    wid = _well(client, h, sid)
    zid = _zone(client, h, sid)
    r = client.post("/api/water/allocations", json=_alloc_payload(zid, wid), headers=h)
    aid = r.json()["id"]
    client.post(f"/api/water/allocations/{aid}/transition", json={"to": "approved"}, headers=hr)

    r = client.get("/api/audit", headers=h)
    assert r.status_code == 200
    actions = [(e["action"], e["entity_type"]) for e in r.json()]
    assert ("create", "water_allocation") in actions
    assert ("transition.approved", "water_allocation") in actions
    assert ("create", "well") in actions
