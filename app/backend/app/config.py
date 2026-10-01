"""تهيئة التطبيق — كل القيم تُقرأ من متغيرات البيئة (انظر .env.example).

قاعدة الأمان الأساسية: عند ENV=prod يُرفض الإقلاع بأي JWT_SECRET افتراضي/ضعيف.
"""
import os
import re

# الافتراضي بلا إعداد: SQLite محلي (تطوير/تجربة بلا Docker).
# للإنتاج: PostgreSQL عبر DATABASE_URL صريح — انظر .env.example.
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "sqlite:///./foggara.db",
)

# Render/Supabase provide PostgreSQL URLs; the installed driver is psycopg 3.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql+psycopg://", 1)
elif DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg://", 1)

DATABASE_SCHEMA = os.environ.get("DATABASE_SCHEMA", "public")
if not re.fullmatch(r"[a-z_][a-z0-9_]{0,62}", DATABASE_SCHEMA):
    raise RuntimeError("Invalid DATABASE_SCHEMA")

_DEFAULT_JWT_SECRET = "dev-only-secret-change-me-32bytes-min!"
JWT_SECRET = os.environ.get("JWT_SECRET", _DEFAULT_JWT_SECRET)

TOKEN_TTL_HOURS = int(os.environ.get("TOKEN_TTL_HOURS", "12"))

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


