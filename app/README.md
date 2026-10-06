# فڨارة-DZ | FOGGARA-DZ — النواة التشغيلية (MVP)

منصة جزائرية وطنية ضمن نطاق **WEFEH** (المياه، الطاقة، الغذاء، المنظومة البيئية، الصحة).
هذه النسخة تنفّذ سير عمل **WATER** كاملًا على نواة كيانات عامة قابلة للتوسع:

> مشروع → قياس → تحقق → دليل → تحليل (مؤشر) → مراجعة بشرية → قرار بشري → إجراء → متابعة، مع سجل تدقيق.

**تنبيه**: جميع البيانات المزروعة اصطناعية وموسومة `DEMO` — ليست قياسات ميدانية ولا أرقامًا وطنية.

## البنية التقنية وسبب الاختيار

| الطبقة | الاختيار | السبب |
|---|---|---|
| الواجهة | React 19 + TypeScript + Vite + Tailwind | مطلوب في المواصفة؛ بناء سريع ومكوّنات قليلة مستخدمة فعليًا |
| الـBackend | Python + FastAPI + SQLAlchemy + Alembic | صغير وواضح، دعم PostgreSQL أصيل، مهاجرات Alembic معيارية، منظومة pytest ناضجة، كله مجاني ومفتوح المصدر |
| قاعدة البيانات | PostgreSQL 16 | الهدف المعلن؛ العزل والقيود تُفرض على مستوى الاستعلامات والخادم |

## هيكل المستودع

```
backend/            FastAPI + SQLAlchemy + Alembic
  app/models.py     الكيانات: مؤسسات، مستخدمون، مواقع، موارد، أصول، مشاريع،
                    قياسات، أدلة، مراجعات، مؤشرات، توصيات، قرارات بشرية، إجراءات،
                    أدوات قياس، معايرات، شهادات، تفتيشات، خدمات، طلبات خدمة، تدقيق
  app/routers/      auth / core / workflow / insight / audit /
                    metrology / services / explore / energy (solar) /
                    water / decisions / telemetry / simulator / setup
  app/services/     التحقق من القياسات + حساب المؤشر + قاعدة التوصية القابلة للتفسير
                    + قاعدة سريان المعايرة والشهادة (metrology)
                    + solar.py: موقع الشمس بخوارزمية NOAA المنشورة (بلا اعتمادية جديدة)
  requirements-dev.txt  اعتماديات الاختبارات فقط (pysolar/pytz — انظر قسم الرخص)
  app/wilayas.py    الدليل الإداري المحلي (ولايات — منسوخ من src/lib/wilayas.ts)
  app/messages_i18n.json  رسائل الأخطاء/الحالات بالعربية والفرنسية والإنجليزية
  alembic/          المهاجرات (الأولى + توسعة المترولوجيا/الخدمات/سير العمل)
  scripts/backup.sh نسخ احتياطي pg_dump مضغوط بختم زمني (انظر «التشغيل الإنتاجي»)
  seed.py           بيانات DEMO موسومة (idempotent)
  tests/            اختبارات القبول (pytest)
src/                الواجهة (React) — عربية RTL افتراضيًا + Français + English
  pages/            الرئيسية (Nexus + القصريّة)، استكشاف WEFEH (5 أبعاد)، المشاريع
                    ومساحة العمل، القياسات، المترولوجيا، الخدمات، التحليلات، المياه،
                    القرارات، القياس عن بُعد، المحاكي، المواقع (GIS يدوي)،
                    IoT (مخطط)، VDE (مخطط)، المؤسسة، المراجعة، التدقيق
  components/       ProvenanceBadge (شارات المصدر: مرصود/موثَّق/محسوب/مستنتَج/مقترَح)،
                    KasriaNexus (مرئية القصريّة)، TelemetryChart (مخطط SVG خفيف
                    يميّز المرصود عن المحاكى)، مكونات ui المستخدمة فعليًا فقط
  lib/api.ts        عميل API مركزي: مصادقة، مهلة 20 ثانية (TIMEOUT)، أخطاء مترجمة،
                    إسقاط الجلسة عند 401 — ممنوع fetch مبعثر داخل المكونات
Dockerfile          تشغيل شامل بأمر واحد (PostgreSQL مضمّن عبر pgserver للتجربة)
```

