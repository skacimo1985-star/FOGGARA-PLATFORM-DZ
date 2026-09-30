"""Deterministic, evidence-backed assessment. No external AI or field control."""
import hashlib
import json
from datetime import datetime, timezone
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import Action, Evidence, GovDecision, HumanDecision, Measurement, Organization, Project, User
from ..platform_models import AssuranceRecord, DataRoom, NexusResource, Opportunity, RiskRecord
from .collaboration import Payload, commit, evidence_for_user, room_owner
from .core import get_project_or_404

router = APIRouter(prefix="/api", tags=["nexus-intelligence"])
STAGES = ("contract", "purchase_order", "work_order", "report", "acceptance", "variation", "invoice", "payment")


class OpportunityIn(Payload):
    title: str = Field(min_length=3, max_length=255)
    description: str = Field(min_length=10, max_length=3000)
    domain: Literal["water", "energy", "food", "ecosystem", "health"]
    kind: Literal["need", "offer"]
    category: Literal["equipment", "engineering", "laboratory", "investment", "research", "production", "training"]
    wilaya: str | None = Field(default=None, max_length=100)
    room_id: int | None = None
    published: bool = False
    consent: bool = False


class OpportunityUpdate(Payload):
    published: bool
    status: Literal["open", "closed"]
    consent: bool = False


class RiskIn(Payload):
    title: str = Field(min_length=3, max_length=255)
    likelihood: int = Field(ge=1, le=5)
    severity: int = Field(ge=1, le=5)
    mitigation: str = Field(min_length=5, max_length=3000)
    evidence_id: int | None = None


class AssuranceIn(Payload):
    chain: str = Field(min_length=2, max_length=100)
    stage: Literal["contract", "purchase_order", "work_order", "report", "acceptance", "variation", "invoice", "payment"]
    reference: str = Field(min_length=2, max_length=255)
    amount: Decimal = Field(ge=0, max_digits=18, decimal_places=2)
    amount_basis: Literal["gross", "net"] = "gross"
    evidence_id: int


def opportunity_view(item, user, db):
    org = db.get(Organization, item.org_id)
    room = db.get(DataRoom, item.room_id) if item.room_id else None
    return {"id": item.id, "title": item.title, "description": item.description, "domain": item.domain,
            "kind": item.kind, "category": item.category, "wilaya": item.wilaya, "published": item.published,
            "status": item.status, "own": item.org_id == user.org_id, "organization": org.code, "is_demo": org.is_demo,
            "room_id": room.id if room and room.discoverable and room.status == "open" else None,
            "provenance": "PROPOSED"}


@router.get("/opportunities")
def opportunities(user=Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Opportunity).where(or_(Opportunity.org_id == user.org_id, (Opportunity.published.is_(True) & (Opportunity.status == "open")))).order_by(Opportunity.id.desc()).limit(200))
    return [opportunity_view(r, user, db) for r in rows]


