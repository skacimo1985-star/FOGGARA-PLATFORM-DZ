#!/bin/sh
set -e

mkdir -p /tmp/app-run && chmod 700 /tmp/app-run
export XDG_RUNTIME_DIR=${XDG_RUNTIME_DIR:-/tmp/app-run}
export PGDATA_DIR=${PGDATA_DIR:-/home/app/pgdata}
export DATABASE_URL="postgresql+psycopg://postgres@/foggara?host=${PGDATA_DIR}"
export JWT_SECRET=${JWT_SECRET:-$(python -c 'import secrets; print(secrets.token_hex(32))')}

# تشغيل PostgreSQL المضمّن (pgserver) كمستخدم غير root
python - <<EOF
import pgserver
srv = pgserver.get_server("${PGDATA_DIR}")
print("PostgreSQL up:", srv.get_uri())
EOF

# إنشاء قاعدة foggara إن لم توجد
python - <<EOF
import psycopg
con = psycopg.connect("host=${PGDATA_DIR} user=postgres dbname=postgres", autocommit=True)
if not con.execute("SELECT 1 FROM pg_database WHERE datname='foggara'").fetchone():
    con.execute("CREATE DATABASE foggara")
    print("database foggara created")
con.close()
EOF

cd /app/backend
python -m alembic upgrade head
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"