## التشغيل المحلي على Windows (PowerShell)

### 0) الأسرع بلا Docker — SQLite تلقائيًا (تطوير/تجربة)

```bat
run-local.bat
```

ينشئ بيئة Python، يثبّت الاعتماديات، يطبّق المهاجرات على SQLite (ملف `backend\foggara.db` يُنشأ تلقائيًا)، يزرع البيانات التجريبية، ثم يشغّل الباكند (:8000) والواجهة (:3000) في نافذتين. المتطلبات فقط: Python 3.12+ و Node.js 20+ في PATH. لا يصلح للإنتاج — عند `ENV=prod` يُرفض الإقلاع على SQLite ويُفرض PostgreSQL.

### 1) PostgreSQL
أثبّت PostgreSQL 16 من المثبّت الرسمي، أو عبر Docker:

```powershell
docker run -d --name foggara-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
```

المتوقع: حاوية PostgreSQL تعمل على المنفذ 5432. ثم أنشئ القاعدتين:

```powershell
docker exec -it foggara-pg psql -U postgres -c "CREATE DATABASE foggara;" -c "CREATE DATABASE foggara_test;"
```

المتوقع: سطران `CREATE DATABASE` (أو خطأ «موجودة مسبقًا» إن كانت منشأة).

### 2) الـBackend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATABASE_URL = "postgresql+psycopg://postgres:postgres@localhost:5432/foggara"
$env:JWT_SECRET = "بدّل-هذا-بمفتاح-عشوائي-طويل-32-حرفا-على-الأقل"
python -m alembic upgrade head
python seed.py
python -m uvicorn app.main:app --port 8000
```

المتوقع بعد `seed.py`: سطر `Inserted: {...}` يعدّد الكيانات المزروعة (وفي التشغيل الثاني: «Seed already up to date — nothing inserted (idempotent).»). وبعد uvicorn: خادم على http://localhost:8000 مع واجهة API توثيقية على `/api/docs`.

### 3) الواجهة (في نافذة PowerShell أخرى)

```powershell
npm ci
npm run build     # بناء الإنتاج إلى dist/ — يقدّمه FastAPI نفسه على :8000
# أو للتطوير مع إعادة تحميل فوري:
npm run dev       # http://localhost:3000 مع بروكسي /api إلى :8000
```

المتوقع: فتح http://localhost:8000 (إنتاج) أو http://localhost:3000 (تطوير) يعرض صفحة المنصة بالعربية RTL.

### 4) الاختبارات

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
$env:DATABASE_URL = "postgresql+psycopg://postgres:postgres@localhost:5432/foggara_test"
python -m pytest tests/ -q
```

المتوقع: `68 passed` — تغطي: سير العمل الكامل حتى القرار البشري، العزل بين المؤسسات عبر API (404 للمؤسسة الأخرى، بما فيه explore وGIS وwater وtelemetry)، منع المؤشر من بيانات غير متحقق منها، منع منح «موثَّق» ذاتيًا، رفض القيم/الوحدات غير الصالحة (422)، عدم افتراضية حالة verified، إلزامية المصادقة، بوابة المعايرة (لا اعتماد لقياس من أداة بلا معايرة سارية)، سير طلب الخدمة ومصفوفة انتقالات حالته (القفزة/الرجوع/الملغى → 409)، قواعد القرار البشري وقرار التوصية (reviewer/admin فقط، السبب إلزامي، منع القرار الذاتي)، طلب التوضيح في المراجعة، منع المراجعة المكررة (409 ALREADY_REVIEWED)، النافذة الزمنية للمؤشر (افتراضية ومخصصة)، شفافية المؤشر (الصيغة/المصادر/النافذة)، تطبيع مرادفات الوحدات (l/s ↔ L/s) حتى لا يُستبعد قياس صالح من الحساب، التحليل الشمسي الفلكي (خمسة اختبارات تشمل التقاطع مع مرجع مستقل)، نطاق المياه (الآبار/الخزانات/المضخات/الصمامات/المناطق/التخصيصات وآلة حالاتها)، محرك القرارات العام (دورة الحياة الكاملة PROPOSED→…→VERIFIED وفصل المهام)، والقياس عن بُعد/المحاكي الحتمي (الاستيعاب والتحقق ومنع التكرار، فرض الوحدات، التجميع الدقيق، تقييم القواعد → اقتراح قرار فقط، العزل وIDOR).

