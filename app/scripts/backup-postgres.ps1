# FOGGARA-DZ — نسخ احتياطي لقاعدة PostgreSQL (Supabase)
# الاستخدام:
#   $env:DATABASE_URL = "postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
#   .\backup-postgres.ps1
# الناتج: backups\foggara-YYYYMMDD-HHMMSS.dump (صيغة pg_dump المخصصة المضغوطة)
# أمان: لا يطبع الرابط ولا كلمة المرور إطلاقًا؛ يمررها عبر متغير بيئة داخلي فقط.

param(
    [string]$OutDir = "$PSScriptRoot\backups"
)

$ErrorActionPreference = "Stop"

if (-not $env:DATABASE_URL) {
    Write-Error "اضبط DATABASE_URL في البيئة أولًا (لا تمرّره في سطر الأوامر حتى لا يبقى في السجل)."
}
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    Write-Error "pg_dump غير مثبت. ثبّت PostgreSQL client tools وأعد المحاولة."
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$out = Join-Path $OutDir "foggara-$stamp.dump"

# pg_dump يقرأ الرابط كاملاً؛ لا نسجّل أي جزء منه
& pg_dump --dbname="$env:DATABASE_URL" --format=custom --compress=6 --file="$out" --no-owner --no-privileges
if ($LASTEXITCODE -ne 0) { Write-Error "فشل pg_dump برمز $LASTEXITCODE" }

$size = (Get-Item $out).Length
if ($size -lt 1024) { Write-Error "الملف الناتج صغير بشكل مريب ($size بايت) — تحقق يدويًا." }

# احتفاظ بآخر 14 نسخة فقط
Get-ChildItem $OutDir -Filter "foggara-*.dump" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 14 |
    Remove-Item -Force

Write-Host "اكتمل النسخ: $out ($size بايت)" -ForegroundColor Green
Write-Host "تذكير: ملف النسخة يحوي بيانات حساسة — خزّنه مشفّرًا وخارج أي مستودع Git." -ForegroundColor Yellow
