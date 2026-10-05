import hashlib
import json
from decimal import Decimal
from fastapi import APIRouter, Depends
from pydantic import Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..audit import audit
from ..db import get_db
from ..deps import get_current_user, api_error
from ..reference_models import EconomicScenario
from .core import get_project_or_404
from .collaboration import Payload, evidence_for_user

router = APIRouter(prefix="/api", tags=["economics"])


class CashYear(Payload):
    revenue: Decimal = Field(ge=0, le=10**15, max_digits=18, decimal_places=2)
    cost: Decimal = Field(ge=0, le=10**15, max_digits=18, decimal_places=2)


class ScenarioIn(Payload):
    title: str = Field(min_length=3, max_length=255)
    initial_investment: Decimal = Field(gt=0, le=10**15, max_digits=18, decimal_places=2)
    discount_percent: Decimal = Field(ge=0, le=100, max_digits=6, decimal_places=3)
    years: list[CashYear] = Field(min_length=1, max_length=30)
    source_note: str = Field(min_length=5, max_length=3000)
    evidence_id: int | None = None
    stress_percent: Decimal = Field(default=20, ge=0, le=100, max_digits=6, decimal_places=3)


def compute_scenario(payload):
    """Annual nominal DZD, year-end flows; no financing/tax/inflation assumptions."""
    rate = payload.discount_percent / 100
    stress = payload.stress_percent / 100
    outcomes = []
    for name, rev, cost in (("base", Decimal(1), Decimal(1)), ("stress", 1-stress, 1+stress), ("upside", 1+stress, 1-stress)):
        cumulative = -payload.initial_investment
        npv = cumulative
        payback = None
        flows = []
        for year, row in enumerate(payload.years, 1):
            net = row.revenue * rev - row.cost * cost
            discounted = net / (1+rate)**year
            before = cumulative
            cumulative += net
            if payback is None and before < 0 and cumulative >= 0 and net > 0:
                payback = str(round(Decimal(year-1) + (-before/net), 4))
            npv += discounted
            flows.append({"year": year, "net": str(round(net, 2)), "discounted": str(round(discounted, 2)),
                          "cumulative": str(round(cumulative, 2))})
        outcomes.append({"case": name, "npv_dzd": str(round(npv, 2)), "payback_years": payback,
                         "net_total_dzd": str(round(cumulative, 2)), "cash_flows": flows})
    return {"method_version": "cash-flow-dzd-v1", "currency": "DZD", "data_class": "COMPUTED",
            "assumptions_class": "PROPOSED", "year_end_discounting": True, "cases": outcomes,
            "excluded": ["taxes", "financing", "inflation", "terminal_value"], "funding_approval": False}


def view(row):
    return {"id": row.id, "project_id": row.project_id, "title": row.title, "assumptions": row.assumptions,
            "results": row.results, "input_hash": row.input_hash, "created_at": row.created_at}


@router.get("/projects/{project_id}/economics")
def scenarios(project_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, project_id)
    return [view(row) for row in db.scalars(select(EconomicScenario).where(EconomicScenario.project_id == project_id,
                 EconomicScenario.org_id == user.org_id).order_by(EconomicScenario.id.desc()).limit(100))]


@router.post("/projects/{project_id}/economics", status_code=201)
def create_scenario(project_id: int, payload: ScenarioIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, project_id)
    if payload.evidence_id:
        ev = evidence_for_user(payload.evidence_id, user, db)
        if ev.project_id != project_id or ev.status != "verified":
            api_error(409, "DISCLOSURE_INVALID", "Reviewed project evidence required")
    inputs = payload.model_dump(mode="json")
    digest = hashlib.sha256(json.dumps(inputs, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    row = EconomicScenario(org_id=user.org_id, project_id=project_id, title=payload.title,
                            assumptions=inputs, results=compute_scenario(payload), input_hash=digest, created_by=user.id)
    db.add(row)
    db.flush()
    audit(db, user, "compute", "economic_scenario", entity_id=row.id, project_id=project_id, meta={"input_hash": digest})
    db.commit()
    return view(row)
