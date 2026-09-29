#Requires -Version 5.1
<#
.SYNOPSIS
  FOGGARA-DZ | فڨارة-DZ — تشغيل محلي فوري على Windows (Docker Desktop مطلوب).

.DESCRIPTION
  المسار أ (افتراضي) — كل شيء داخل Docker:
      powershell -ExecutionPolicy Bypass -File .\run-local.ps1
      ثم افتح: http://localhost:8000

  المسار ب — تطوير هجين (قاعدة البيانات في Docker + الباكند والواجهة على جهازك):
      powershell -ExecutionPolicy Bypass -File .\run-local.ps1 -Mode dev
      الواجهة: http://localhost:3000   (تمرر /api تلقائيًا إلى الباكند على 8000)
      يتطلب على جهازك: Python 3.12+ و Node.js 20+

  السكربت ينشئ ملف .env تلقائيًا من .env.example بأسرار عشوائية قوية إن لم يوجد.
  ملف .env لا يُودع في Git أبدًا.
#>
param(
  [ValidateSet("docker", "dev")]
  [string]$Mode = "docker"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

function New-HexSecret {
  $bytes = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  ($bytes | ForEach-Object { $_.ToString("x2") }) -join ""
}

# ── 1) التحقق من Docker ─────────────────────────────────────────
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Host "خطأ: Docker غير مثبت أو غير ظاهر في PATH. ثبّت Docker Desktop ثم أعد المحاولة." -ForegroundColor Red
  exit 1
}

# ── 2) إنشاء .env بأسرار عشوائية إن لم يوجد ────────────────────
if (-not (Test-Path ".env")) {
  Write-Host "إنشاء .env بأسرار عشوائية..." -ForegroundColor Cyan
  $jwt = New-HexSecret
  $pg  = New-HexSecret
  $env_content = Get-Content ".env.example" -Raw
  $env_content = $env_content -replace 'JWT_SECRET=', "JWT_SECRET=$jwt"
  $env_content = $env_content -replace 'POSTGRES_PASSWORD=CHANGE_ME', "POSTGRES_PASSWORD=$pg"
  $env_content = $env_content -replace 'foggara:CHANGE_ME@db:5432', "foggara:$pg@db:5432"
  Set-Content ".env" $env_content -NoNewline -Encoding UTF8
  Write-Host "تم إنشاء .env (أسرار محلية عشوائية — لا تشارك الملف)." -ForegroundColor Green
} else {
  Write-Host ".env موجود — يُستخدم كما هو." -ForegroundColor Green
}

# ── 3) التشغيل حسب المسار ───────────────────────────────────────
if ($Mode -eq "docker") {
  Write-Host "`nبناء وتشغيل المنصة كاملة داخل Docker (قد يستغرق البناء الأول عدة دقائق)..." -ForegroundColor Cyan
  docker compose up --build
  Write-Host "`nالمنصة تعمل على: http://localhost:8000" -ForegroundColor Green
  exit 0
}

# المسار ب: تطوير هجين
Write-Host "`nتشغيل قاعدة البيانات فقط داخل Docker..." -ForegroundColor Cyan
docker compose up -d db

$pgLine = (Get-Content ".env" | Where-Object { $_ -match '^POSTGRES_PASSWORD=' })
$pgPass = $pgLine -replace '^POSTGRES_PASSWORD=', ''
$jwtLine = (Get-Content ".env" | Where-Object { $_ -match '^JWT_SECRET=' })
$jwt = $jwtLine -replace '^JWT_SECRET=', ''

Write-Host "انتظار جاهزية PostgreSQL..." -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
  docker compose exec -T db pg_isready -U foggara -d foggara 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { $ready = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $ready) { Write-Host "خطأ: قاعدة البيانات لم تصبح جاهزة خلال 60 ثانية." -ForegroundColor Red; exit 1 }

# الباكند محليًا
Set-Location backend
if (-not (Test-Path ".venv")) {
  python -m venv .venv
}
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL = "postgresql+psycopg://foggara:$pgPass@localhost:5432/foggara"
$env:JWT_SECRET = $jwt
$env:ENV = "dev"
python -m alembic upgrade head
python seed.py
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; .\.venv\Scripts\Activate.ps1; `$env:DATABASE_URL='$env:DATABASE_URL'; `$env:JWT_SECRET='$jwt'; `$env:ENV='dev'; python -m uvicorn app.main:app --port 8000"
Set-Location ..

# الواجهة محليًا
npm install
Write-Host "`nالباكند يعمل على http://localhost:8000 — الواجهة ستفتح على http://localhost:3000" -ForegroundColor Green
npm run dev
