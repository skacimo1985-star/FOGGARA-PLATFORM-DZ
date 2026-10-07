"""Investor-facing AI brief built from aggregated FOGGARA state."""
from __future__ import annotations

import json
import logging
from typing import Literal

import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .. import config
from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import (
    AgriObservation, AgriParcel, Evidence, GovDecision, Measurement, Project, ServiceRequest,
    Site, TelemetryReading, User, WaterAllocation,
)

log = logging.getLogger("foggara.ai")
router = APIRouter(prefix="/api/ai", tags=["ai-insights"])


class BriefIn(BaseModel):
    locale: Literal["ar", "fr", "en"] = "ar"
    project_id: int | None = Field(default=None, gt=0)


class FieldAdvisoryIn(BaseModel):
    locale: Literal["ar", "fr", "en"] = "ar"
    parcel_id: int = Field(gt=0)


def _count(db: Session, model, *conditions) -> int:
    return int(db.scalar(select(func.count()).select_from(model).where(*conditions)) or 0)


def _snapshot(db: Session, user: User, project_id: int | None):
    project = None
    if project_id is not None:
        project = db.scalar(select(Project).where(Project.id == project_id, Project.org_id == user.org_id))
        if project is None:
            api_error(404, "NOT_FOUND", "Project not found")

    scope = {
        "type": "project" if project else "organization",
        "project_id": project.id if project else None,
        "project_title": project.title if project else None,
        "domain": project.domain if project else None,
        "is_demo": bool(project.is_demo) if project else None,
    }
    org = user.org_id
    evidence_conditions = [Evidence.org_id == org]
    measurement_conditions = [Measurement.org_id == org]
    if project:
        evidence_conditions.append(Evidence.project_id == project.id)
        measurement_conditions.append(Measurement.project_id == project.id)

    snapshot = {
        "projects_total": _count(db, Project, Project.org_id == org),
        "projects_active": _count(db, Project, Project.org_id == org, Project.status == "active"),
        "sites_total": _count(db, Site, Site.org_id == org),
        "verified_evidence": _count(db, Evidence, *evidence_conditions, Evidence.status == "verified"),
        "validated_measurements": _count(db, Measurement, *measurement_conditions, Measurement.quality_status == "validated"),
        "decisions_pending_review": _count(db, GovDecision, GovDecision.org_id == org, GovDecision.status == "REVIEW_REQUIRED"),
        "decisions_verified": _count(db, GovDecision, GovDecision.org_id == org, GovDecision.status == "VERIFIED"),
        "telemetry_valid": _count(db, TelemetryReading, TelemetryReading.org_id == org, TelemetryReading.quality == "VALID"),
        "telemetry_attention": _count(db, TelemetryReading, TelemetryReading.org_id == org, TelemetryReading.quality.in_(("SUSPECT", "INVALID", "MISSING"))),
        "satellite_inferred": _count(db, AgriObservation, AgriObservation.org_id == org, AgriObservation.source_type == "satellite", AgriObservation.evidence_status == "INFERRED"),
        "service_requests_open": _count(db, ServiceRequest, ServiceRequest.org_id == org, ServiceRequest.status.in_(("submitted", "triaged", "assigned", "in_progress"))),
        "water_allocations_approved": _count(db, WaterAllocation, WaterAllocation.org_id == org, WaterAllocation.status == "approved"),
        "water_allocations_executed": _count(db, WaterAllocation, WaterAllocation.org_id == org, WaterAllocation.status == "executed"),
    }
    return scope, snapshot


