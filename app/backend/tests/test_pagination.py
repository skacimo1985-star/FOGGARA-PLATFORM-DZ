"""ترقيم الصفحات للقوائم الخمس: غلاف {items,total,page,page_size,pages} مع
عزل المؤسسات وترتيب ثابت، ووصول كامل للسجلات بعد السقف بلا فقد أو تكرار."""
from tests.conftest import login


def _mk_sites(client, h, n):
    for i in range(n):
        r = client.post("/api/sites", json={"name": f"psite-{i}", "wilaya": "Adrar"}, headers=h)
        assert r.status_code == 201, r.text


def test_sites_paginated_envelope_and_full_traversal(client, world):
    """صفحتان تغطيان كل السجلات بعد السقف: بلا فقد ولا تكرار، والمجموع صحيح."""
    h = login(client, "o1m@t.dz")
    _mk_sites(client, h, 5)

    r = client.get("/api/sites?page=1&page_size=2", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert set(body) == {"items", "total", "page", "page_size", "pages"}
    assert body["total"] == 5 and body["page"] == 1 and body["page_size"] == 2
    assert body["pages"] == 3
    assert len(body["items"]) == 2

    # اجتياز كامل عبر الصفحات: كل المعرّفات تظهر مرة واحدة بالضبط
    seen = []
    for p in range(1, body["pages"] + 1):
        chunk = client.get(f"/api/sites?page={p}&page_size=2", headers=h).json()["items"]
        seen += [x["id"] for x in chunk]
    assert len(seen) == 5 and len(set(seen)) == 5  # لا فقد ولا تكرار

    # ترتيب ثابت تصاعدي بالمعرف — إعادة نفس الطلب تعطي الترتيب نفسه
    again = client.get("/api/sites?page=1&page_size=2", headers=h).json()["items"]
    assert [x["id"] for x in again] == [x["id"] for x in body["items"]]


def test_pagination_preserves_tenant_isolation(client, world):
    """الترقيم لا يكسر العزل: المؤسسة الثانية ترى بياناتها فقط ومجموعها الخاص."""
    h1 = login(client, "o1m@t.dz")
    h2 = login(client, "o2m@t.dz")
    _mk_sites(client, h1, 4)
    _mk_sites(client, h2, 1)
    r = client.get("/api/sites?page=1&page_size=10", headers=h2)
    body = r.json()
    assert body["total"] == 1
    assert all(x["name"].startswith("psite-") for x in body["items"])
    names_org1 = {x["name"] for x in client.get("/api/sites?page=1&page_size=10", headers=h1).json()["items"]}
    assert body["items"][0]["name"] in names_org1  # التسمية مشتركة عمدًا
    # لكن المعرفات مختلفة تمامًا بين المؤسستين
    ids_org1 = {x["id"] for x in client.get("/api/sites?page=1&page_size=10", headers=h1).json()["items"]}
    assert body["items"][0]["id"] not in ids_org1


def test_page_size_clamped_to_max_and_page_bounds(client, world):
    """page_size يُقيَّد بسقف الخادم، والصفحات غير الصالحة تُرفض 422."""
    h = login(client, "o1m@t.dz")
    _mk_sites(client, h, 1)
    r = client.get("/api/sites?page=1&page_size=99999", headers=h)
    assert r.status_code == 422  # سقف ثابت في التحقق — لا استعلام جامح
    assert client.get("/api/sites?page=0", headers=h).status_code == 422


def test_decisions_paginated_list(client, world):
    """قائمة القرارات مغلّفة بنفس الشكل وتبقي التصفية تعمل مع الترقيم."""
    from tests.conftest import login as _login
    h = _login(client, "o1m@t.dz")
    for i in range(3):
        r = client.post("/api/decisions", json={
            "domain": "water", "decision_type": "ops", "title": f"pd-{i}",
            "priority": "low", "risk_level": "low"}, headers=h)
        assert r.status_code == 201, r.text
    r = client.get("/api/decisions?page=1&page_size=2&domain=water", headers=h)
    body = r.json()
    assert body["total"] == 3 and len(body["items"]) == 2 and body["pages"] == 2
    r2 = client.get("/api/decisions?page=2&page_size=2&domain=water", headers=h)
    assert len(r2.json()["items"]) == 1
