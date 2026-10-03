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
