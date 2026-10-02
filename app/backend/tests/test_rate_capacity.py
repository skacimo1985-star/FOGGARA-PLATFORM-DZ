from starlette.requests import Request

from app.ratelimit import SlidingWindowLimiter, _client_key


def test_capacity_preserves_active_limits_and_recovers(monkeypatch):
    monkeypatch.setenv("RL_MAX_KEYS", "2")
    now = [100.0]
    monkeypatch.setattr("app.ratelimit.time.monotonic", lambda: now[0])
    limiter = SlidingWindowLimiter()
    assert limiter.allow("login", "a", 1, 60)
    assert limiter.allow("login", "b", 1, 60)
    assert not limiter.allow("login", "c", 1, 60)
    assert len(limiter._hits) == 2
    assert not limiter.allow("login", "a", 1, 60)
    now[0] = 161.0
    assert limiter.allow("login", "c", 1, 60)


def test_production_does_not_implicitly_trust_forwarded_headers(monkeypatch):
    monkeypatch.setattr("app.config.ENV", "prod")
    monkeypatch.delenv("TRUST_PROXY_HEADERS", raising=False)
    request = Request({"type": "http", "client": ("127.0.0.1", 1234),
                       "headers": [(b"x-forwarded-for", b"203.0.113.10")]})
    assert _client_key(request) == "127.0.0.1"
