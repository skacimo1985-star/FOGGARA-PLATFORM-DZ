#!/usr/bin/env bash
# FOGGARA-DZ — نسخ احتياطي PostgreSQL (Linux/macOS). يكافئ backup-postgres.ps1.
# الاستخدام:
#   export DATABASE_URL="postgresql://postgres.<ref>:<password>@...pooler.supabase.com:5432/postgres"
#   ./backup-postgres.sh
set -euo pipefail

: "${DATABASE_URL:?ضع DATABASE_URL في البيئة أولًا}"
command -v pg_dump >/dev/null || { echo "pg_dump غير مثبت" >&2; exit 1; }

OUT_DIR="${1:-$(dirname "$0")/backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$OUT_DIR/foggara-$STAMP.dump"

pg_dump --dbname="$DATABASE_URL" --format=custom --compress=6 --file="$OUT" --no-owner --no-privileges

SIZE=$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")
[ "$SIZE" -lt 1024 ] && { echo "ملف صغير بشكل مريب ($SIZE بايت)" >&2; exit 1; }

# الاحتفاظ بآخر 14 نسخة
ls -1t "$OUT_DIR"/foggara-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f

echo "اكتمل النسخ: $OUT ($SIZE بايت)"
echo "تذكير: خزّن النسخة مشفّرة وخارج أي مستودع Git."
