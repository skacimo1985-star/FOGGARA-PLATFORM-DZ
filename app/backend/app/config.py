"""تهيئة التطبيق — كل القيم تُقرأ من متغيرات البيئة (انظر .env.example).

قاعدة الأمان الأساسية: عند ENV=prod يُرفض الإقلاع بأي JWT_SECRET افتراضي/ضعيف.
"""
import os
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

# Real field-intelligence automation. In production it runs in the web lifespan
# unless explicitly disabled; work is bounded per cycle to protect raster capacity.
_FIELD_AUTOMATION_FLAG = os.environ.get("FIELD_AUTOMATION_ENABLED", "").strip().lower()
if _FIELD_AUTOMATION_FLAG not in ("", "true", "false"):
    raise RuntimeError("FIELD_AUTOMATION_ENABLED must be true or false")
FIELD_AUTOMATION_ENABLED = (
    _FIELD_AUTOMATION_FLAG == "true" if _FIELD_AUTOMATION_FLAG else ENV == "prod"
)
FIELD_AUTOMATION_INTERVAL_SECONDS = int(
    os.environ.get("FIELD_AUTOMATION_INTERVAL_SECONDS", "21600")
)
if not 900 <= FIELD_AUTOMATION_INTERVAL_SECONDS <= 86400:
    raise RuntimeError("FIELD_AUTOMATION_INTERVAL_SECONDS must be between 900 and 86400")
FIELD_AUTOMATION_LOOKBACK_DAYS = int(os.environ.get("FIELD_AUTOMATION_LOOKBACK_DAYS", "45"))
if not 7 <= FIELD_AUTOMATION_LOOKBACK_DAYS <= 366:
    raise RuntimeError("FIELD_AUTOMATION_LOOKBACK_DAYS must be between 7 and 366")
FIELD_AUTOMATION_CLOUD_COVER_LTE = float(
    os.environ.get("FIELD_AUTOMATION_CLOUD_COVER_LTE", "35")
)
if not 0 <= FIELD_AUTOMATION_CLOUD_COVER_LTE <= 100:
    raise RuntimeError("FIELD_AUTOMATION_CLOUD_COVER_LTE must be between 0 and 100")
FIELD_AUTOMATION_BATCH_SIZE = int(os.environ.get("FIELD_AUTOMATION_BATCH_SIZE", "12"))
if not 1 <= FIELD_AUTOMATION_BATCH_SIZE <= 100:
    raise RuntimeError("FIELD_AUTOMATION_BATCH_SIZE must be between 1 and 100")


# Optional real MQTT edge ingestion. This is intentionally off until a broker is
# commissioned; REST edge ingest remains available independently.
_MQTT_EDGE_FLAG = os.environ.get("MQTT_EDGE_ENABLED", "false").strip().lower()
if _MQTT_EDGE_FLAG not in ("true", "false"):
    raise RuntimeError("MQTT_EDGE_ENABLED must be true or false")
MQTT_EDGE_ENABLED = _MQTT_EDGE_FLAG == "true"
MQTT_BROKER_HOST = os.environ.get("MQTT_BROKER_HOST", "").strip()
MQTT_BROKER_PORT = int(os.environ.get("MQTT_BROKER_PORT", "8883"))
if not 1 <= MQTT_BROKER_PORT <= 65535:
    raise RuntimeError("MQTT_BROKER_PORT must be between 1 and 65535")
_MQTT_TLS_FLAG = os.environ.get("MQTT_TLS", "true").strip().lower()
if _MQTT_TLS_FLAG not in ("true", "false"):
    raise RuntimeError("MQTT_TLS must be true or false")
