"""تحديد معدل بسيط داخل العملية: نافذة منزلقة لكل (نقطة نهاية، عنوان IP).

الغرض: إبطاء هجمات التخمين على نقاط حساسة (login, setup bootstrap).
حدود التصميم الموثقة:
- الحالة في ذاكرة العملية — حاوية واحدة = خادم واحد (نموذج النشر الحالي).
- لا تُسجَّل عناوين IP في سجلات التطبيق؛ تبقى داخل الذاكرة فقط.
- الحدود قابلة للضبط عبر متغيرات البيئة وتُقرأ مع كل طلب (اختبارية + تشغيلية).
"""
import os
import threading
import time

from fastapi import Request

from .deps import api_error


def _env_int(name: str, default: int) -> int:
    try:
        v = int(os.environ.get(name, ""))
        return v if v > 0 else default
    except ValueError:
        return default


class SlidingWindowLimiter:
    def __init__(self) -> None:
        self._hits: dict[tuple[str, str], list[float]] = {}
        self._lock = threading.Lock()

    def allow(self, bucket: str, key: str, max_hits: int, window_s: int) -> bool:
        now = time.monotonic()
        k = (bucket, key)
        with self._lock:
            ts = [t for t in self._hits.get(k, []) if now - t < window_s]
            if len(ts) >= max_hits:
                self._hits[k] = ts
                return False
            ts.append(now)
            self._hits[k] = ts
            return True

    def reset(self) -> None:
        with self._lock:
            self._hits.clear()


limiter = SlidingWindowLimiter()


def check_rate_limit(request: Request, bucket: str, max_env: str, window_env: str,
                     default_max: int, default_window: int) -> None:
    """يرفع 429 RATE_LIMITED عند تجاوز الحد، وإلا يمر بصمت."""
    key = request.client.host if request.client else "unknown"
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