@router.post("/opportunities", status_code=201)
def create_opportunity(payload: OpportunityIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.published and not payload.consent:
        api_error(422, "CONSENT_REQUIRED", "Explicit publication consent required")
    if payload.room_id:
        room_owner(payload.room_id, user, db)
    row = Opportunity(org_id=user.org_id, created_by=user.id,
                      **payload.model_dump(exclude={"consent"}),
                      consent_at=datetime.now(timezone.utc) if payload.consent else None,
                      consent_version="publication-v1" if payload.consent else None)
    db.add(row)
    db.flush()
    audit(db, user, "create", "opportunity", entity_id=row.id, meta={"published": row.published, "consent_version": row.consent_version})
    commit(db)
    return opportunity_view(row, user, db)


@router.patch("/opportunities/{opportunity_id}")
def change_opportunity(opportunity_id: int, payload: OpportunityUpdate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    row = db.get(Opportunity, opportunity_id)
    if not row or row.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Opportunity not found")
    if row.created_by != user.id and user.role != "admin":
        api_error(403, "ROLE_FORBIDDEN", "Author or administrator required")
    if payload.published and not payload.consent:
        api_error(422, "CONSENT_REQUIRED", "Explicit publication consent required")
    row.published, row.status = payload.published, payload.status
    if payload.consent:
        row.consent_at, row.consent_version = datetime.now(timezone.utc), "publication-v1"
    audit(db, user, "update", "opportunity", entity_id=row.id, meta={"published": row.published, "status": row.status})
    commit(db)
    return opportunity_view(row, user, db)


@router.get("/opportunities/{opportunity_id}/matches")
def matching(opportunity_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    source = db.get(Opportunity, opportunity_id)
    if not source or source.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Opportunity not found")
    candidates = db.scalars(select(Opportunity).where(Opportunity.org_id != user.org_id, Opportunity.published.is_(True),
                                                     Opportunity.status == "open", Opportunity.domain == source.domain,
                                                     Opportunity.category == source.category, Opportunity.kind != source.kind))
    results = []
    if source.status == "open":
        for candidate in candidates:
            same_location = bool(source.wilaya and candidate.wilaya and source.wilaya == candidate.wilaya)
            results.append({"opportunity": opportunity_view(candidate, user, db), "score": 2 + int(same_location),
                            "basis": ["same_domain", "same_category", "opposite_kind"] + (["same_wilaya"] if same_location else []),
                            "provenance": "COMPUTED"})
    results.sort(key=lambda item: (-item["score"], item["opportunity"]["id"]))
    return {"rule_version": "matching-v1", "not_a_recommendation": True, "matches": results[:50]}


@router.get("/projects/{project_id}/risks")
def risks(project_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, project_id)
    return [{"id": r.id, "title": r.title, "likelihood": r.likelihood, "severity": r.severity,
             "score": r.likelihood * r.severity, "mitigation": r.mitigation, "evidence_id": r.evidence_id,
             "provenance": "PROPOSED", "score_provenance": "COMPUTED"} for r in db.scalars(select(RiskRecord).where(RiskRecord.project_id == project_id))]


@router.post("/projects/{project_id}/risks", status_code=201)
def create_risk(project_id: int, payload: RiskIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, project_id)
    if payload.evidence_id:
        ev = evidence_for_user(payload.evidence_id, user, db)
        if ev.project_id != project_id:
            api_error(404, "NOT_FOUND", "Evidence not found")
    r = RiskRecord(org_id=user.org_id, project_id=project_id, created_by=user.id, **payload.model_dump())
    db.add(r)
    db.flush()
    audit(db, user, "create", "risk", entity_id=r.id, project_id=project_id)
    commit(db)
    return {"id": r.id, "score": r.likelihood * r.severity, "provenance": "PROPOSED"}


@router.post("/projects/{project_id}/assurance", status_code=201)
def record_assurance(project_id: int, payload: AssuranceIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, project_id)
    ev = evidence_for_user(payload.evidence_id, user, db)
    if ev.project_id != project_id or ev.status != "verified":
        api_error(409, "DISCLOSURE_INVALID", "Verified project evidence required")
    record = AssuranceRecord(org_id=user.org_id, project_id=project_id, created_by=user.id, **payload.model_dump())
    db.add(record)
    audit(db, user, "record", "assurance", project_id=project_id, meta={"stage": record.stage, "chain": record.chain, "reference": record.reference})
    commit(db)
    return {"id": record.id}


@router.get("/projects/{project_id}/assurance")
def assurance(project_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, project_id)
    rows = db.scalars(select(AssuranceRecord).join(Evidence, Evidence.id == AssuranceRecord.evidence_id).where(
        AssuranceRecord.project_id == project_id, Evidence.status == "verified").order_by(AssuranceRecord.id)).all()
    chains = {}
    for record in rows:
        entry = chains.setdefault(record.chain, {"records": [], "totals": {}, "basis": set()})
        entry["records"].append({"id": record.id, "stage": record.stage, "reference": record.reference,
                                  "amount": str(record.amount), "amount_basis": record.amount_basis, "evidence_id": record.evidence_id})
        entry["totals"][record.stage] = entry["totals"].get(record.stage, Decimal(0)) + record.amount
        entry["basis"].add(record.amount_basis)
    result = []
    for name, entry in chains.items():
        totals = entry["totals"]
        missing = [s for s in ("contract", "work_order", "report", "acceptance", "invoice", "payment") if s not in totals]
        signals = ["MISSING_" + s.upper() for s in missing]
        compatible = len(entry["basis"]) == 1
        if not compatible:
            signals.append("MIXED_AMOUNT_BASIS")
        if compatible and "invoice" in totals and "acceptance" in totals and totals["invoice"] > totals["acceptance"] + totals.get("variation", Decimal(0)):
            signals.append("INVOICE_ABOVE_ACCEPTANCE")
        if compatible and "payment" in totals and "invoice" in totals and totals["payment"] != totals["invoice"]:
            signals.append("PAYMENT_DIFFERENCE")
        result.append({"chain": name, "records": entry["records"], "totals": {k: str(v) for k, v in totals.items()},
                       "signals": signals, "currency": "DZD", "provenance": "COMPUTED"})
    return {"rule_version": "assurance-v1", "chains": result, "scope": "document_reconciliation_not_debt_collection"}


def assessment_data(project_id, user, db):
    p = get_project_or_404(db, user, project_id)
    evidences = db.scalars(select(Evidence).where(Evidence.project_id == p.id)).all()
    measurements = db.scalars(select(Measurement).where(Measurement.project_id == p.id)).all()
    resource_ids = list(db.scalars(select(NexusResource.id).where(NexusResource.project_id == p.id)))
    risk_ids = list(db.scalars(select(RiskRecord.id).where(RiskRecord.project_id == p.id)))
    room_ids = list(db.scalars(select(DataRoom.id).where(DataRoom.project_id == p.id, DataRoom.status == "open")))
    decisions = db.scalars(select(HumanDecision).where(HumanDecision.project_id == p.id)).all()
    actions = db.scalars(select(Action).where(Action.project_id == p.id)).all()
    checks = [
        {"code": "project_description", "constraint": "hard", "passed": bool(p.description and p.description.strip()), "sources": [p.id]},
        {"code": "verified_evidence", "constraint": "hard", "passed": any(e.status == "verified" for e in evidences), "sources": [e.id for e in evidences if e.status == "verified"]},
        {"code": "resource_register", "constraint": "hard", "passed": bool(resource_ids), "sources": resource_ids},
        {"code": "validated_measurements", "constraint": "hard" if p.domain == "water" else "soft", "passed": any(m.quality_status == "validated" for m in measurements), "sources": [m.id for m in measurements if m.quality_status == "validated"]},
        {"code": "risk_register", "constraint": "soft", "passed": bool(risk_ids), "sources": risk_ids},
        {"code": "controlled_room", "constraint": "soft", "passed": bool(room_ids), "sources": room_ids},
    ]
    payload = {"rule_version": "readiness-v1", "project_id": p.id, "domain": p.domain, "is_demo": p.is_demo,
               "checks": checks, "hard_constraints_passed": all(c["passed"] for c in checks if c["constraint"] == "hard"),
               "completed": sum(c["passed"] for c in checks), "total": len(checks), "provenance": "COMPUTED",
               "investment_certification": False}
    payload["input_hash"] = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    nodes = [{"id": "project:" + str(p.id), "type": "project", "title": p.title, "provenance": "OBSERVED"}]
    edges = []
    for kind, records in (("measurement", measurements), ("evidence", evidences), ("human_decision", decisions), ("action", actions)):
        for row in records:
            rid = f"{kind}:{row.id}"
            verified = (kind == "evidence" and row.status == "verified") or (kind == "measurement" and row.quality_status == "validated")
            nodes.append({"id": rid, "type": kind, "title": getattr(row, "title", getattr(row, "parameter", kind)), "provenance": "VERIFIED" if verified else "PROPOSED"})
            edges.append({"source": "project:" + str(p.id), "target": rid, "relation": "contains", "provenance": "OBSERVED"})
            if kind == "evidence" and row.measurement_id:
                edges.append({"source": "measurement:" + str(row.measurement_id), "target": rid, "relation": "documented_by", "provenance": "OBSERVED"})
    return payload, {"nodes": nodes, "edges": edges, "causal_claim": False}


@router.get("/projects/{project_id}/assessment")
def assessment(project_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    return assessment_data(project_id, user, db)[0]


@router.post("/projects/{project_id}/assessment/run")
def run_assessment(project_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    result, _ = assessment_data(project_id, user, db)
    audit(db, user, "assessment_run", "project", entity_id=project_id, project_id=project_id,
          meta={"rule_version": result["rule_version"], "input_hash": result["input_hash"], "completed": result["completed"], "total": result["total"]})
    commit(db)
    return result


@router.get("/projects/{project_id}/evidence-graph")
def evidence_graph(project_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    return assessment_data(project_id, user, db)[1]