## حسابات DEMO

تُنشأ هذه الحسابات فقط عند تفعيل `SEED_DEMO=true`. لا توجد كلمة مرور افتراضية داخل المستودع؛
يجب ضبط `DEMO_PASSWORD` في بيئة التشغيل/إدارة الأسرار قبل تنفيذ seed، ولا تُطبع قيمته في السجلات.

| الحساب | الدور |
|---|---|
| member@demo1.dz | عضو (مؤسسة 1) |
| reviewer@demo1.dz | مراجع (مؤسسة 1) |
| admin@demo1.dz | مشرف (مؤسسة 1) |
| member@demo2.dz | عضو (مؤسسة 2 — لاختبار العزل) |
| reviewer@demo2.dz | مراجع (مؤسسة 2) |

## Docker (تشغيل شامل واحد)

```powershell
docker build -t foggara-dz .
docker run -p 8000:8000 foggara-dz
```

يشغّل PostgreSQL مضمّنًا (pgserver، للتجربة فقط) + المهاجرات + seed + التطبيق على http://localhost:8000. الحاوية تتضمن `HEALTHCHECK` يضرب `/api/health`.

## التشغيل الإنتاجي (محلي/خادم — بلا نشر عام وبلا خدمات سحابية)

### المتغيرات (`.env` — انسخ `.env.example` وعبّئه؛ `.env` مستبعدة من git عبر `.gitignore`)

| المتغير | الوصف |
|---|---|
| `ENV` | `dev` أو `prod`. عند `prod` يُرفض الإقلاع بـ `JWT_SECRET` الافتراضي أو الأقصر من 32 حرفًا |
| `JWT_SECRET` | سر توقيع JWT. أنشئه: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `TOKEN_TTL_HOURS` | مدة صلاحية التوكن بالساعات (افتراضي 12) |
| `DATABASE_URL` | رابط PostgreSQL بسائق psycopg: `postgresql+psycopg://user:pass@host:5432/foggara` |
| `CORS_ORIGINS` | أصول مسموحة مفصولة بفواصل؛ **فارغ = نفس الأصل فقط** ولا رؤوس CORS تُرسل |
| `SEED_DEMO` | تفعيل بيانات العرض الاصطناعية فقط عند الحاجة؛ الافتراضي `false` |
| `DEMO_PASSWORD` | مطلوب عند `SEED_DEMO=true`؛ من 15 إلى 128 حرفًا، ويُضبط كسر في بيئة التشغيل ولا يُحفظ في Git |
| `DEMO_INSTANCE` | مطلوب مع `SEED_DEMO=true` في `ENV=prod` لعزل نسخة المعرض عن الإنتاج الحقيقي |
| `LOG_LEVEL` | `DEBUG`/`INFO`/`WARNING`/`ERROR` (افتراضي `INFO`) |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | تهيئة خدمة db في compose |

### الإقلاع عبر docker-compose

```bash
cp .env.example .env     # عبّئ JWT_SECRET وPOSTGRES_PASSWORD ووحّدها في DATABASE_URL
docker compose up --build
```

خدمة `app` تُبنى من `Dockerfile.prod` (بلا pgserver — أي بلا PostgreSQL مضمّن) ولا تبدأ حتى تكون خدمة `db` بحالة healthy. عند الإقلاع تُطبَّق المهاجرات ثم seed (idempotent). فحص الصحة: `curl http://localhost:8000/api/health` يعيد `{"status":"ok","db":"up","version":...}` بعد `SELECT 1` فعلي؛ عند سقوط القاعدة يعيد `db:"down"` مع HTTP 503.

> `Dockerfile` الأصلي (pgserver) يبقى للتجربة الشاملة بأمر واحد فقط، و`Dockerfile.prod` هو مسار الإنتاج — اخترنا ملفًا منفصلًا لأنه أوضح وأبسط من build args شرطية.

