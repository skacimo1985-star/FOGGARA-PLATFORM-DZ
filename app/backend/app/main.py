import logging
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy import text

from . import config
from .db import engine
from .routers import (agriculture, agriculture_operations, audit, auth, collaboration, core, decisions, energy, explore, insight, intelligence,
                        metrology, services, simulator, telemetry, water,
                        workflow)

# --- سجلات بنيوية: مستوى من LOG_LEVEL، سطر واحد لكل طلب API ---
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("foggara")

app = FastAPI(
    title="FOGGARA-DZ API",
    version=config.APP_VERSION,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

# CORS: من CORS_ORIGINS فقط. قائمة فارغة = نفس الأصل فقط، ولا تُضاف الوسيطة أصلًا.
if config.CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# سياسة أمن المحتوى: أصول وخطوط محلية فقط.
_CSP = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self' 'unsafe-inline'; "
    "font-src 'self'; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
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
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    # سجل الطلب: method/path/status/ms فقط — لا ترويسات إطلاقًا، فلا يمكن
    # أن يتسرّب Authorization أو كلمات المرور إلى السجلات بنيويًا.
    log.info("%s %s -> %s %.1fms", request.method, request.url.path,
             response.status_code, elapsed_ms)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if request.url.path.startswith("/api"):
        response.headers.setdefault("Cache-Control", "no-store")
    if request.url.path == "/service-worker.js":
        response.headers.setdefault("Cache-Control", "no-cache")
    if request.url.path not in _DOCS_PATHS:
        response.headers.setdefault("Content-Security-Policy", _CSP)
    return response


@app.exception_handler(RequestValidationError)
async def validation_handler(request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={
        "detail": {"code": "VALIDATION_ERROR", "message": "Invalid request payload",
                   "errors": [{"loc": e["loc"], "type": e["type"], "msg": e["msg"]} for e in exc.errors()[:5]]}
    })


@app.get("/api/health")
def health():
    """فحص صحة بلا مصادقة: db=up فقط بعد SELECT 1 فعلي ناجح."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status = "up"
    except Exception:
        db_status = "down"
    body = {"status": "ok" if db_status == "up" else "error",
            "db": db_status, "version": config.APP_VERSION}
    return JSONResponse(body, status_code=200 if db_status == "up" else 503)


app.include_router(auth.router)
app.include_router(collaboration.router)
app.include_router(intelligence.router)
app.include_router(agriculture.router)
app.include_router(agriculture_operations.operations_router)
app.include_router(core.router)
app.include_router(workflow.router)
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


# تقديم الواجهة المبنية (إن وُجدت) مع دعم SPA — مسارات /api تبقى للـAPI فقط
import pathlib

from fastapi.responses import FileResponse
from starlette.staticfiles import StaticFiles

_dist = pathlib.Path(__file__).resolve().parents[2] / "dist"
if _dist.is_dir():
    app.mount("/assets", StaticFiles(directory=_dist / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            return JSONResponse({"detail": {"code": "NOT_FOUND", "message": "API route not found"}}, status_code=404)
        candidate = (_dist / full_path).resolve()
        if not candidate.is_relative_to(_dist.resolve()):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_dist / "index.html")
