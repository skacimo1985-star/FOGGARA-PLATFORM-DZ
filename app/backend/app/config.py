"""تهيئة التطبيق — كل القيم تُقرأ من متغيرات البيئة (انظر .env.example).

قاعدة الأمان الأساسية: عند ENV=prod يُرفض الإقلاع بأي JWT_SECRET افتراضي/ضعيف.
"""
import os
from ipaddress import ip_address
from urllib.parse import urlsplit

# الافتراضي بلا إعداد: SQLite محلي (تطوير/تجربة بلا Docker).
# للإنتاج: PostgreSQL عبر DATABASE_URL صريح — انظر .env.example.
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite:///./foggara.db",
)

# Select psycopg 3 for managed-provider URLs without changing credentials.
for _prefix in ("postgres://", "postgresql://"):
    if DATABASE_URL.startswith(_prefix):
        DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL[len(_prefix):]
        break

_DEFAULT_JWT_SECRET = "dev-only-secret-change-me-32bytes-min!"
JWT_SECRET = os.environ.get("JWT_SECRET", _DEFAULT_JWT_SECRET)

TOKEN_TTL_HOURS = int(os.environ.get("TOKEN_TTL_HOURS", "12"))
if not 1 <= TOKEN_TTL_HOURS <= 24:
    raise RuntimeError("TOKEN_TTL_HOURS must be between 1 and 24.")

# البيئة: dev (تطوير/تجربة) أو prod (إنتاج). أي قيمة أخرى تُرفض.
ENV = os.environ.get("ENV", "dev").strip().lower()
if ENV not in ("dev", "prod"):
    raise RuntimeError(f"ENV must be 'dev' or 'prod', got: {ENV!r}")

# قائمة الأصول المسموح لها بـ CORS، مفصولة بفواصل.
# الافتراضي فارغ = نفس الأصل فقط (لا رؤوس CORS تُرسل إطلاقًا).
CORS_ORIGINS = [
    o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()
]

# مستوى السجلات (DEBUG/INFO/WARNING/ERROR)
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO").strip().upper()

APP_VERSION = "0.1.0"

# The existing database-backed queue runs inside the web lifespan by default in
# production; operators can disable it when using a dedicated worker instead.
_AUTOMATION_FLAG = os.environ.get("OPERATIONS_AUTOMATION_ENABLED", "").strip().lower()
if _AUTOMATION_FLAG not in ("", "true", "false"):
    raise RuntimeError("OPERATIONS_AUTOMATION_ENABLED must be true or false")
OPERATIONS_AUTOMATION_ENABLED = _AUTOMATION_FLAG == "true" if _AUTOMATION_FLAG else ENV == "prod"

if ENV == "prod":
    if not DATABASE_URL.startswith(("postgresql+psycopg://", "postgresql://")):
        raise RuntimeError("ENV=prod requires PostgreSQL DATABASE_URL.")
    if not JWT_SECRET or JWT_SECRET == _DEFAULT_JWT_SECRET:
        raise RuntimeError(
            "FATAL: ENV=prod requires a strong JWT_SECRET. "
            "The built-in development default is forbidden in production. "
            "Generate one with: python -c 'import secrets; print(secrets.token_hex(32))'"
        )
    if len(JWT_SECRET) < 32:
        raise RuntimeError(
            "FATAL: ENV=prod requires JWT_SECRET of at least 32 characters."
        )



if ENV == "prod":
    if len(set(JWT_SECRET)) < 16:
        raise RuntimeError("ENV=prod requires a randomly generated JWT_SECRET.")
    for origin in CORS_ORIGINS:
        parsed = urlsplit(origin)
        if "*" in origin or parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or parsed.path not in ("", "/") or parsed.query or parsed.fragment:
            raise RuntimeError("ENV=prod requires explicit HTTPS CORS origins without credentials or paths.")

# Explicit implementation selection; never silently substitute a failed Rust engine.
NEXUS_MATRIX_ENGINE = os.environ.get("NEXUS_MATRIX_ENGINE", "python").strip().lower()
if NEXUS_MATRIX_ENGINE not in ("python", "rust"):
    raise RuntimeError("NEXUS_MATRIX_ENGINE must be python or rust")
NEXUS_RUST_BINARY = os.environ.get("NEXUS_RUST_BINARY", "/usr/local/bin/foggara-nexus-core")


LIST_MAX_LIMIT = int(os.environ.get("LIST_MAX_LIMIT", "500"))
if not 1 <= LIST_MAX_LIMIT <= 1000:
    raise RuntimeError("LIST_MAX_LIMIT must be between 1 and 1000")


# Optional OpenAI-compatible AI for investor-facing summaries. The UI never
# calls providers directly. "local" is intended for Ollama/LocalAI/Open WebUI
# gateways inside the operator's infrastructure; "external" is for a remote API.
_AI_EXTERNAL_FLAG = os.environ.get("AI_EXTERNAL_ENABLED", "false").strip().lower()
if _AI_EXTERNAL_FLAG not in ("true", "false"):
    raise RuntimeError("AI_EXTERNAL_ENABLED must be true or false")
AI_EXTERNAL_ENABLED = _AI_EXTERNAL_FLAG == "true"

_AI_PROVIDER_DEFAULT = "external" if AI_EXTERNAL_ENABLED else "deterministic"
AI_PROVIDER_MODE = os.environ.get("AI_PROVIDER_MODE", _AI_PROVIDER_DEFAULT).strip().lower()
if AI_PROVIDER_MODE not in ("deterministic", "local", "external"):
    raise RuntimeError("AI_PROVIDER_MODE must be deterministic, local or external")

