#Requires -Version 5.1
<#
.SYNOPSIS
  FOGGARA-DZ | فڨارة-DZ — تشغيل محلي على Windows، مع Docker أو بدونه.

.DESCRIPTION
  المسار أ (افتراضي) — كل شيء داخل Docker:
      powershell -ExecutionPolicy Bypass -File .\run-local.ps1
      ثم افتح: http://localhost:8000

  المسار ب — تطوير محلي بلا Docker (SQLite + الباكند والواجهة على جهازك):
      powershell -ExecutionPolicy Bypass -File .\run-local.ps1 -Mode dev
      الواجهة: http://localhost:3000   (تمرر /api تلقائيًا إلى الباكند على 8000)
      يتطلب على جهازك: Python 3.12+ و Node.js 20+؛ قاعدة البيانات SQLite للتجربة فقط.

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

# ── 3) التشغيل حسب المسار ───────────────────────────────────────
if ($Mode -eq "docker") {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "خطأ: Docker غير مثبت أو غير ظاهر في PATH. استخدم -Mode dev للتشغيل بلا Docker." -ForegroundColor Red
    exit 1
  }

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

  Write-Host "`nبناء وتشغيل المنصة كاملة داخل Docker (قد يستغرق البناء الأول عدة دقائق)..." -ForegroundColor Cyan
  docker compose up --build
  Write-Host "`nالمنصة تعمل على: http://localhost:8000" -ForegroundColor Green
  exit 0
}

# المسار ب: تطوير محلي بقاعدة SQLite — لا Docker ولا ملف .env مطلوبان.
foreach ($command in @("python", "npm")) {
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    Write-Host "خطأ: $command غير موجود في PATH." -ForegroundColor Red
    exit 1
  }
}

Set-Location backend
if (-not (Test-Path ".venv")) {
  python -m venv .venv
}
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL = "sqlite:///./foggara.db"
$env:JWT_SECRET = New-HexSecret
$env:ENV = "dev"
python -m alembic upgrade head
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
python seed.py
$pythonExe = Join-Path $PWD ".venv\Scripts\python.exe"
$backendPath = $PWD.Path
Start-Process -FilePath $pythonExe -ArgumentList @("-m", "uvicorn", "app.main:app", "--port", "8000") -WorkingDirectory $backendPath
Set-Location $PSScriptRoot

# الواجهة محليًا
if (-not (Test-Path "node_modules")) { npm install }
Write-Host "`nالباكند يعمل على http://localhost:8000 — الواجهة ستفتح على http://localhost:3000" -ForegroundColor Green
Start-Process -FilePath "cmd.exe" -ArgumentList @("/c", "npm run dev") -WorkingDirectory $PSScriptRoot
Write-Host "افتح http://localhost:3000 في المتصفح. أوقف الخادمين من نافذتيهما عند الانتهاء." -ForegroundColor Green