MQTT_TLS = _MQTT_TLS_FLAG == "true"
MQTT_USERNAME = os.environ.get("MQTT_USERNAME", "").strip()
MQTT_PASSWORD = os.environ.get("MQTT_PASSWORD", "")
MQTT_TOPIC_PREFIX = os.environ.get("MQTT_TOPIC_PREFIX", "foggara").strip().strip("/")
MQTT_RECONNECT_SECONDS = float(os.environ.get("MQTT_RECONNECT_SECONDS", "10"))
if not 2 <= MQTT_RECONNECT_SECONDS <= 300:
    raise RuntimeError("MQTT_RECONNECT_SECONDS must be between 2 and 300")
if MQTT_EDGE_ENABLED:
    if (
        not MQTT_BROKER_HOST
        or "/" in MQTT_BROKER_HOST
        or "://" in MQTT_BROKER_HOST
        or any(ch.isspace() for ch in MQTT_BROKER_HOST)
    ):
        raise RuntimeError("MQTT_BROKER_HOST must be a hostname only")
    if not MQTT_TOPIC_PREFIX or any(ch.isspace() for ch in MQTT_TOPIC_PREFIX):
        raise RuntimeError("MQTT_TOPIC_PREFIX must be a non-empty topic segment")
    if bool(MQTT_USERNAME) != bool(MQTT_PASSWORD):
        raise RuntimeError("MQTT_USERNAME and MQTT_PASSWORD must be configured together")
    if ENV == "prod" and not MQTT_TLS:
        _trusted_internal_mqtt_hosts = {"localhost", "127.0.0.1", "::1", "mosquitto", "mqtt", "foggara-mqtt"}
        if MQTT_BROKER_HOST not in _trusted_internal_mqtt_hosts:
            raise RuntimeError("Production external MQTT requires TLS")

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


# Optional AI runtime. The frontend never calls model providers directly.
# Exactly one mode may be enabled:
# - external: OpenAI-compatible HTTPS endpoint with an API key.
# - local: sovereign/self-hosted OpenAI-compatible endpoint (Ollama/vLLM gateway).
_AI_EXTERNAL_FLAG = os.environ.get("AI_EXTERNAL_ENABLED", "false").strip().lower()
_AI_LOCAL_FLAG = os.environ.get("AI_LOCAL_ENABLED", "false").strip().lower()
if _AI_EXTERNAL_FLAG not in ("true", "false"):
    raise RuntimeError("AI_EXTERNAL_ENABLED must be true or false")
if _AI_LOCAL_FLAG not in ("true", "false"):
    raise RuntimeError("AI_LOCAL_ENABLED must be true or false")
AI_EXTERNAL_ENABLED = _AI_EXTERNAL_FLAG == "true"
AI_LOCAL_ENABLED = _AI_LOCAL_FLAG == "true"
if AI_EXTERNAL_ENABLED and AI_LOCAL_ENABLED:
    raise RuntimeError("Enable only one of AI_EXTERNAL_ENABLED or AI_LOCAL_ENABLED")

AI_BASE_URL = os.environ.get("AI_BASE_URL", "").strip().rstrip("/")
AI_API_KEY = os.environ.get("AI_API_KEY", "").strip()
AI_MODEL = os.environ.get("AI_MODEL", "").strip()
AI_LOCAL_BASE_URL = os.environ.get(
    "AI_LOCAL_BASE_URL",
    "http://127.0.0.1:11434/v1" if AI_LOCAL_ENABLED and ENV == "dev" else "",
).strip().rstrip("/")
AI_LOCAL_API_KEY = os.environ.get("AI_LOCAL_API_KEY", "").strip()
AI_LOCAL_MODEL = os.environ.get("AI_LOCAL_MODEL", "").strip()
AI_TIMEOUT_SECONDS = float(os.environ.get("AI_TIMEOUT_SECONDS", "20"))
if not 3 <= AI_TIMEOUT_SECONDS <= 60:
    raise RuntimeError("AI_TIMEOUT_SECONDS must be between 3 and 60")