def _fallback(locale: str, scope: dict, s: dict):
    if locale == "fr":
        headline = "FOGGARA-DZ relie données, preuves, décisions et exécution dans une même chaîne."
        summary = f"Le périmètre contient {s['projects_total']} projets, {s['sites_total']} sites, {s['verified_evidence']} preuves vérifiées et {s['validated_measurements']} mesures validées. {s['satellite_inferred']} observations satellite restent explicitement inférées."
        proof = [f"{s['projects_active']} projets actifs dans le portefeuille.", f"{s['telemetry_valid']} lectures télémétriques valides enregistrées.", f"{s['decisions_verified']} décisions ont terminé le cycle de vérification."]
        gaps = [f"{s['decisions_pending_review']} décisions attendent une révision humaine.", f"{s['telemetry_attention']} lectures télémétriques nécessitent une attention qualité.", f"{s['service_requests_open']} demandes de service sont encore ouvertes."]
        actions = ["Renforcer les preuves vérifiées des projets prioritaires.", "Connecter les fournisseurs météo/satellite live pour la démonstration.", "Transformer les décisions approuvées en résultats mesurables et suivis."]
    elif locale == "en":
        headline = "FOGGARA-DZ connects data, evidence, decisions and execution in one operating chain."
        summary = f"The scope contains {s['projects_total']} projects, {s['sites_total']} sites, {s['verified_evidence']} verified evidence items and {s['validated_measurements']} validated measurements. {s['satellite_inferred']} satellite observations remain explicitly inferred."
        proof = [f"{s['projects_active']} active projects are registered in the portfolio.", f"{s['telemetry_valid']} valid telemetry readings are recorded.", f"{s['decisions_verified']} decisions completed the verification lifecycle."]
        gaps = [f"{s['decisions_pending_review']} decisions are waiting for human review.", f"{s['telemetry_attention']} telemetry readings need quality attention.", f"{s['service_requests_open']} service requests remain open."]
        actions = ["Increase verified evidence coverage for priority projects.", "Connect live weather/satellite providers for the investor demo.", "Convert approved decisions into measurable monitored outcomes."]
    else:
        headline = "تربط FOGGARA-DZ البيانات والأدلة والقرارات والتنفيذ في سلسلة تشغيلية واحدة."
        summary = f"يشمل النطاق {s['projects_total']} مشروعًا و{s['sites_total']} موقعًا و{s['verified_evidence']} دليلًا موثقًا و{s['validated_measurements']} قياسًا معتمدًا. وتبقى {s['satellite_inferred']} قراءة أقمار صناعية موسومة بوضوح كمستنتجة."
        proof = [f"{s['projects_active']} مشروعًا نشطًا مسجلًا في المحفظة.", f"{s['telemetry_valid']} قراءة Telemetry صالحة مسجلة.", f"{s['decisions_verified']} قرارًا أكمل دورة التحقق."]
        gaps = [f"{s['decisions_pending_review']} قرارًا ينتظر المراجعة البشرية.", f"{s['telemetry_attention']} قراءة Telemetry تحتاج انتباهًا للجودة.", f"{s['service_requests_open']} طلب خدمة ما زال مفتوحًا."]
        actions = ["رفع تغطية الأدلة الموثقة للمشاريع ذات الأولوية.", "ربط مزودي الطقس والأقمار الصناعية المباشرين لنسخة المستثمرين.", "تحويل القرارات المعتمدة إلى نتائج قابلة للقياس والمتابعة."]

    if scope["type"] == "project":
        summary = f"{scope['project_title']}: {summary}"
    return {"headline": headline, "executive_summary": summary, "proof_points": proof, "gaps": gaps, "next_actions": actions}


def _runtime_config() -> dict | None:
    if config.AI_LOCAL_ENABLED and config.AI_LOCAL_BASE_URL and config.AI_LOCAL_MODEL:
        return {
            "mode": "local",
            "base_url": config.AI_LOCAL_BASE_URL,
            "api_key": config.AI_LOCAL_API_KEY,
            "model": config.AI_LOCAL_MODEL,
        }
    if config.AI_EXTERNAL_ENABLED and config.AI_BASE_URL and config.AI_API_KEY and config.AI_MODEL:
        return {
            "mode": "external",
            "base_url": config.AI_BASE_URL,
            "api_key": config.AI_API_KEY,
            "model": config.AI_MODEL,
        }
    return None


def _provider_configured() -> bool:
    return _runtime_config() is not None


