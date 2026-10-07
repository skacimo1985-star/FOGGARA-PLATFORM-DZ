#!/bin/sh
# Production startup: external DATABASE_URL required; synthetic demo data is opt-in only.
set -e

cd /app/backend
python -m alembic upgrade head
python seed_reference.py

case "$(printf '%s' "${SEED_DEMO:-false}" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')" in
  1|true|yes) python seed.py ;;
esac

exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" --no-proxy-headers
