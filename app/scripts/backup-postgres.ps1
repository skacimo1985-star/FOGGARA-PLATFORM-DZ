# FOGGARA-DZ — نسخ احتياطي PostgreSQL (Supabase)
# الاستخدام:
#   $env:DATABASE_URL = "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
#   .\backup-postgres.ps1
# الناتج: backups\foggara-YYYYMMDD-HHMMSS.dump (صيغة pg_dump المخصصة المضغوطة)
#
# ضمانات أمنية:
# - كلمة المرور لا تظهر في معاملات العملية إطلاقًا: يُفكَّك الرابط إلى متغيرات
#   بيئة PG* داخل العملية الحالية فقط (PGPASSWORD لا يظهر في سطر أوامر pg_dump).
# - أي فشل في pg_dump يوقف السكربت برمز خروج غير صفري — لا نجاح جزئي.

param(
    [string]$OutDir = "$PSScriptRoot\backups"
)

$ErrorActionPreference = "Stop"

function Set-PgEnvFromUrl {
    param([string]$Url)
    $u = [uri]$Url
    if ($u.Scheme -notin @("postgres", "postgresql")) { throw "DATABASE_URL ليس رابط PostgreSQL" }
    $parts = $u.UserInfo -split ":", 2
    $env:PGUSER = [uri]::UnescapeDataString($parts[0])
    $env:PGPASSWORD = $(if ($parts.Count -gt 1) { [uri]::UnescapeDataString($parts[1]) } else { "" })
    $env:PGHOST = $u.Host
    $env:PGPORT = if ($u.Port -gt 0) { [string]$u.Port } else { "5432" }
    $env:PGDATABASE = [uri]::UnescapeDataString($u.AbsolutePath.TrimStart("/"))
    if (-not $env:PGDATABASE) { throw "اسم قاعدة البيانات مفقود في الرابط" }
}

if (-not $env:DATABASE_URL) {
    throw "اضبط DATABASE_URL في البيئة أولًا (لا تمرّره في سطر الأوامر)."
}
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    throw "pg_dump غير مثبت. ثبّت PostgreSQL client tools."
}

try {
Set-PgEnvFromUrl $env:DATABASE_URL

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $OutDir "foggara-$stamp.dump"

# لا --dbname برابط: الاتصال يُؤخذ من متغيرات البيئة PG* حصرًا
& pg_dump --format=custom --compress=6 --file="$out" --no-owner --no-privileges
if ($LASTEXITCODE -ne 0) {
    Remove-Item -Force $out -ErrorAction SilentlyContinue
    throw "فشل pg_dump برمز $LASTEXITCODE — لم تُنتج نسخة."
}

$size = (Get-Item $out).Length
if ($size -lt 1024) {
    Remove-Item -Force $out
    throw "الملف الناتج صغير بشكل مريب ($size بايت) — اعتبر النسخ فاشلًا."
}

# احتفاظ بآخر 14 نسخة فقط
Get-ChildItem $OutDir -Filter "foggara-*.dump" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 14 |
    Remove-Item -Force

# تنظيف كلمة المرور من بيئة الجلسة
Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

Write-Host "اكتمل النسخ: $out ($size بايت)" -ForegroundColor Green
Write-Host "تذكير: ملف النسخة يحوي بيانات حساسة — خزّنه مشفّرًا وخارج أي مستودع Git." -ForegroundColor Yellow

} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
