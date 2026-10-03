"""Integration boundary regressions."""
from .conftest import login
def test_unlisted_peer_cannot_spoof_rate_identity(client, monkeypatch):
    monkeypatch.setenv("TRUST_PROXY_HEADERS", "true")
    monkeypatch.setenv("TRUSTED_PROXY_PEERS", "127.0.0.1")
    monkeypatch.setenv("RATE_LIMIT_LOGIN_MAX", "2")
    for i in range(2):
        assert client.post("/api/auth/login", headers={"X-Forwarded-For": f"203.0.113.{i}"},
                           json={"email":"nobody@example.invalid","password":"incorrect"}).status_code == 401
    assert client.post("/api/auth/login", headers={"X-Forwarded-For":"203.0.113.99"},
                       json={"email":"nobody@example.invalid","password":"incorrect"}).status_code == 429
def test_sensitive_api_never_cached(client, world):
    headers = login(client, "o1m@t.dz")
    for path in ("/api/auth/me", "/api/projects", "/api/data-rooms", "/api/operations/lots"):
        response = client.get(path, headers=headers)
        assert response.status_code == 200, response.text
        assert response.headers["Cache-Control"] == "no-store"
def test_validation_does_not_echo_password(client):
    secret = "NeverEchoThisSecret"
    response = client.post("/api/auth/password", json={"current_password": secret, "new_password": secret, "extra": secret})
    assert secret not in response.text