if AI_EXTERNAL_ENABLED:
    _ai_url = urlsplit(AI_BASE_URL)
    if not AI_BASE_URL or not AI_API_KEY or not AI_MODEL:
        raise RuntimeError("External AI requires AI_BASE_URL, AI_API_KEY and AI_MODEL")
    if not _ai_url.hostname or _ai_url.username or _ai_url.password:
        raise RuntimeError("AI_BASE_URL must be a provider base URL without embedded credentials")
    if ENV == "prod" and _ai_url.scheme != "https":
        raise RuntimeError("ENV=prod requires HTTPS AI_BASE_URL")

# Optional live agricultural weather provider. Open-Meteo free API is evaluation/non-commercial only.
_WEATHER_FLAG = os.environ.get("WEATHER_PROVIDER_ENABLED", "false").strip().lower()
if _WEATHER_FLAG not in ("true", "false"):
    raise RuntimeError("WEATHER_PROVIDER_ENABLED must be true or false")
WEATHER_PROVIDER_ENABLED = _WEATHER_FLAG == "true"
WEATHER_BASE_URL = os.environ.get(
    "WEATHER_BASE_URL",
    "https://api.open-meteo.com/v1/forecast" if WEATHER_PROVIDER_ENABLED and ENV == "dev" else "",
).strip().rstrip("/")
WEATHER_API_KEY = os.environ.get("WEATHER_API_KEY", "").strip()
WEATHER_TIMEOUT_SECONDS = float(os.environ.get("WEATHER_TIMEOUT_SECONDS", "10"))
if not 3 <= WEATHER_TIMEOUT_SECONDS <= 30:
    raise RuntimeError("WEATHER_TIMEOUT_SECONDS must be between 3 and 30")

if WEATHER_PROVIDER_ENABLED:
    _weather_url = urlsplit(WEATHER_BASE_URL)
    if not WEATHER_BASE_URL or not _weather_url.hostname or _weather_url.username or _weather_url.password:
        raise RuntimeError("Weather provider requires a valid base URL without embedded credentials")
    if _weather_url.scheme not in ("http", "https"):
        raise RuntimeError("WEATHER_BASE_URL must use http or https")
    if ENV == "prod":
        if _weather_url.hostname == "api.open-meteo.com":
            raise RuntimeError(
                "Production must not use Open-Meteo free API; configure the commercial customer endpoint or self-hosted service"
            )
        if _weather_url.hostname == "customer-api.open-meteo.com" and not WEATHER_API_KEY:
            raise RuntimeError("Open-Meteo customer API requires WEATHER_API_KEY")
        if _weather_url.scheme != "https":
            _trusted_internal_weather_hosts = {"localhost", "127.0.0.1", "::1", "weather", "foggara-weather"}
            if _weather_url.hostname not in _trusted_internal_weather_hosts:
                raise RuntimeError("Production weather over HTTP must use a trusted internal service hostname")


if AI_LOCAL_ENABLED:
    _local_ai_url = urlsplit(AI_LOCAL_BASE_URL)
    if not AI_LOCAL_BASE_URL or not AI_LOCAL_MODEL:
        raise RuntimeError("Local AI requires AI_LOCAL_BASE_URL and AI_LOCAL_MODEL")
    if not _local_ai_url.hostname or _local_ai_url.username or _local_ai_url.password:
        raise RuntimeError("AI_LOCAL_BASE_URL must be a model-service base URL without embedded credentials")
    if _local_ai_url.scheme not in ("http", "https"):
        raise RuntimeError("AI_LOCAL_BASE_URL must use http or https")
    if ENV == "prod" and _local_ai_url.scheme == "http":
        _allowed_internal_ai_hosts = {"localhost", "127.0.0.1", "::1", "ollama", "foggara-ai", "ai"}
        if _local_ai_url.hostname not in _allowed_internal_ai_hosts:
            raise RuntimeError(
                "Production local AI over HTTP must use an explicitly trusted internal service hostname"
            )
