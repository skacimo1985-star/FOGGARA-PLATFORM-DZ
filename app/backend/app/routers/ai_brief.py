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
    AgriObservation, Evidence, GovDecision, Measurement, Project, ServiceRequest,
    Site, TelemetryReading, User, WaterAllocation,
)

log = logging.getLogger("foggara.ai")
router = APIRouter(prefix="/api/ai", tags=["ai-insights"])


class BriefIn(BaseModel):
    locale: Literal["ar", "fr", "en"] = "ar"
    project_id: int | None = Field(default=None, gt=0)


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


def _provider_configured() -> bool:
    if config.AI_PROVIDER_MODE == "deterministic":
        return False
    if not config.AI_BASE_URL or not config.AI_MODEL:
        return False
    if config.AI_PROVIDER_MODE == "external" and not config.AI_API_KEY:
        return False
    return True


def _parse_provider_json(content: object) -> object:
    if not isinstance(content, str):
        raise ValueError("provider content must be text")
    text = content.strip()
    if text.startswith("```"):
        first_newline = text.find("\n")
        if first_newline == -1:
            raise ValueError("invalid fenced provider response")
        text = text[first_newline + 1:]
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3].rstrip()
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("provider response has no JSON object")
    return json.loads(text[start:end + 1])


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


def _provider_brief(locale: str, scope: dict, snapshot: dict, fallback: dict):
    safe_payload = {"locale": locale, "scope": {"type": scope["type"], "domain": scope.get("domain"), "is_demo": scope.get("is_demo")}, "snapshot": snapshot}
    system = (
        "You are the FOGGARA-DZ investor briefing analyst. Use only the supplied aggregate JSON. "
        "Do not invent customers, revenue, national coverage claims, scientific validation, contracts or field measurements. "
        "Treat satellite values as inferred. Return JSON only with keys headline, executive_summary, proof_points, gaps, next_actions."
    )
    payload = {
        "model": config.AI_MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": json.dumps(safe_payload, ensure_ascii=False, separators=(",", ":"))}],
        "temperature": 0.2,
        "max_tokens": 900,
    }
    headers = {"Content-Type": "application/json"}
    if config.AI_API_KEY:
        headers["Authorization"] = f"Bearer {config.AI_API_KEY}"
    try:
        with httpx.Client(timeout=config.AI_TIMEOUT_SECONDS, follow_redirects=False) as client:
            response = client.post(
                config.AI_BASE_URL + "/chat/completions",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            body = response.json()
            content = body["choices"][0]["message"]["content"].strip()
        return _clean_brief(_parse_provider_json(content), fallback), True
    except Exception:
        log.warning(
            "Configured AI brief unavailable; deterministic fallback used",
            exc_info=False,
            extra={"provider_mode": config.AI_PROVIDER_MODE},
        )
        return fallback, False


@router.get("/status")
def ai_status(user: User = Depends(get_current_user)):
    configured = _provider_configured()
    provider_mode = config.AI_PROVIDER_MODE if configured else "deterministic"
    return {
        "external_enabled": provider_mode == "external",
        "local_enabled": provider_mode == "local",
        "provider_mode": provider_mode,
        "configured": configured,
        "mode": f"{provider_mode}-ready",
        "model": config.AI_MODEL if configured else None,
        "payload_policy": "aggregated_state_only",
        "external_payload_policy": "aggregated_counts_only",
        "data_boundary": "operator-local" if provider_mode == "local" else "external-provider" if provider_mode == "external" else "in-process",
        "provenance": "PROPOSED",
    }


@router.post("/investor-brief")
def investor_brief(payload: BriefIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    scope, snapshot = _snapshot(db, user, payload.project_id)
    fallback = _fallback(payload.locale, scope, snapshot)
    brief, used_provider = (fallback, False)
    configured = _provider_configured()
    if configured:
        brief, used_provider = _provider_brief(payload.locale, scope, snapshot, fallback)

    effective_mode = config.AI_PROVIDER_MODE if used_provider else "deterministic"
    audit(
        db,
        user,
        "generate",
        "investor_ai_brief",
        project_id=payload.project_id,
        meta={
            "provider_used": used_provider,
            "provider_mode": effective_mode,
            "configured_mode": config.AI_PROVIDER_MODE,
            "locale": payload.locale,
            "scope": scope["type"],
            "payload_policy": "aggregated_state_only",
        },
    )
    db.commit()
    return {
        "provider": {
            "mode": effective_mode,
            "configured": configured,
            "model": config.AI_MODEL if used_provider else None,
            "fallback_used": bool(configured and not used_provider),
            "data_boundary": "operator-local" if effective_mode == "local" else "external-provider" if effective_mode == "external" else "in-process",
        },
        "scope": scope,
        "snapshot": snapshot,
        "brief": brief,
        "provenance": "PROPOSED",
        "generated_from": "aggregated_platform_state",
        "payload_policy": "aggregated_state_only",
        "external_payload_policy": "aggregated_counts_only",
        "investment_certification": False,
    }
