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


def test_list_endpoints_respect_max_limit(client, world, monkeypatch):
    """قوائم الموارد تُسقَط عند LIST_MAX_LIMIT حمايةً للأداء."""
    import app.config as cfg
    from tests.conftest import login
    monkeypatch.setattr(cfg, "LIST_MAX_LIMIT", 2)
    h = login(client, "o1m@t.dz")
    for i in range(3):
        r = client.post("/api/sites", json={"name": f"site-{i}", "wilaya": "Adrar"},
                        headers=h)
        assert r.status_code == 201, r.text
    r = client.get("/api/sites", headers=h)
    assert r.status_code == 200
    assert len(r.json()) == 2  # أُنشئت 3 لكن السقف 2