### HTTPS خلف بروكسي عكسي (توصية)

التطبيق يستمع HTTP على :8000. للإنتاج ضعه خلف بروكسي عكسي على نفس الخادم (nginx أو Caddy) يُنهي TLS بشهادة موثوقة ويمرّر إلى `127.0.0.1:8000`، مع تقييد منفذ 8000 على loopback أو جدار الحماية. التنفيذ متروك لمشغّل الخادم — لا يُشحن إعداد بروكسي في هذا المستودع.

### النسخ الاحتياطي والاسترجاع

```bash
# نسخة مضغوطة بختم زمني في ./backups (أو BACKUP_DIR)
DATABASE_URL="postgresql+psycopg://foggara:***@localhost:5432/foggara" \
  backend/scripts/backup.sh
# RETENTION_DAYS=30 تحذف النسخ الأقدم من 30 يومًا تلقائيًا
```

الاسترجاع إلى قاعدة فارغة/جديدة:

```bash
createdb foggara_restore
gunzip -c backups/foggara-YYYYMMDD-HHMMSS.sql.gz | psql "postgresql://foggara:***@localhost:5432/foggara_restore"
```

ثم وجّه `DATABASE_URL` إلى القاعدة المسترجعة وأعد الإقلاع. جرّب الاسترجاع دوريًا — النسخة غير المختبرة ليست نسخة.

### ترقية المهاجرات

تُطبَّق تلقائيًا عند إقلاع الحاوية (`alembic upgrade head`). يدويًا:

```bash
cd backend && python -m alembic upgrade head
```

### تدوير JWT_SECRET

1. أنشئ سرًّا جديدًا (`secrets.token_hex(32)`) وضعه في `.env`.
2. أعد تشغيل التطبيق: `docker compose up -d --force-recreate app`.
3. كل التوكنات القديمة تصبح غير صالحة فورًا — يُعاد تسجيل الدخول (لا حالة خادمية للجلسات).

### ملاحظات أمنية تشغيلية

- **CSP**: `default-src 'self'` + Google Fonts فقط (الواجهة تحمّل خطوطها منه). صفحات التوثيق `/api/docs` و`/api/openapi.json` و`/api/redoc` **معفاة من CSP فقط** لأن Swagger/ReDoc يحمّلان أصولًا من CDN؛ تبقى عليها بقية الترويسات (nosniff/DENY/no-referrer).
- **السجلات**: سطر واحد لكل طلب `(method, path, status, ms)` — لا ترويسات تُسجَّل إطلاقًا، فلا يمكن بنيويًا تسريب `Authorization` أو كلمات المرور.
- كل الحاويات تعمل بمستخدم غير root.

## قواعد الأمان المطبقة

- عزل المؤسسات على الخادم: كل استعلام مقيّد بـ `org_id` للمستخدم؛ الوصول بمعرّف جهة أخرى يعيد 404 (لا يسرّب الوجود).
- المراجعة لدور `reviewer`/`admin` فقط، ولا يجوز مراجعة ما قدّمه المراجع بنفسه.
- قرار التوصية والقرارات البشرية لدور `reviewer`/`admin` فقط (403 لغيرهما)، والسبب إلزامي، ولا قرار ذاتي، ولا مراجعة مكررة على هدف محسوم (409).
- حالة الدليل تبدأ `submitted` دائمًا من الخادم؛ لا يمكن للواجهة فرض `verified`.
- المؤشر يُحسب من قياسات `validated` فقط، ويعيد «بيانات غير كافية» عند النقص.
- كلمات المرور PBKDF2-SHA256 (120 ألف تكرار)؛ الجلسات JWT موقّعة.
- عند `ENV=prod` يُرفض الإقلاع بـ `JWT_SECRET` الافتراضي/الضعيف (فشل سريع برسالة واضحة).
- ترويسات أمنية على كل الاستجابات: `X-Content-Type-Options: nosniff`، `X-Frame-Options: DENY`، `Referrer-Policy: no-referrer`، وCSP تقتصر على self + Google Fonts.
- CORS من `CORS_ORIGINS` فقط؛ الافتراضي فارغ = نفس الأصل.
- `/api/health` بلا مصادقة يفحص القاعدة بـ `SELECT 1` فعلي (db: up/down).
- كل فعل مهم يُسجَّل في `audit_logs` (من/ماذا/متى/أي مشروع).

