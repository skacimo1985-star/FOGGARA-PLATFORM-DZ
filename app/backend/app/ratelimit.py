"""Per-process sliding-window limits.

Forwarded headers require explicit TRUST_PROXY_HEADERS=true and a proxy that
sanitizes the leftmost X-Forwarded-For address. Production does not opt in by
itself. RL_MAX_KEYS caps active keys; new clients fail closed at capacity until
existing windows expire. Multiple workers need a shared store for global limits.
"""
import os
import threading
import time

from fastapi import Request

from .deps import api_error

# مفاتيح لم تمسّ منذ هذه المدة تُعد ميتة وتُخلى عند الضغط على السقف



def _env_int(name: str, default: int) -> int:
    try:
        v = int(os.environ.get(name, ""))
        return v if v > 0 else default
    except ValueError:
        return default


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], list[float]] = {}
        self._expires: dict[tuple[str, str], float] = {}
        self._lock = threading.Lock()

    def allow(self, bucket: str, key: str, max_hits: int, window_s: int) -> bool:
        now = time.monotonic()
        k = (bucket, key)
        with self._lock:
            # إخلاء المفاتيح الميتة عند الضغط على السقف — ذاكرة محدودة بنيويًا
            max_keys = _env_int("RL_MAX_KEYS", 10000)
            if k not in self._hits and len(self._hits) >= max_keys:
                expired = [kk for kk, expiry in self._expires.items() if expiry <= now]
                for kk in expired:
                    self._hits.pop(kk, None)
                    self._expires.pop(kk, None)
                if len(self._hits) >= max_keys:
                    return False
            ts = [t for t in self._hits.get(k, []) if now - t < window_s]
            if len(ts) >= max_hits:
                self._hits[k] = ts
                return False
            ts.append(now)
            self._hits[k] = ts
            self._expires[k] = now + window_s
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()
            self._expires.clear()


limiter = SlidingWindowLimiter()


def _trust_proxy() -> bool:
    v = os.environ.get("TRUST_PROXY_HEADERS", "").strip().lower()
    if v:
        return v in ("1", "true", "yes")
    # Trust must be explicitly enabled for a sanitizing hosting proxy.
    return False


def _client_key(request: Request) -> str:
    if _trust_proxy():
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return xff.split(",")[0].strip()  # أول عنوان = العميل الأصلي
    return request.client.host if request.client else "unknown"


def check_rate_limit(request: Request, bucket: str, max_env: str, window_env: str,
                     default_max: int, default_window: int) -> None:
    """يرفع 429 RATE_LIMITED عند تجاوز الحد، وإلا يمر بصمت."""
    key = _client_key(request)
    max_hits = _env_int(max_env, default_max)
    window_s = _env_int(window_env, default_window)
    if not limiter.allow(bucket, key, max_hits, window_s):
        api_error(429, "RATE_LIMITED", "Too many attempts, try again later")


def check_login_rate(request: Request) -> None:
    # الافتراضي: 10 محاولات / دقيقة لكل عنوان — لا يمس الاستخدام البشري الطبيعي.
    check_rate_limit(request, "login", "RATE_LIMIT_LOGIN_MAX",
                     "RATE_LIMIT_LOGIN_WINDOW", 10, 60)


def check_setup_rate(request: Request) -> None:
    # الافتراضي: 5 محاولات / 10 دقائق — مسار حساس يُستخدم مرة واحدة عمر النظام.
    check_rate_limit(request, "setup", "RATE_LIMIT_SETUP_MAX",
                     "RATE_LIMIT_SETUP_WINDOW", 5, 600)
