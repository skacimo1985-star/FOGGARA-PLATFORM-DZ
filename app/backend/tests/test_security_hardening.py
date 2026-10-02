"""تشديد أمني إنتاجي: تحديد المعدل، ترويسات إضافية، معرف الطلب، وحالة المخطط في health."""


def test_login_rate_limited_after_max_attempts(client, monkeypatch):
    """محاولات دخول فاشلة متكررة من نفس العنوان تُقطع بـ 429 RATE_LIMITED."""
    monkeypatch.setenv("RATE_LIMIT_LOGIN_MAX", "3")
    monkeypatch.setenv("RATE_LIMIT_LOGIN_WINDOW", "60")
    payload = {"email": "nobody@t.dz", "password": "wrong-pass-1"}
    for _ in range(3):
        r = client.post("/api/auth/login", json=payload)
        assert r.status_code == 401  # قبل بلوغ الحد: خطأ اعتماد عادي
    r = client.post("/api/auth/login", json=payload)
    assert r.status_code == 429
    assert r.json()["detail"]["code"] == "RATE_LIMITED"


def test_bootstrap_rate_limited_after_max_attempts(client, world, monkeypatch):
    """مسار setup الحساس يُحدّ بالمعدل أيضًا (المسار مغلق هنا لوجود مستخدمين)."""
    monkeypatch.setenv("RATE_LIMIT_SETUP_MAX", "2")
    monkeypatch.setenv("RATE_LIMIT_SETUP_WINDOW", "600")
    payload = {"email": "a@t.dz", "full_name": "a", "password": "x" * 12}
    for _ in range(2):
        r = client.post("/api/setup/bootstrap", json=payload)
        assert r.status_code != 429  # قبل الحد: منطق المسار العادي (409 مغلق)
    r = client.post("/api/setup/bootstrap", json=payload)
    assert r.status_code == 429
    assert r.json()["detail"]["code"] == "RATE_LIMITED"


def test_hsts_only_in_prod(client, monkeypatch):
    """Strict-Transport-Security تُرسل في prod فقط، لا في dev."""
    import app.config as cfg
    r = client.get("/api/health")
    assert "Strict-Transport-Security" not in r.headers
    monkeypatch.setattr(cfg, "ENV", "prod")
    r = client.get("/api/health")
    assert r.headers["Strict-Transport-Security"].startswith("max-age=")


def test_request_id_header_and_log_format(client, caplog):
    """كل استجابة تحمل X-Request-ID وسطر السجل يتضمن المعرف نفسه."""
    import logging
    with caplog.at_level(logging.INFO, logger="foggara"):
        r = client.get("/api/health")
    rid = r.headers.get("X-Request-ID")
    assert rid and len(rid) == 8
    assert f"req={rid}" in caplog.text


def test_health_reports_alembic_head_and_db_latency(client):
    """health يفصح عن رأس المخطط وزمن استجابة القاعدة (قاعدة الاختبار بلا alembic)."""
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["alembic"] == "none"      # create_all لا ينشئ جدول alembic_version
    assert body["db_ms"] >= 0


def test_page_size_clamped_to_server_max(client, world, monkeypatch):
    """page_size فوق LIST_MAX_LIMIT تُقيَّد بصمت إلى السقف (حماية أداء)."""
    import app.config as cfg
    from tests.conftest import login
    monkeypatch.setattr(cfg, "LIST_MAX_LIMIT", 2)
    h = login(client, "o1m@t.dz")
    for i in range(3):
        r = client.post("/api/sites", json={"name": f"site-{i}", "wilaya": "Adrar"},
                        headers=h)
        assert r.status_code == 201, r.text
    r = client.get("/api/sites?page=1&page_size=10", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert len(body["items"]) == 2        # طُلب 10 لكن السقف 2
    assert body["page_size"] == 2
    assert body["total"] == 3             # السجلات موجودة وتُطلب بصفحة ثانية


def test_rate_limit_uses_forwarded_for_when_trusted(client, monkeypatch):
    """خلف بروكسي الاستضافة: المفتاح هو أول عنوان في X-Forwarded-For عند الثقة."""
    monkeypatch.setenv("TRUST_PROXY_HEADERS", "true")
    monkeypatch.setenv("RATE_LIMIT_LOGIN_MAX", "2")
    payload = {"email": "nobody@t.dz", "password": "wrong-pass-1"}
    h1 = {"X-Forwarded-For": "203.0.113.10, 10.0.0.1"}
    for _ in range(2):
        assert client.post("/api/auth/login", json=payload, headers=h1).status_code == 401
    assert client.post("/api/auth/login", json=payload, headers=h1).status_code == 429
    # عنوان مختلف = عدّاد مستقل
    h2 = {"X-Forwarded-For": "203.0.113.99"}
    assert client.post("/api/auth/login", json=payload, headers=h2).status_code == 401


def test_forwarded_for_ignored_when_not_trusted(client, monkeypatch):
    """بدون ثقة صريحة بالبروكسي: ترويسة X-Forwarded-For تُتجاهل (مقاومة تزوير)."""
    monkeypatch.delenv("TRUST_PROXY_HEADERS", raising=False)
    monkeypatch.setenv("RATE_LIMIT_LOGIN_MAX", "2")
    payload = {"email": "nobody@t.dz", "password": "wrong-pass-1"}
    # مهاجم يغيّر XFF لكل محاولة — بلا ثقة يبقى مفتاحًا واحدًا ويُحَدّ
    for i in range(2):
        h = {"X-Forwarded-For": f"198.51.100.{i}"}
        assert client.post("/api/auth/login", json=payload, headers=h).status_code == 401
    h = {"X-Forwarded-For": "198.51.100.77"}
    assert client.post("/api/auth/login", json=payload, headers=h).status_code == 429


def test_sliding_window_recovers_after_expiry(client, monkeypatch):
    """النافذة المنزلقة: بعد انقضاء المدة يستعيد العنوان قدرته (لا حظر أبدي)."""
    import time
    monkeypatch.setenv("RATE_LIMIT_LOGIN_MAX", "1")
    monkeypatch.setenv("RATE_LIMIT_LOGIN_WINDOW", "1")
    payload = {"email": "nobody@t.dz", "password": "wrong-pass-1"}
    assert client.post("/api/auth/login", json=payload).status_code == 401
    assert client.post("/api/auth/login", json=payload).status_code == 429
    time.sleep(1.1)
    assert client.post("/api/auth/login", json=payload).status_code == 401