## أقسام المنصة وحالتها الفعلية

| القسم | المسار | الحالة |
|---|---|---|
| الرئيسية العامة | `/` | يعمل — بلا أرقام وطنية وهمية |
| الرئيسية التشغيلية (Nexus) | `/app` | يعمل — مرئية القصريّة (5 روافد WEFEH) + بطاقات Nexus من نقاط نهاية حقيقية (مؤسسة/مشاريع/موارد/مستشعرات/قراءات/قواعد/محاكاة/قرارات) مع حالات «غير متاح»/«لا بيانات» صريحة |
| استكشاف WEFEH (5 أبعاد) | `/app/explore` ثم `/app/explore/{domain}` | يعمل؛ الأقسام غير المنجزة تظهر «قيد التخطيط» مع البيانات المطلوبة |
| مساحة العمل والمشاريع | `/app/projects` + `/app/projects/{id}` | يعمل — تبويبات Overview/Data/Evidence/Reviews/Actions/Audit |
| البيانات والقياسات | داخل المشروع، تبويب Data | يعمل — نموذج موحّد، رفض وحدة/قيمة غير صالحة، حالات جودة وتحقق، شارات provenance (مرصود/موثَّق) |
| المترولوجيا | `/app/metrology` | يعمل — أدوات/معايرات/شهادات بحالة وصلاحية، بوابة اعتماد القياس |
| الأدلة وسير العمل | تبويب Evidence + `/app/review` | يعمل — قبول/رفض/طلب توضيح، قرارات بشرية موثقة |
| الخدمات | `/app/services` | يعمل — كتالوج DEMO موسوم + طلبات خدمة بحالات |
| المؤسسة والأعضاء | `/app/org` | جزئي — يعرض المتوفر فعليًا؛ الدعوات رسالة ضبطية فقط (لا backend دعوات بعد) |
| GIS | `/app/gis` | يعمل يدويًا — ولاية/بلدية/إحداثيات يدوية، بلا مكتبة خرائط خارجية |
| IoT/SCADA | `/app/iot` | مخطط (Planned) — نموذج الكيانات + تحذير الأوامر الميدانية |
| المياه (نطاق) | `/app/water` | يعمل — آبار/خزانات/مضخات/VFD/صمامات/مناطق ري/تخصيصات بآلة حالات |
| القرارات | `/app/decisions` | يعمل — دورة حياة كاملة، فصل مهام، أدلة/تنفيذ/تحقق؛ مقترحات القواعد موسومة PROPOSED |
| القياس عن بُعد | `/app/telemetry` | يعمل — أحدث القراءات، فلاتر، تجميع حتمي، مخطط سلسلة زمنية SVG خفيف يميّز المرصود عن المحاكى |
| المحاكي | `/app/simulator` | يعمل — سيناريوهات حتمية بذرة، شارة SIMULATION ONLY، النتائج موسومة COMPUTED ولا تتنكر كرصد |
| التحليلات | `/app/analytics` | يعمل — صيغة/وحدات/نافذة/مصادر/صلاحية لكل مؤشر، القيم موسومة COMPUTED |
| VDE / Data Room | `/app/vde` | مخطط (Planned) — مسار إفصاح مضبوط بلا محاكاة قانونية |

## المساهمة عبر GitHub (PowerShell — بدون المساس بأي عمل قائم)

المبدأ: هذه الحزمة هي تحديث للمجلد القائم `FOGGARA-DZ-MVP/app/` في `main`. تُراجع الفروقات على فرع، ولا force push ولا دفع لـ main مباشرة.

