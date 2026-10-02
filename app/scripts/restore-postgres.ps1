# FOGGARA-DZ — استرجاع قاعدة PostgreSQL من نسخة pg_dump
# تحذير: عملية مدمّرة للهدف. لا تشغّلها على قاعدة الإنتاج إلا بقرار بشري مخوّل.
#
# الاستخدام (تدريب استرجاع على قاعدة اختبار — الطريقة الموصى بها للتحقق الدوري):
#   $env:TARGET_DATABASE_URL = "postgresql://...قاعدة-اختبار..."
#   .\restore-postgres.ps1 -DumpFile ".\backups\foggara-20261002-120000.dump" -ConfirmRestore
#
# التحقق بعد الاسترجاع (تدريب): يفحص عدد الجداول ورأس Alembic ويعرضهما للمقارنة.

param(
    [Parameter(Mandatory=$true)][string]$DumpFile,
    [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"

if (-not $ConfirmRestore) {
    Write-Error "أضف -ConfirmRestore صراحةً. الاسترجاع يكتب فوق قاعدة الهدف."
}
if (-not $env:TARGET_DATABASE_URL) {
    Write-Error "اضبط TARGET_DATABASE_URL في البيئة (قاعدة الهدف) — لا تمرّره في سطر الأوامر."
}
if (-not (Test-Path $DumpFile)) { Write-Error "الملف غير موجود: $DumpFile" }
if (-not (Get-Command pg_restore -ErrorAction SilentlyContinue)) {
    Write-Error "pg_restore غير مثبت."
}

& pg_restore --dbname="$env:TARGET_DATABASE_URL" --clean --if-exists --no-owner --no-privileges "$DumpFile"
# pg_restore يرجع رمزًا غير صفري أحيانًا مع تحذيرات حميدة؛ التحقق الفعلي بالاستعلام التالي:
Write-Host "انتهى pg_restore برمز $LASTEXITCODE — التحقق بالاستعلام:" -ForegroundColor Yellow

$check = "SELECT count(*) AS tables FROM information_schema.tables WHERE table_schema='public'; SELECT version_num FROM alembic_version;"
& psql "$env:TARGET_DATABASE_URL" -c "$check"

Write-Host "قارن الناتج بالمتوقع (39+ جدولًا، ورأس alembic الحالي) قبل اعتماد الاسترجاع." -ForegroundColor Green
