#!/bin/sh
# إقلاع إنتاجي: بلا pgserver — يتطلب DATABASE_URL خارجيًا (تفرضه config عند ENV=prod).
set -e

cd /app/backend
python -m alembic upgrade head
if [ "${SEED_DEMO:-false}" = "true" ]; then
  python seed.py
fi
exec python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"