```powershell
# 1) استنساخ مستودعك الحقيقي وفحص main قبل أي تعديل
git clone https://github.com/SIREP-OASIS-NEXUS-TECH-DZ/FOGGARA-PLATFORM-DZ-.git
cd FOGGARA-PLATFORM-DZ-
git checkout main
git pull origin main
git log --oneline -5          # تحقق بعينك من رأس main الحقيقي

# 2) فرع مشتق من main فقط
git checkout -b feat/platform-extensions

# 3) فك الحزمة في مجلد مؤقت خارج المستودع (عدّل مسار ZIP حسب مكان تنزيله)
Expand-Archive -Path "$env:USERPROFILE\Downloads\FOGGARA-DZ-MVP.zip" -DestinationPath "$env:TEMP\foggara-mvp"

# 4) نسخ محتوى الحزمة فوق مجلد التطبيق القائم (تحديث لنفس المشروع، وليس مشروعًا جديدًا)
robocopy "$env:TEMP\foggara-mvp\FOGGARA-DZ-MVP\app" ".\FOGGARA-DZ-MVP\app" /E /NFL /NDL

# 5) راجع الفروقات بعينك قبل الإضافة
git status
git diff --stat

# 6) إضافة مجلد المشروع فقط — لا git add .
git add FOGGARA-DZ-MVP
git status                    # تأكد أن التغييرات كلها تحت FOGGARA-DZ-MVP/ فقط

# 7) commit ودفع الفرع فقط
git commit -m "feat: metrology, services, human decisions, explore WEFEH, analytics transparency"
git push -u origin feat/platform-extensions
```

المتوقع بعد `git push`: رابط فرع `feat/platform-extensions` على المستودع، يُفتح منه Pull Request نحو `main` للمراجعة البشرية قبل أي دمج. المهاجرة الأولى `b75c73c8456b` لم تُعدَّل — التوسعة مهاجرة إضافية فقط.

## الرخص

