@echo off
chcp 65001 >nul
REM ============================================================
REM  FOGGARA-DZ | فڨارة-DZ — تشغيل محلي فوري بلا Docker
REM  المتطلبات: Python 3.12+ و Node.js 20+ في PATH
REM  قاعدة البيانات: SQLite تلقائيًا (ملف backend\foggara.db) — بلا أي إعداد
REM  للإنتاج الحقيقي استخدم PostgreSQL عبر docker compose (انظر README)
REM ============================================================
cd /d %~dp0

echo [1/4] تجهيز بيئة Python وتثبيت الاعتماديات...
cd backend
if not exist .venv (
  python -m venv .venv
)
call .venv\Scripts\activate.bat
pip install -q -r requirements.lock
if errorlevel 1 ( echo خطأ في تثبيت اعتماديات Python & pause & exit /b 1 )

echo [2/4] تطبيق المهاجرات على SQLite...
python -m alembic upgrade head
if errorlevel 1 ( echo خطأ في المهاجرات & pause & exit /b 1 )

echo [3/4] Initial database ready. Register your organization at /register.

echo [4/4] تشغيل الباكند والواجهة في نافذتين منفصلتين...
start "FOGGARA-API" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --port 8000"
cd ..
if not exist node_modules (
  npm install
)
start "FOGGARA-WEB" cmd /k "npm run dev"

echo.
echo ============================================================
echo  الواجهة:  http://localhost:3000
echo  الباكند:  http://localhost:8000  (فحص الصحة: /api/health)
echo ============================================================
pause

