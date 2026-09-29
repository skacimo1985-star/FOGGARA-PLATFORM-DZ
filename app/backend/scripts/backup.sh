#!/bin/sh
# نسخ احتياطي لقاعدة FOGGARA-DZ عبر pg_dump مضغوطًا بختم زمني.
# الاستخدام:
#   DATABASE_URL="postgresql+psycopg://user:pass@host:5432/foggara" ./backup.sh
#   أو داخل compose:  docker compose exec db ... (انظر README)
# المتغيرات:
#   DATABASE_URL  (مطلوب) رابط SQLAlchemy — يُحوَّل تلقائيًا إلى URI يفهمه pg_dump
#   BACKUP_DIR    (اختياري) مجلد الإخراج، افتراضي ./backups
#   RETENTION_DAYS (اختياري) حذف النسخ الأقدم من N يومًا إن عُيّن
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"

BACKUP_DIR=${BACKUP_DIR:-./backups}
mkdir -p "$BACKUP_DIR"

# pg_dump لا يفهم صيغة السائق postgresql+psycopg:// — نحوّلها إلى postgresql://
URI=$(printf '%s' "$DATABASE_URL" | sed 's|^postgresql+psycopg://|postgresql://|')

TS=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/foggara-$TS.sql.gz"

pg_dump --no-owner --no-privileges "$URI" | gzip -9 > "$OUT"
echo "backup written: $OUT"

if [ -n "${RETENTION_DAYS:-}" ]; then
    find "$BACKUP_DIR" -name 'foggara-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
fi
