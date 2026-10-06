"""Authenticated runtime-readiness summary without secret disclosure."""
from __future__ import annotations

import time

from fastapi import APIRouter, Depends
from sqlalchemy import text

from .. import config
from ..db import engine
from ..deps import get_current_user
from ..models import User

router = APIRouter(prefix="/api/system", tags=["system-readiness"])


def _database_state() -> dict:
    started = time.perf_counter()
    revision = "unknown"
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
            try:
                revision = connection.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
            except Exception:
                revision = "none"
        status = "up"
    except Exception:
        status = "down"
    return {
        "status": status,
        "latency_ms": round((time.perf_counter() - started) * 1000, 1),
        "schema_revision": revision,
        "engine": "postgresql" if config.DATABASE_URL.startswith(("postgresql", "postgres")) else "sqlite",
    }


def _ai_state() -> dict:
    configured = (
        config.AI_PROVIDER_MODE != "deterministic"
        and bool(config.AI_BASE_URL)
        and bool(config.AI_MODEL)
        and (config.AI_PROVIDER_MODE != "external" or bool(config.AI_API_KEY))
    )
    return {
        "status": "configured" if configured else "deterministic",
        "mode": config.AI_PROVIDER_MODE if configured else "deterministic",
        "model": config.AI_MODEL if configured else None,
        "data_boundary": "operator-local" if configured and config.AI_PROVIDER_MODE == "local"
        else "external-provider" if configured and config.AI_PROVIDER_MODE == "external"
        else "in-process",
    }


def _weather_state() -> dict:
    configured = bool(
        config.WEATHER_PROVIDER_ENABLED
        and config.WEATHER_BASE_URL
        and config.WEATHER_PROVIDER_NAME
        and config.WEATHER_PROVIDER_ATTRIBUTION
        and config.WEATHER_PROVIDER_ATTRIBUTION_URL
    )
    return {
        "status": "configured" if configured else "disabled",
        "enabled": config.WEATHER_PROVIDER_ENABLED,
        "provider": config.WEATHER_PROVIDER_NAME if configured else None,
        "forecast_provenance": "INFERRED" if configured else None,
        "field_execution": False,
    }


@router.get("/readiness")
def readiness(_user: User = Depends(get_current_user)):
    database = _database_state()
    runtime_healthy = database["status"] == "up"
    production_mode = config.ENV == "prod"
    core = {
        "database": database,
        "environment": {
            "mode": config.ENV,
            "production_mode": production_mode,
            "app_version": config.APP_VERSION,
        },
        "security": {
            "cors_explicit": bool(config.CORS_ORIGINS),
            "hsts_expected": production_mode,
            "jwt_ttl_hours": config.TOKEN_TTL_HOURS,
        },
    }
    integrations = {
        "satellite": {
            "status": "available",
            "provider_contract": "fixed-element84-sentinel2",
            "provenance": "COMPUTED/INFERRED",
            "field_execution": False,
        },
        "weather": _weather_state(),
        "ai": _ai_state(),
        "automation": {
            "status": "web-runtime-enabled" if config.OPERATIONS_AUTOMATION_ENABLED else "web-runtime-disabled",
            "web_runtime_enabled": config.OPERATIONS_AUTOMATION_ENABLED,
            "external_worker_observed": False,
        },
    }
    assurance_gates = [
        {"key": "backup_restore", "status": "NOT_PROVEN"},
        {"key": "hosted_tls_proxy", "status": "NOT_PROVEN"},
        {"key": "load_capacity", "status": "NOT_PROVEN"},
        {"key": "incident_response", "status": "NOT_PROVEN"},
        {"key": "legal_privacy_approval", "status": "NOT_PROVEN"},
    ]
    return {
        "runtime_status": "healthy" if runtime_healthy else "degraded",
        "deployment_mode": config.ENV,
        "production_mode": production_mode,
        "production_certification": False,
        "core": core,
        "integrations": integrations,
        "assurance_gates": assurance_gates,
        "meaning": "Runtime health and configuration visibility only; not production certification.",
    }
