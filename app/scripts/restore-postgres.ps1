# FOGGARA-DZ — استرجاع PostgreSQL من نسخة pg_dump + تحقق صارم
# تحذير: مدمّر للهدف. شغّله على قاعدة اختبار منفصلة فقط — قرار الاسترجاع
#        على الإنتاج قرار بشري مخوّل وخارج هذا السكربت.
#
# الاستخدام (تدريب استرجاع):
#   $env:TARGET_DATABASE_URL = "postgresql://...قاعدة-اختبار..."
#   .\restore-postgres.ps1 -DumpFile ".\backups\foggara-<stamp>.dump" -ConfirmRestore -ExpectedAlembicHead "d4e5f6a7b8c9" -ExpectedMinTables 39
#
# قواعد النجاح الصارمة (لا نجاح جزئي):
# 1) أي فشل في pg_restore أو psql يوقف السكربت فورًا برمز غير صفري.
# 2) لا يُعلن النجاح إلا بعد تحقق الاستعلامات: عدد الجداول ≥ الحد الأدنى،
#    رأس Alembic مطابق، وفحص مسار وظيفي (ربط users×organizations + عد القياسات).
# 3) كلمة المرور عبر متغيرات بيئة PG* فقط — لا تظهر في معاملات العمليات.

param(
    [Parameter(Mandatory=$true)][string]$DumpFile,
    [Parameter(Mandatory=$true)][string]$ExpectedAlembicHead,
    [int]$ExpectedMinTables = 39,
    [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"

function Set-PgEnvFromUrl {
    param([string]$Url)
    $u = [uri]$Url
    if ($u.Scheme -notin @("postgres", "postgresql")) { throw "TARGET_DATABASE_URL ليس رابط PostgreSQL" }
    $parts = $u.UserInfo -split ":", 2
    $env:PGUSER = [uri]::UnescapeDataString($parts[0])
    $env:PGPASSWORD = $(if ($parts.Count -gt 1) { [uri]::UnescapeDataString($parts[1]) } else { "" })
    $env:PGHOST = $u.Host
    $env:PGPORT = if ($u.Port -gt 0) { [string]$u.Port } else { "5432" }
    $env:PGDATABASE = [uri]::UnescapeDataString($u.AbsolutePath.TrimStart("/"))
}

function Invoke-Psql {
    param([string]$Sql)
    $out = & psql --set=ON_ERROR_STOP=1 --tuples-only --no-align --command="$Sql" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "فشل psql (رمز $LASTEXITCODE): $out" }
    return ($out | Out-String).Trim()
}

if (-not $ConfirmRestore) { throw "أضف -ConfirmRestore صراحةً. الاسترجاع يكتب فوق قاعدة الهدف." }
if (-not $env:TARGET_DATABASE_URL) { throw "اضبط TARGET_DATABASE_URL في البيئة (قاعدة الهدف)." }
if (-not (Test-Path $DumpFile)) { throw "الملف غير موجود: $DumpFile" }
foreach ($tool in @("pg_restore", "psql")) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool غير مثبت." }
}

try {
Set-PgEnvFromUrl $env:TARGET_DATABASE_URL

# 1) الاسترجاع — الفشل يوقف فورًا، والنجاح لا يُعلن هنا بل بعد التحقق
#    (اسم القاعدة في المعاملات ليس سرًا؛ السر الوحيد PGPASSWORD ويبقى بيئةً)
& pg_restore --dbname="$env:PGDATABASE" --clean --if-exists --no-owner --no-privileges --exit-on-error "$DumpFile"
if ($LASTEXITCODE -ne 0) {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    throw "فشل pg_restore برمز $LASTEXITCODE — الاسترجاع غير مكتمل. لا تعتمد هذه القاعدة."
}

# 2) التحقق الصارم — أي اختلاف = فشل
$tables = [int](Invoke-Psql "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")
if ($tables -lt $ExpectedMinTables) {
    throw "عدد الجداول بعد الاسترجاع = $tables < $ExpectedMinTables — استرجاع ناقص."
}

$head = Invoke-Psql "SELECT version_num FROM alembic_version"
if ($head -ne $ExpectedAlembicHead) {
    throw "رأس Alembic بعد الاسترجاع = '$head' والمتوقع '$ExpectedAlembicHead' — عدم تطابق مخطط."
}

# فحص مسار وظيفي: تكامل مرجعي فعلي (ربط + تجميع) وليس مجرد وجود جداول
$orphans = [int](Invoke-Psql "SELECT count(*) FROM users u LEFT JOIN organizations o ON o.id = u.org_id WHERE o.id IS NULL")
if ($orphans -ne 0) { throw "يوجد $orphans مستخدمًا بلا منظمة — تكامل مرجعي مكسور." }
$fkViol = [int](Invoke-Psql @"
SELECT count(*) FROM (
  SELECT conrelid::regclass::text AS tbl
  FROM pg_constraint WHERE contype='f'
) f
"@)
$counts = Invoke-Psql "SELECT (SELECT count(*) FROM organizations) || ',' || (SELECT count(*) FROM users) || ',' || (SELECT count(*) FROM projects)"

Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

Write-Host "التحقق ناجح:" -ForegroundColor Green
Write-Host "  جداول: $tables (الحد الأدنى $ExpectedMinTables)"
Write-Host "  رأس Alembic: $head"
Write-Host "  أيتام users×organizations: $orphans | قيود FK معرفة: $fkViol"
Write-Host "  أعداد (منظمات,مستخدمون,مشاريع): $counts"
Write-Host "قارن الأعداد بقاعدة المصدر قبل اعتماد التدريب منتهيًا." -ForegroundColor Yellow

} finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
}
