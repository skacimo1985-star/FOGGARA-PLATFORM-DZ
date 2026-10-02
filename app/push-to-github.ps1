# FOGGARA-DZ — رفع الكود إلى GitHub للمراجعة (بلا دفع مباشر إلى main)
#
# الضمانات:
# - مجلد عمل جديد بختم زمني — لا يُحذف ولا يُستبدل أي مجلد قائم.
# - فرع مستقل foggara/update-<timestamp> — لا دفع إلى main إطلاقًا، ولا force push.
# - المصادقة عبر مدير اعتماديات Git (Git Credential Manager) — لا رموز في
#   المعاملات ولا في رابط المستودع ولا في المحادثة.
# - يعرض git diff --stat قبل الالتزام، ويتوقف فور فشل أي أمر Git.
# - العمل الموجود في المستودع لا يُفقد: الفرع يُبنى فوق main الحالي، والمراجعة
#   والدمج قرار بشري عبر Pull Request.
#
# المتطلبات: git مثبت + تسجيل دخول مسبق عبر `git credential-manager` (أو أول
# محاولة push ستفتح نافذة تسجيل الدخول تلقائيًا).

param(
    [string]$RepoUrl = "https://github.com/skacimo1985-star/FOGGARA-PLATFORM-DZ.git",
    [string]$WorkDir = ""
)

$ErrorActionPreference = "Stop"

function Invoke-Git {
    param([string[]]$GitArgs)
    & git @GitArgs
    if ($LASTEXITCODE -ne 0) { throw "فشل أمر Git: git $($GitArgs -join ' ') (رمز $LASTEXITCODE)" }
}

# 0) تحقق من الأدوات
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { throw "git غير مثبت." }

# 1) مجلد عمل جديد فريد — لا حذف لأي شيء قائم
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
if (-not $WorkDir) { $WorkDir = Join-Path $env:TEMP "foggara-review-$stamp" }
if (Test-Path $WorkDir) { throw "مجلد العمل موجود مسبقًا (لن نستبدله): $WorkDir" }
$branch = "foggara/update-$stamp"

# 2) استنساخ فوق main الحالي (العمل الموجود أساس الفرع)
Invoke-Git -GitArgs @("clone", "--branch", "main", $RepoUrl, $WorkDir)
Set-Location $WorkDir
Invoke-Git -GitArgs @("checkout", "-b", $branch)

# 3) نسخ الحزمة إلى مجلد app مع استبعاد المخلفات — بلا حذف مسبق؛
#    robocopy /E يحافظ على الملفات الموجودة، وأي فرق سيظهر في diff للمراجعة البشرية.
$src = $PSScriptRoot
$dst = Join-Path $WorkDir "app"
robocopy $src $dst /E /XD node_modules dist .git __pycache__ .pytest_cache .venv venv backups /XF ".env" ".env.local" ".env.production" "*.dump" "*.db" "*.db-journal" /NFL /NDL /NJH /NJS | Out-Null
# robocopy يرجع 0..7 للنجاح، 8+ للفشل
if ($LASTEXITCODE -ge 8) { throw "فشل robocopy برمز $LASTEXITCODE" }

# 4) عرض الفروقات للمراجعة قبل الالتزام — قرار المتابعة بشري
Invoke-Git -GitArgs @("add", "-A")
$stat = Invoke-Git -GitArgs @("diff", "--cached", "--stat")
if (-not $stat) { Write-Host "لا فروقات — المستودع محدث أصلًا. توقف."; exit 0 }
Write-Host "`n=== الفروقات التي سترفع للمراجعة ===" -ForegroundColor Cyan
Invoke-Git -GitArgs @("diff", "--cached", "--stat")
$answer = Read-Host "`nالمتابعة بالالتزام والدفع إلى الفرع $branch ؟ (نعم/لا)"
if ($answer -ne "نعم") { Write-Host "أُلغي بطلبك — لم يُلتزم ولم يُدفع شيء."; exit 0 }

# 5) التزام + دفع الفرع (المصادقة عبر مدير الاعتماديات)
Invoke-Git -GitArgs @("-c", "user.name=skacimo1985-star",
           "-c", "user.email=skacimo1985-star@users.noreply.github.com",
           "commit", "-m", "FOGGARA-DZ: ops hardening + pagination + rate-limit proxy handling")
Invoke-Git -GitArgs @("push", "-u", "origin", $branch)   # بلا --force إطلاقًا

Write-Host "`nاكتمل رفع الفرع: $branch" -ForegroundColor Green
Write-Host "الخطوة التالية (يدوية): افتح Pull Request من $branch إلى main وراجع الفروقات ثم ادمج:"
Write-Host "  https://github.com/skacimo1985-star/FOGGARA-PLATFORM-DZ/compare/main...$branch" -ForegroundColor Cyan
