#!/usr/bin/env bash
# FOGGARA-DZ — نسخ احتياطي PostgreSQL (Linux/macOS). يكافئ backup-postgres.ps1.
# الاستخدام:
#   export DATABASE_URL="postgresql://postgres.<ref>:<password>@...pooler.supabase.com:5432/postgres"
#   ./backup-postgres.sh
# ضمانات: كلمة المرور عبر متغيرات بيئة PG* فقط (لا تظهر في معاملات العمليات)،
# وأي فشل في pg_dump يوقف السكربت برمز غير صفري — لا نجاح جزئي.
set -euo pipefail

: "${DATABASE_URL:?ضع DATABASE_URL في البيئة أولًا}"
command -v pg_dump >/dev/null || { echo "pg_dump غير مثبت" >&2; exit 1; }

# تفكيك الرابط إلى متغيرات PG* — يدعم:
#   TCP:    postgresql://user:pass@host[:port]/db
#   socket: postgresql://user[:pass]@/db?host=/مسار/المقبس
proto_removed="${DATABASE_URL#*://}"
userinfo="${proto_removed%%@*}"
hostpart="${proto_removed#*@}"
export PGUSER="${userinfo%%:*}"
[ "$userinfo" != "${userinfo#*:}" ] && export PGPASSWORD="${userinfo#*:}" || true
if [ "$hostpart" != "${hostpart#*\?}" ] && [ "$hostpart" != "${hostpart#*host=}" ]; then
  # نموذج المقبس: host يأتي من معامل الاستعلام
  export PGHOST="${hostpart#*host=}"
  PGHOST="${PGHOST%%&*}"
  export PGDATABASE="${hostpart%%\?*}"
  PGDATABASE="${PGDATABASE#/}"
  export PGPORT="5432"
else
  hostpart_nq="${hostpart%%\?*}"
  hostport="${hostpart_nq%%/*}"
  export PGDATABASE="${hostpart_nq#*/}"
  if [ "$hostport" != "${hostport#*:}" ]; then
    export PGHOST="${hostport%%:*}"
    export PGPORT="${hostport#*:}"
  else
    export PGHOST="$hostport"
    export PGPORT="5432"
  fi
fi

OUT_DIR="${1:-$(dirname "$0")/backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$OUT_DIR/foggara-$STAMP.dump"

if ! pg_dump --format=custom --compress=6 --file="$OUT" --no-owner --no-privileges; then
  rm -f "$OUT"
  echo "فشل pg_dump — لم تُنتج نسخة." >&2
  exit 1
fi

SIZE=$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")
if [ "$SIZE" -lt 1024 ]; then
  rm -f "$OUT"
  echo "ملف صغير بشكل مريب ($SIZE بايت) — اعتبر النسخ فاشلًا." >&2
  exit 1
fi

# الاحتفاظ بآخر 14 نسخة
ls -1t "$OUT_DIR"/foggara-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f

unset PGPASSWORD
echo "اكتمل النسخ: $OUT ($SIZE بايت)"
echo "تذكير: خزّن النسخة مشفّرة وخارج أي مستودع Git."
