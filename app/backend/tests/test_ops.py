"""اختبارات الجاهزية الإنتاجية: صحة الخدمة، ترويسات الأمان، وعدم تسريب الأسرار في السجلات."""
import logging


def test_health_reports_db_up(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["db"] == "up"          # فحص SELECT 1 فعلي
    assert body["version"]


def test_health_requires_no_auth_and_has_security_headers(client):
    r = client.get("/api/health")
    assert r.headers["X-Content-Type-Options"] == "nosniff"
    assert r.headers["X-Frame-Options"] == "DENY"
    assert r.headers["Referrer-Policy"] == "no-referrer"
    csp = r.headers["Content-Security-Policy"]
    assert "default-src 'self'" in csp
    assert "font-src 'self'" in csp         # fonts are bundled locally
    assert "fonts.gstatic.com" not in csp
    assert "fonts.googleapis.com" not in csp


def test_docs_pages_exempt_from_csp_but_keep_other_headers(client):
    # Swagger/ReDoc تحمّل أصولًا من CDN — تُعفى من CSP فقط (موثق في README)
    r = client.get("/api/docs")
    assert r.status_code == 200
    assert "Content-Security-Policy" not in r.headers
    assert r.headers["X-Frame-Options"] == "DENY"
    r2 = client.get("/api/openapi.json")
    assert r2.status_code == 200
    assert "Content-Security-Policy" not in r2.headers


def test_request_logging_never_leaks_authorization(client, world, caplog):
    headers = {"Authorization": "Bearer SUPER-SECRET-TOKEN-VALUE"}
    with caplog.at_level(logging.INFO, logger="foggara"):
        client.get("/api/health", headers=headers)
        client.post("/api/auth/login",
                    json={"email": "o1m@t.dz", "password": "pass#1"})
    logs = caplog.text
    assert "SUPER-SECRET-TOKEN-VALUE" not in logs
    assert "pass#1" not in logs
    assert "authorization" not in logs.lower()
    # سطر لكل طلب: method + path + status
    assert "GET /api/health -> 200" in logs
    assert "POST /api/auth/login -> 200" in logs
