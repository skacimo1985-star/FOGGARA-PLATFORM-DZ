# FOGGARA-DZ — دفع الكود إلى مستودعك على GitHub
# يحافظ على تاريخ مستودعك الحالي (fast-forward، بلا force push).
# الاستخدام:
#   1) أنشئ Personal Access Token من: GitHub → Settings → Developer settings → Tokens (classic) → صلاحية repo
#   2) نفّذ:   .\push-to-github.ps1 -Token "ghp_XXXXXXXXXXXX"
# ملاحظة أمنية: لا تضع الرمز داخل أي ملف يُرفع إلى Git، ومرّره كمعامل فقط.

param(
    [Parameter(Mandatory=$true)][string]$Token,
    [string]$RepoUrl = "https://github.com/skacimo1985-star/FOGGARA-PLATFORM-DZ.git",
    [string]$WorkDir = "$env:TEMP\foggara-push"
)

$ErrorActionPreference = "Stop"

# 1) استنساخ مستودعك (يحافظ على commit الموجود لديك)
if (Test-Path $WorkDir) { Remove-Item -Recurse -Force $WorkDir }
git clone $RepoUrl $WorkDir

# 2) نسخ كود المنصة إلى مجلد app داخل المستودع (Render build root = app)
$dst = Join-Path $WorkDir "app"
if (Test-Path $dst) { Remove-Item -Recurse -Force $dst }
Copy-Item -Recurse -Force $PSScriptRoot $dst
# استبعاد مخلفات البناء المحلية إن وُجدت
foreach ($junk in @("node_modules", "dist", ".git")) {
    $j = Join-Path $dst $junk
    if (Test-Path $j) { Remove-Item -Recurse -Force $j }
}
Get-ChildItem -Recurse -Force $dst -Filter "*.db" | Remove-Item -Force

# 3) commit + push (بلا --force: التاريخ متصل)
Set-Location $WorkDir
git add -A
git -c user.name="skacimo1985-star" -c user.email="skacimo1985-star@users.noreply.github.com" `
    commit -m "FOGGARA-DZ: Phases 1-3 (water domain, decision engine, telemetry simulator) + production deploy setup"
$authUrl = $RepoUrl -replace "https://", "https://skacimo1985-star:$Token@"
git push $authUrl main

Write-Host ""
Write-Host "تم الدفع. افتح: $RepoUrl" -ForegroundColor Green
Write-Host "تنبيه: إن ظهر الرمز في سجل shell لديك، أبطله (Revoke) وأنشئ رمزاً جديداً." -ForegroundColor Yellow