def _clean_brief(data: object, fallback: dict) -> dict:
    if not isinstance(data, dict):
        return fallback
    result = {}
    for key in ("headline", "executive_summary"):
        value = data.get(key)
        result[key] = str(value)[:2000] if isinstance(value, str) and value.strip() else fallback[key]
    for key in ("proof_points", "gaps", "next_actions"):
        value = data.get(key)
        if isinstance(value, list):
            cleaned = [str(item)[:500] for item in value if isinstance(item, str) and item.strip()][:6]
            result[key] = cleaned or fallback[key]
        else:
            result[key] = fallback[key]
    return result


def _model_brief(locale: str, scope: dict, snapshot: dict, fallback: dict):
    runtime = _runtime_config()
    if runtime is None:
        return fallback, False
    safe_payload = {"locale": locale, "scope": {"type": scope["type"], "domain": scope.get("domain"), "is_demo": scope.get("is_demo")}, "snapshot": snapshot}
    system = (
        "You are the FOGGARA-DZ investor briefing analyst. Use only the supplied aggregate JSON. "
        "Do not invent customers, revenue, national coverage claims, scientific validation, contracts or field measurements. "
        "Treat satellite values as inferred. Return JSON only with keys headline, executive_summary, proof_points, gaps, next_actions."
    )
    payload = {
        "model": runtime["model"],
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": json.dumps(safe_payload, ensure_ascii=False, separators=(",", ":"))}],
        "temperature": 0.2,
        "max_tokens": 900,
    }
    try:
        with httpx.Client(timeout=config.AI_TIMEOUT_SECONDS, follow_redirects=False) as client:
            headers = {"Content-Type": "application/json"}
            if runtime["api_key"]:
                headers["Authorization"] = f"Bearer {runtime['api_key']}"
            response = client.post(runtime["base_url"] + "/chat/completions", headers=headers, json=payload)
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"].strip()
        return _clean_brief(json.loads(content), fallback), True
    except Exception:
        log.warning("External AI brief unavailable; deterministic fallback used", exc_info=False)
        return fallback, False



def _parcel_ai_context(db: Session, user: User, parcel_id: int) -> dict:
    parcel = db.scalar(select(AgriParcel).where(
        AgriParcel.id == parcel_id,
        AgriParcel.org_id == user.org_id,
    ))
    if parcel is None:
        api_error(404, "NOT_FOUND", "Parcel not found")
    if parcel.archived:
        api_error(409, "PARCEL_ARCHIVED", "Parcel is archived")

    rows = list(db.scalars(
        select(AgriObservation)
        .where(
            AgriObservation.org_id == user.org_id,
            AgriObservation.parcel_id == parcel.id,
        )
        .order_by(AgriObservation.observed_at.desc(), AgriObservation.id.desc())
        .limit(100)
    ))
    latest = {}
    for row in rows:
        if row.metric in latest:
            continue
        latest[row.metric] = {
            "value": float(row.value),
            "unit": row.unit,
            "observed_at": row.observed_at.isoformat(),
            "source_type": row.source_type,
            "evidence_status": row.evidence_status,
        }

    return {
        "parcel": {
            "crop": parcel.crop,
            "stage": parcel.stage,
            "area_ha": float(parcel.area_ha),
        },
        "latest_metrics": latest,
        "privacy": {
            "coordinates_sent": False,
            "parcel_name_sent": False,
            "source_references_sent": False,
        },
    }


def _clean_field_advisory(data: object) -> dict:
    if not isinstance(data, dict):
        raise ValueError("AI field advisory must be a JSON object")

    summary = data.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        raise ValueError("AI field advisory has no summary")

    result = {"summary": summary.strip()[:2000]}
    for key in ("alerts", "recommended_actions", "missing_evidence"):
        value = data.get(key)
        if not isinstance(value, list):
            raise ValueError(f"AI field advisory has invalid {key}")
        result[key] = [
            str(item).strip()[:500]
            for item in value
            if isinstance(item, str) and item.strip()
        ][:8]
    return result