AI_BASE_URL = os.environ.get("AI_BASE_URL", "").strip().rstrip("/")
AI_API_KEY = os.environ.get("AI_API_KEY", "").strip()
AI_MODEL = os.environ.get("AI_MODEL", "").strip()
AI_TIMEOUT_SECONDS = float(os.environ.get("AI_TIMEOUT_SECONDS", "20"))
if not 3 <= AI_TIMEOUT_SECONDS <= 60:
    raise RuntimeError("AI_TIMEOUT_SECONDS must be between 3 and 60")

def _is_private_ai_host(hostname: str) -> bool:
    host = hostname.strip().lower().rstrip(".")
    if host == "localhost" or "." not in host:
        return True
    if host.endswith((".local", ".internal", ".svc", ".svc.cluster.local")):
        return True
    try:
        address = ip_address(host)
    except ValueError:
        return False
    return bool(address.is_private or address.is_loopback or address.is_link_local)


if AI_PROVIDER_MODE != "deterministic":
    _ai_url = urlsplit(AI_BASE_URL)
    if not AI_BASE_URL or not AI_MODEL:
        raise RuntimeError("Configured AI provider requires AI_BASE_URL and AI_MODEL")
    if (
        _ai_url.scheme not in ("http", "https")
        or not _ai_url.hostname
        or _ai_url.username
        or _ai_url.password
        or _ai_url.query
        or _ai_url.fragment
    ):
        raise RuntimeError("AI_BASE_URL must be an HTTP(S) provider base URL without embedded credentials, query or fragment")
    if AI_PROVIDER_MODE == "local" and not _is_private_ai_host(_ai_url.hostname):
        raise RuntimeError("AI_PROVIDER_MODE=local requires a loopback/private/internal AI_BASE_URL host")
    if AI_PROVIDER_MODE == "external":
        if not AI_API_KEY:
            raise RuntimeError("External AI requires AI_API_KEY")
        if ENV == "prod" and _ai_url.scheme != "https":
            raise RuntimeError("ENV=prod requires HTTPS external AI_BASE_URL")


# Optional live agricultural-weather provider. The adapter targets the stable
# Open-Meteo-compatible /v1/forecast contract so operators can use either a
# licensed commercial endpoint or a self-hosted sovereign deployment.
_WEATHER_FLAG = os.environ.get("WEATHER_PROVIDER_ENABLED", "false").strip().lower()
if _WEATHER_FLAG not in ("true", "false"):
    raise RuntimeError("WEATHER_PROVIDER_ENABLED must be true or false")
WEATHER_PROVIDER_ENABLED = _WEATHER_FLAG == "true"
WEATHER_BASE_URL = os.environ.get("WEATHER_BASE_URL", "").strip().rstrip("/")
WEATHER_API_KEY = os.environ.get("WEATHER_API_KEY", "").strip()
WEATHER_PROVIDER_NAME = os.environ.get("WEATHER_PROVIDER_NAME", "Open-Meteo-compatible").strip()
WEATHER_PROVIDER_ATTRIBUTION = os.environ.get("WEATHER_PROVIDER_ATTRIBUTION", "").strip()
WEATHER_PROVIDER_ATTRIBUTION_URL = os.environ.get("WEATHER_PROVIDER_ATTRIBUTION_URL", "").strip()
WEATHER_TIMEOUT_SECONDS = float(os.environ.get("WEATHER_TIMEOUT_SECONDS", "12"))
if not 3 <= WEATHER_TIMEOUT_SECONDS <= 30:
    raise RuntimeError("WEATHER_TIMEOUT_SECONDS must be between 3 and 30")
if WEATHER_PROVIDER_ENABLED:
    _weather_url = urlsplit(WEATHER_BASE_URL)
    if (
        not WEATHER_BASE_URL
        or _weather_url.scheme not in ("http", "https")
        or not _weather_url.hostname
        or _weather_url.username
        or _weather_url.password
        or _weather_url.path not in ("", "/")
        or _weather_url.query
        or _weather_url.fragment
    ):
        raise RuntimeError("WEATHER_BASE_URL must be a provider origin without credentials, path, query or fragment")
    if ENV == "prod" and _weather_url.scheme != "https":
        raise RuntimeError("ENV=prod requires HTTPS WEATHER_BASE_URL")
    if not WEATHER_PROVIDER_NAME or not WEATHER_PROVIDER_ATTRIBUTION or not WEATHER_PROVIDER_ATTRIBUTION_URL:
        raise RuntimeError(
            "Enabled weather provider requires WEATHER_PROVIDER_NAME, WEATHER_PROVIDER_ATTRIBUTION "
            "and WEATHER_PROVIDER_ATTRIBUTION_URL"
        )
    _weather_attribution_url = urlsplit(WEATHER_PROVIDER_ATTRIBUTION_URL)
    if (
        _weather_attribution_url.scheme not in ("http", "https")
        or not _weather_attribution_url.hostname
        or _weather_attribution_url.username
        or _weather_attribution_url.password
    ):
        raise RuntimeError("WEATHER_PROVIDER_ATTRIBUTION_URL must be an absolute HTTP(S) URL")
    if ENV == "prod" and _weather_attribution_url.scheme != "https":
        raise RuntimeError("ENV=prod requires HTTPS WEATHER_PROVIDER_ATTRIBUTION_URL")
