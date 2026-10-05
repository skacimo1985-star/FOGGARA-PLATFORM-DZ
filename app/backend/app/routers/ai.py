import hashlib
import json
from typing import Literal
from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from ..audit import audit
from ..db import get_db
from ..deps import get_current_user, api_error
from ..models import Evidence, Measurement, Site, Organization
from ..platform_models import AgriculturalRecord
from ..reference_models import AIAnalysisRun, ReferenceEntry, LabWaterAnalysis
from ..services.llm_ensemble import configuration, model_status
from .collaboration import Payload
from .core import get_project_or_404

router = APIRouter(prefix="/api/ai", tags=["source-grounded-ai"])


class AnalysisIn(Payload):
    project_id: int
    domain: Literal["water", "soil", "food", "energy", "ecosystem", "health", "gis", "regulatory", "economics"]
    locale: Literal["ar", "fr", "en"]
    question: str = Field(min_length=10, max_length=2000)


@router.get("/models")
def models(user=Depends(get_current_user)):
    return model_status()


def source_packet(db, user, project, domain):
    sources = []
    if project.site_id:
        site = db.get(Site, project.site_id)
        if site and site.org_id == user.org_id:
            sources.append({"source_id": f"site:{site.id}", "class": "OBSERVED", "wilaya": site.wilaya,
                            "latitude": float(site.lat) if site.lat is not None else None,
                            "longitude": float(site.lon) if site.lon is not None else None, "crs": "EPSG:4326"})
    for m in db.scalars(select(Measurement).where(Measurement.project_id == project.id, Measurement.org_id == user.org_id,
                Measurement.quality_status == "validated").order_by(Measurement.id.desc()).limit(30)):
        sources.append({"source_id": f"measurement:{m.id}", "class": "VERIFIED", "parameter": m.parameter,
                        "value": str(m.value), "unit": m.unit, "measured_at": m.measured_at.isoformat(), "method": m.method})
    for model, prefix in ((AgriculturalRecord, "agriculture"), (LabWaterAnalysis, "water_lab")):
        for row in db.scalars(select(model).join(Evidence, Evidence.id == model.evidence_id)
                             .where(model.project_id == project.id, model.org_id == user.org_id, Evidence.status == "verified")
                             .order_by(model.id.desc()).limit(20)):
            declared = row.content.get("provenance")
            classification = "OBSERVED" if prefix == "water_lab" else declared if declared in ("INFERRED", "COMPUTED", "PROPOSED") else "OBSERVED" if row.kind == "soil" else "COMPUTED" if row.kind in ("satellite", "irrigation") else "PROPOSED" if row.kind in ("diagnosis", "calendar", "forewarning") else "INFERRED"
            sources.append({"source_id": f"{prefix}:{row.id}", "class": classification,
                            "kind": "water" if prefix == "water_lab" else row.kind, "content": row.content,
                            "evidence_id": row.evidence_id, "observed_at": row.observed_at.isoformat()})
    ref_domain = "food" if domain == "soil" else "all" if domain in ("gis", "regulatory", "economics") else domain
    for ref in db.scalars(select(ReferenceEntry).where(ReferenceEntry.domain.in_((ref_domain, "all"))).order_by(ReferenceEntry.code)):
        sources.append({"source_id": f"reference:{ref.code}", "class": "REFERENCE", "content": ref.content,
                        "source_url": ref.source_url, "version": ref.version})
    return {"project_id": project.id, "domain": domain, "sources": sources,
            "privacy": "tenant_scoped_private_inference", "field_execution": False}


def view(row):
    return {"id": row.id, "project_id": row.project_id, "domain": row.domain, "locale": row.locale,
            "question": row.question, "status": row.status, "results": row.results, "snapshot": row.snapshot,
            "input_hash": row.input_hash, "created_at": row.created_at}


@router.post("/analyses", status_code=201)
def create_analysis(payload: AnalysisIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    p = get_project_or_404(db, user, payload.project_id)
    snapshot = source_packet(db, user, p, payload.domain)
    field_sources = [s for s in snapshot["sources"] if s["class"] != "REFERENCE"]
    url, models = configuration()
    status = "queued" if url and field_sources else "prepared" if field_sources else "insufficient_data"
    if status == "queued":
        # Serialize per-tenant queue admission; bound privately hosted inference load.
        db.scalar(select(Organization).where(Organization.id == user.org_id).with_for_update())
        pending = db.scalar(select(func.count()).select_from(AIAnalysisRun).where(
            AIAnalysisRun.org_id == user.org_id, AIAnalysisRun.status == "queued"))
        if pending >= 10:
            api_error(429, "RATE_LIMITED", "Wait for pending model analyses to complete")
    digest = hashlib.sha256(json.dumps({"snapshot": snapshot, "question": payload.question, "locale": payload.locale,
                                       "models": models}, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    row = AIAnalysisRun(org_id=user.org_id, project_id=p.id, domain=payload.domain, locale=payload.locale,
                        question=payload.question, status=status, snapshot=snapshot,
                        results={"drafts": [], "models": models, "field_source_count": len(field_sources),
                                 "missing": ["private_model_connection"] if field_sources and not url else ["reviewed_project_data"] if not field_sources else [],
                                 "human_review_required": True, "field_execution": False}, input_hash=digest, created_by=user.id)
    db.add(row)
    db.flush()
    audit(db, user, "prepare", "ai_analysis", entity_id=row.id, project_id=p.id, meta={"input_hash": digest, "status": status})
    db.commit()
    return view(row)


@router.get("/analyses")
def analyses(project_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, project_id)
    return [view(row) for row in db.scalars(select(AIAnalysisRun).where(AIAnalysisRun.org_id == user.org_id,
                AIAnalysisRun.project_id == project_id).order_by(AIAnalysisRun.id.desc()).limit(50))]