def _generate_field_advisory(locale: str, context: dict) -> tuple[dict, dict]:
    runtime = _runtime_config()
    if runtime is None:
        api_error(503, "AI_PROVIDER_NOT_CONFIGURED", "No operational AI model runtime is configured")

    system = (
        "You are FOGGARA-DZ Field Advisory. Use only the supplied parcel metrics. "
        "Never invent measurements, weather, soil chemistry, crop disease, or satellite values. "
        "Satellite observations marked INFERRED are not field-verified measurements. "
        "Do not calculate irrigation volumes or chemical application rates; deterministic FOGGARA services handle those calculations. "
        "Identify evidence gaps and propose reviewable next actions. "
        "Return JSON only with keys summary, alerts, recommended_actions, missing_evidence. "
        f"Write user-facing text in locale {locale}."
    )
    request_payload = {
        "model": runtime["model"],
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": json.dumps(context, ensure_ascii=False, separators=(",", ":"))},
        ],
        "temperature": 0.1,
        "max_tokens": 900,
    }
    headers = {"Content-Type": "application/json"}
    if runtime["api_key"]:
        headers["Authorization"] = f"Bearer {runtime['api_key']}"

    try:
        with httpx.Client(timeout=config.AI_TIMEOUT_SECONDS, follow_redirects=False) as client:
            response = client.post(
                runtime["base_url"] + "/chat/completions",
                headers=headers,
                json=request_payload,
            )
            response.raise_for_status()
            content = response.json()["choices"][0]["message"]["content"].strip()
        advisory = _clean_field_advisory(json.loads(content))
    except Exception:
        log.warning("Field advisory model runtime unavailable or returned invalid output", exc_info=False)
        api_error(502, "AI_PROVIDER_UNAVAILABLE", "Configured AI model runtime did not return a valid advisory")

    return advisory, {
        "mode": runtime["mode"],
        "model": runtime["model"],
        "configured": True,
    }


@router.post("/field-advisory")
def field_advisory(
    payload: FieldAdvisoryIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    context = _parcel_ai_context(db, user, payload.parcel_id)
    advisory, provider = _generate_field_advisory(payload.locale, context)
    audit(
        db,
        user,
        "generate",
        "field_ai_advisory",
        meta={
            "parcel_id": payload.parcel_id,
            "locale": payload.locale,
            "provider_mode": provider["mode"],
            "model": provider["model"],
            "metric_keys": sorted(context["latest_metrics"]),
        },
    )
    db.commit()
    return {
        "parcel_id": payload.parcel_id,
        "provider": provider,
        "analysis_input": context,
        "advisory": advisory,
        "provenance": "PROPOSED",
        "verified": False,
        "field_execution": False,
    }


@router.get("/status")
def ai_status(user: User = Depends(get_current_user)):
    runtime = _runtime_config()
    return {
        "external_enabled": config.AI_EXTERNAL_ENABLED,
        "local_enabled": config.AI_LOCAL_ENABLED,
        "configured": runtime is not None,
        "mode": f"{runtime['mode']}-ready" if runtime else "deterministic-ready",
        "model": runtime["model"] if runtime else None,
        "external_payload_policy": "aggregated_counts_only",
        "field_advisory_payload_policy": "parcel metrics only; no coordinates, names, or source references",
        "capabilities": ["investor_brief"] + (["field_advisory"] if runtime else []),
        "provenance": "PROPOSED",
    }


@router.post("/investor-brief")
def investor_brief(payload: BriefIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scope, snapshot = _snapshot(db, user, payload.project_id)
    fallback = _fallback(payload.locale, scope, snapshot)
    brief, used_external = (fallback, False)
    if _provider_configured():
        brief, used_external = _model_brief(payload.locale, scope, snapshot, fallback)
    audit(db, user, "generate", "investor_ai_brief", project_id=payload.project_id, meta={"external_used": used_external, "locale": payload.locale, "scope": scope["type"]})
    db.commit()
    return {
        "provider": {
            "mode": (_runtime_config() or {}).get("mode") if used_external else "deterministic",
            "configured": _provider_configured(),
            "model": (_runtime_config() or {}).get("model") if used_external else None,
            "fallback_used": bool(_provider_configured() and not used_external),
        },
        "scope": scope, "snapshot": snapshot, "brief": brief, "provenance": "PROPOSED",
        "generated_from": "aggregated_platform_state", "external_payload_policy": "aggregated_counts_only",
        "investment_certification": False,
    }
