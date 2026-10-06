#!/usr/bin/env bash
# نسخ احتياطي لقاعدة FOGGARA-DZ عبر pg_dump مضغوطًا بختم زمني.
# الاستخدام:
#   DATABASE_URL="postgresql+psycopg://user:pass@host:5432/foggara" ./backup.sh
#   أو داخل compose:  docker compose exec db ... (انظر README)
# المتغيرات:
#   DATABASE_URL  (مطلوب) رابط SQLAlchemy — يُحوَّل تلقائيًا إلى URI يفهمه pg_dump
#   BACKUP_DIR    (اختياري) مجلد الإخراج، افتراضي ./backups
#   RETENTION_DAYS (اختياري) حذف النسخ الأقدم من N يومًا إن عُيّن
set -euo pipefail
umask 077

: "${DATABASE_URL:?DATABASE_URL is required}"

BACKUP_DIR=${BACKUP_DIR:-./backups}
mkdir -p "$BACKUP_DIR"

# pg_dump لا يفهم صيغة السائق postgresql+psycopg:// — نحوّلها إلى postgresql://
URI=$(printf '%s' "$DATABASE_URL" | sed 's|^postgresql+psycopg://|postgresql://|')

TS=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/foggara-$TS.sql.gz"

# Keep the legacy gzip format, but never put the URI/password in process args.
# libpq reads PGDATABASE as a connection string when it contains a URI.
PARTIAL="$OUT.partial"
trap 'rm -f "$PARTIAL"' EXIT
PGDATABASE="$URI" pg_dump --no-owner --no-privileges | gzip -9 > "$PARTIAL"
gzip -t "$PARTIAL"
mv "$PARTIAL" "$OUT"
echo "backup written: $OUT"

if [ -n "${RETENTION_DAYS:-}" ]; then
    find "$BACKUP_DIR" -name 'foggara-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
fi
