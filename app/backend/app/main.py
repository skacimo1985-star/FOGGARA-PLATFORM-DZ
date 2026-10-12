import logging
import time
import uuid
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from sqlalchemy import text

from . import config
from .auth_admission import AuthAdmissionMiddleware
from .db import engine
from .routers import (audit, auth, core, decisions, energy, explore, insight,
                        metrology, services, simulator, telemetry, water,
                        workflow)
from .routers.setup import router as setup_router
from .routers.operations import router as operations_router
from .routers import agriculture, agriculture_operations, collaboration, intelligence, analytics, ai_brief, stac, ogc_features, remote_sensing_catalog, expo, workspace_setup, satellite_parcels, weather_parcels

# --- سجلات بنيوية: مستوى من LOG_LEVEL، سطر واحد لكل طلب API ---
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("foggara")

@asynccontextmanager
async def lifespan(_app):
    from .automation_runtime import run_queue
    from .field_automation_runtime import run_field_automation
    from .mqtt_edge_runtime import run_mqtt_edge

    stop = asyncio.Event()
    tasks = []
    if config.OPERATIONS_AUTOMATION_ENABLED:
        tasks.append(asyncio.create_task(run_queue(stop)))
    if config.FIELD_AUTOMATION_ENABLED:
        tasks.append(asyncio.create_task(run_field_automation(stop)))
    if config.MQTT_EDGE_ENABLED:
        tasks.append(asyncio.create_task(run_mqtt_edge(stop)))
    try:
        yield
    finally:
        stop.set()
        if tasks:
            await asyncio.gather(*tasks)  # Finish current atomic work before shutdown.

app = FastAPI(
    lifespan=lifespan,
    title="FOGGARA-DZ API",
    version=config.APP_VERSION,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.add_middleware(AuthAdmissionMiddleware)

# CORS: من CORS_ORIGINS فقط. قائمة فارغة = نفس الأصل فقط، ولا تُضاف الوسيطة أصلًا.
if config.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# سياسة أمن المحتوى: self + Google Fonts فقط (الواجهة تحمّل خطوطها منهما).
_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data: blob: https://upload.wikimedia.org https://thumb.wikimedia.org https://tiles.openfreemap.org https://assets.openfreemap.com https://s3.amazonaws.com https://tile.openstreetmap.org; "
    "connect-src 'self' https://tiles.openfreemap.org https://assets.openfreemap.com https://s3.amazonaws.com; "
    "worker-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'"
)

# صفحات التوثيق التفاعلية (Swagger/ReDoc) تحمّل أصولًا من CDN، فتُعفى من CSP فقط
# (تبقى بقية الترويسات). المعرفة بهذه الصفحات موثقة في README.
_DOCS_PATHS = {"/api/docs", "/api/docs/oauth2-redirect", "/api/openapi.json", "/api/redoc"}


@app.middleware("http")
async def security_and_request_logging(request: Request, call_next):
    start = time.perf_counter()
    request_id = uuid.uuid4().hex[:8]
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    # سجل الطلب: method/path/status/ms + معرف طلب للتتبع — لا ترويسات إطلاقًا،
    # فلا يمكن أن يتسرّب Authorization أو كلمات المرور إلى السجلات بنيويًا.
    log.info("%s %s -> %s %.1fms req=%s", request.method, request.url.path,
             response.status_code, elapsed_ms, request_id)
    if request.url.path.startswith("/api"):
        response.headers.setdefault("Cache-Control", "no-store")
    if request.url.path == "/service-worker.js":
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    # Public SPA documents must revalidate so a successful deploy is visible
    # immediately instead of being masked by a stale browser shell.
    path_leaf = request.url.path.rsplit("/", 1)[-1]
    if (
        request.method == "GET"
        and not request.url.path.startswith("/api")
        and not request.url.path.startswith("/assets/")
        and "." not in path_leaf
    ):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers.setdefault("X-Request-ID", request_id)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    # HSTS في الإنتاج فقط (التطوير قد يعمل على HTTP محلي).
    if config.ENV == "prod":
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
    if request.url.path not in _DOCS_PATHS:
        response.headers.setdefault("Content-Security-Policy", _CSP)
    return response


@app.exception_handler(RequestValidationError)
async def validation_handler(request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={
        "detail": {"code": "VALIDATION_ERROR", "message": "Invalid request payload",
                   "errors": jsonable_encoder([{k: v for k, v in e.items() if k not in ("ctx", "input")} for e in exc.errors()[:5]])}
    })


@app.get("/api/health")
def health():
    """فحص صحة بلا مصادقة: db=up فقط بعد SELECT 1 فعلي ناجح.

    يضيف زمن استجابة القاعدة ورأس مخطط Alembic — مؤشران تشغيليان لا يكشفان
    أي بيانات حساسة (رقم نسخة المخطط ليس سرًا).
    """
    t0 = time.perf_counter()
    alembic_head = "unknown"
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
            try:
                alembic_head = conn.execute(
                    text("SELECT version_num FROM alembic_version")
                ).scalar_one()
            except Exception:
                alembic_head = "none"
        db_status = "up"
    except Exception:
        db_status = "down"
    db_ms = round((time.perf_counter() - t0) * 1000, 1)
    body = {"status": "ok" if db_status == "up" else "error",
            "db": db_status, "version": config.APP_VERSION,
            "db_ms": db_ms, "alembic": alembic_head}
    return JSONResponse(body, status_code=200 if db_status == "up" else 503)


app.include_router(auth.router)
app.include_router(core.router)
app.include_router(workflow.router)
app.include_router(analytics.router)
app.include_router(insight.router)
app.include_router(audit.router)
app.include_router(metrology.router)
app.include_router(services.router)
app.include_router(explore.router)
app.include_router(energy.router)
app.include_router(water.router)
app.include_router(decisions.router)
app.include_router(telemetry.router)
app.include_router(simulator.router)
app.include_router(simulator.rules_router)
app.include_router(setup_router)
app.include_router(operations_router)
app.include_router(collaboration.router)
app.include_router(intelligence.router)
app.include_router(agriculture.router)
app.include_router(agriculture_operations.operations_router)
app.include_router(ai_brief.router)
app.include_router(stac.router)
app.include_router(ogc_features.router)
app.include_router(remote_sensing_catalog.router)
app.include_router(satellite_parcels.router)
app.include_router(weather_parcels.router)
app.include_router(expo.router)
app.include_router(workspace_setup.router)


# تقديم الواجهة المبنية (إن وُجدت) مع دعم SPA — مسارات /api تبقى للـAPI فقط
import pathlib

from fastapi.responses import FileResponse
from starlette.staticfiles import StaticFiles

_dist = pathlib.Path(__file__).resolve().parents[2] / "dist"
if _dist.is_dir():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")
    _images = _dist / "images"
    if _images.is_dir():
        app.mount("/images", StaticFiles(directory=_images), name="images")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = (_dist / full_path).resolve()
        if not candidate.is_relative_to(_dist.resolve()):
            raise HTTPException(status_code=404, detail="Not found")
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_dist / "index.html")