- كود المنصة وخوارزمية `solar.py`: تنفيذ ذاتي لخوارزمية **NOAA Solar Calculations** المنشورة والعامة (https://gml.noaa.gov/grad/solcalc/) — لا اعتمادية إنتاج جديدة.
- **pysolar** (في `backend/requirements-dev.txt`): **للاختبارات فقط** كمرجع تحقق مستقل يقارن مخرجات `solar.py`؛ لا يُستدعى ولا يُوزَّع مع كود الإنتاج. رخصته كما وردت حرفيًا في `pip show pysolar`:
  `License: GNU General Public License (GPL)`
- **pytz** (اختبارات فقط): `License: MIT`.

## حدود معروفة / مؤجَّل بوعي

- القيم الشمسية محسوبة فلكيًا من الإحداثيات — ليست قياسًا ميدانيًا ولا بديلًا عن دراسة شمسية مرخّصة (شارة SOLAR_COMPUTED_NOT_MEASURED ظاهرة في الواجهة والـAPI).

- لا رفع ملفات ثنائية للأدلة بعد — الدليل حاليًا وصف + رخصة + رابط مرجعي.
- لا مصادر طقس/استشعار حية؛ لا GPS تلقائي؛ اختيار الموقع يدوي (الطقس يعرض رسالة «غير متاح في هذه النسخة»).
- الدليل الإداري المحلي يغطي الولايات فقط حاليًا (لا بلديات في المصدر الأصلي).
- لا backend دعوات مؤسسات/مستخدمين بعد — الزر يعرض رسالة ضبطية فقط.
- أبعاد WEFEH غير water معلنة «قيد التخطيط» في أقسامها غير المنجزة ولا تدّعي العمل.
- IoT/SCADA وVDE صفحات مخطط صريحة بلا محاكاة أجهزة أو صفقات.
- النشر العام (Cloudflare أو غيره) مرحلة لاحقة بعد مراجعة النسخة وإذن صريح منفصل.

## التشغيل الإنتاجي (Ops) — إضافة 2026-10-02

### النسخ الاحتياطي والاسترجاع
خطة Supabase المجانية لا تتضمن نسخًا مجدولًا — الاستراتيجية المعتمدة هي `pg_dump` دوري:
- `scripts/backup-postgres.ps1` (Windows) أو `scripts/backup-postgres.sh` (Linux):
  ينتج ملف `backups/foggara-<timestamp>.dump` بصيغة pg_dump المخصصة، يحتفظ بآخر 14 نسخة،
  ولا يطبع الرابط أو كلمة المرور إطلاقًا (تُمرَّر عبر متغير البيئة فقط).
- `scripts/restore-postgres.ps1`: استرجاع مدمّر للهدف — يتطلب `-ConfirmRestore` صراحةً
  ويتحقق بعد الاسترجاع بعدد الجداول ورأس Alembic.
- **تدريب الاسترجاع الدوري الموصى به**: استرجع إلى قاعدة اختبار (وليس الإنتاج)،
  وقارن عدد الجداول (39+) ورأس `alembic_version` بالمتوقع، ووثّق النتيجة.
- ملفات النسخ تحوي بيانات حساسة: تُخزَّن مشفّرة وخارج أي مستودع Git.

### مراقبة
- `GET /api/health` (بلا مصادقة): `{status, db, version, db_ms, alembic}` —
  `db=up` فقط بعد SELECT 1 فعلي، و`alembic` رقم رأس المخطط المطبق.
- سطر سجل بنيوي لكل طلب: `METHOD path -> status ms req=<id>` — بلا ترويسات
  إطلاقًا (بنيويًا لا يمكن تسريب Authorization أو كلمات المرور)، وكل استجابة
  تحمل `X-Request-ID` للربط.

### تشديد أمني
- تحديد معدل داخل العملية (نافذة منزلقة لكل IP): login افتراضيًا 10/دقيقة،
  setup/bootstrap ‏5/10 دقائق — الرمز `RATE_LIMITED` (429) ومترجم باللغات الثلاث.
- ترويسات: CSP, nosniff, DENY, no-referrer, Permissions-Policy، وHSTS في prod فقط.
- `statement_timeout` افتراضيًا 30s على PostgreSQL + تجمع اتصالات محافظ
  (pool_size=5) مناسب لـ Session Pooler.

### أداء
- سقف القوائم `LIST_MAX_LIMIT` (افتراضي 500) على: sites/resources/assets/projects/decisions.
- فهرسان مركبان لهجرة `d4e5f6a7b8c9` مبنيان على أنماط استعلام فعلية:
  `(org_id, id)` على audit_logs، و`(org_id, status)` على gov_decisions.

### تحديث الجولة الثانية (2026-10-02)
- **ترقيم الصفحات**: القوائم الخمس (sites/resources/assets/projects/decisions) تعيد
  غلافًا موحدًا `{items,total,page,page_size,pages}` مع `page` (افتراضي 1) و
  `page_size` (افتراضي 50؛ فوق 1000 يُرفض 422؛ ويُقيَّد بسقف LIST_MAX_LIMIT).
  الواجهة تعرض تنقّل صفحات في المشاريع والقرارات.
- **تحديد المعدل خلف بروكسي**: `TRUST_PROXY_HEADERS=true` (افتراضي في prod) يجعل
  المفتاح أول عنوان في X-Forwarded-For؛ بلا ثقة تُتجاهل الترويسة (مقاومة تزوير).
  الحدود: عدّاد لكل عملية — تعدد النسخ يضرب الحد الفعلي بعددها (موثق في ratelimit.py).
- **الاسترجاع**: `restore-postgres.ps1` يمرر `--dbname` صراحة (pg_restore لا يقرأ
  PGDATABASE)، ويعلن النجاح فقط بعد: خروج pg_restore بلا خطأ + عدد جداول ≥ 39 +
  رأس Alembic مطابق + صفر أيتام users×organizations.
- **تدريب منفذ فعليًا** (2026-10-02، PostgreSQL عبر pgserver): نسخ قاعدة مزروعة ←
  استرجاع لقاعدة منفصلة ← تحقق (39 جدولًا، head=d4e5f6a7b8c9، 0 أيتام) ← مسار
  وظيفي كامل (health/db=up ← دخول ← قائمة مرقّمة ← كتابة جديدة): ناجح.


## Integrated workspaces

Reviewed integration adds Data Room, invitations, agricultural intelligence, /app/agriculture, /app/nexus, /app/studio and WEFEH / production. See docs/INTEGRATION-REVIEW-2026-10-03.md. Access tokens are held in memory; reload requires login. Production never seeds demo accounts. SEED_DEMO=true is development-only.
