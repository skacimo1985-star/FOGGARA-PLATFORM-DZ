"""Deterministic decision support. Never actuates equipment or executes sales."""
from datetime import datetime, timezone
import hashlib
import json
from sqlalchemy import select
from .models import Organization
from .operations_models import MatrixPolicy, MatrixObservation, MatrixEvaluation, MatrixJob, ValueListing, ValueMatch

DOMAINS = ("water", "energy", "food", "ecosystem", "health")

def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)

def lock_org(db, org_id):
    # Serializes policy versions and matching/evaluation writes across processes.
    return db.execute(select(Organization).where(Organization.id == org_id).with_for_update()).scalar_one()

def enqueue(db, org_id, kind, project_id=None):
    pending = db.execute(select(MatrixJob).where(
        MatrixJob.org_id == org_id, MatrixJob.kind == kind,
        MatrixJob.project_id == project_id, MatrixJob.status == "pending"
    )).scalar_one_or_none()
    if pending:
        return pending
    job = MatrixJob(org_id=org_id, kind=kind, project_id=project_id)
    db.add(job)
    db.flush()
    return job

def evaluate(db, org_id, project_id, now=None):
    now = now or datetime.now(timezone.utc)
    policy = db.execute(select(MatrixPolicy).where(
        MatrixPolicy.org_id == org_id, MatrixPolicy.active.is_(True)
    )).scalar_one_or_none()
    if not policy:
        return None
    scores, references, missing = {}, {}, []
    for domain in DOMAINS:
        rule = policy.rules[domain]
        # Filter by metric and unit BEFORE choosing latest; unmatched units are never converted silently.
        row = db.execute(select(MatrixObservation).where(
            MatrixObservation.org_id == org_id,
            MatrixObservation.project_id == project_id,
            MatrixObservation.domain == domain,
            MatrixObservation.metric == rule["metric"],
            MatrixObservation.status == "approved",
            MatrixObservation.unit == rule["unit"],
            MatrixObservation.measured_at <= now,
        ).order_by(MatrixObservation.measured_at.desc(), MatrixObservation.id.desc()).limit(1)).scalar_one_or_none()
        if row is None or (now - utc(row.measured_at)).total_seconds() > rule["max_age_hours"] * 3600:
            missing.append(domain)
            continue
        scaled = (float(row.value) - rule["lower"]) / (rule["upper"] - rule["lower"])
        if rule["direction"] == "lower":
            scaled = 1 - scaled
        scores[domain] = round(max(0, min(1, scaled)) * 100, 2)
        references[domain] = row.id
    score = None if missing else round(sum(scores[d] * policy.rules[d]["weight"] for d in DOMAINS), 2)
    fingerprint = hashlib.sha256(json.dumps(
        [org_id, project_id, policy.id, references, missing], sort_keys=True
    ).encode()).hexdigest()
    existing = db.execute(select(MatrixEvaluation).where(
        MatrixEvaluation.org_id == org_id, MatrixEvaluation.fingerprint == fingerprint
    )).scalar_one_or_none()
    if existing:
        return existing
    result = {
        "score": score, "coverage": len(scores) / 5, "scores": scores,
        "observations": references, "missing": missing,
        "policy_version": policy.version, "rules": policy.rules,
        "evaluated_at": now.isoformat(),
        "recommendations": ([{"code": "COMPLETE_REVIEWED_DATA", "domains": missing}] if missing else [
            {"code": "REVIEW_DOMAIN", "domain": d} for d in DOMAINS if scores[d] < 40
        ]),
        "execution": "human_review_required",
    }
    row = MatrixEvaluation(org_id=org_id, project_id=project_id, policy_id=policy.id,
                           fingerprint=fingerprint, result=result)
    db.add(row)
    db.flush()
    return row

def match_listings(db, org_id):
    rows = db.execute(select(ValueListing).where(
        ValueListing.org_id == org_id, ValueListing.status == "active"
    ).order_by(ValueListing.id)).scalars().all()
    offers = {}
    for row in rows:
        if row.kind == "offer":
            offers.setdefault((row.product_code, row.unit, row.sector), []).append(row)
    existing = {(m.offer_id, m.demand_id): m for m in db.execute(select(ValueMatch).where(
        ValueMatch.org_id == org_id)).scalars()}
    valid = set()
    for demand in (r for r in rows if r.kind == "demand"):
        # Alternatives only; no inventory reservations or binding allocation.
        for offer in sorted(offers.get((demand.product_code, demand.unit, demand.sector), []),
                            key=lambda o: (o.wilaya != demand.wilaya, o.id))[:20]:
            key = (offer.id, demand.id)
            valid.add(key)
            local = offer.wilaya == demand.wilaya
            row = existing.get(key)
            if row is None:
                row = ValueMatch(org_id=org_id, offer_id=offer.id, demand_id=demand.id)
                db.add(row)
            row.quantity = min(offer.quantity, demand.quantity)
            row.score = 100 if local else 80
            row.reasons = ["PRODUCT_UNIT_SECTOR_MATCH"] + (["SAME_WILAYA"] if local else [])
            row.status = "suggested"
    for key, row in existing.items():
        if key not in valid:
            row.status = "withdrawn"
    db.flush()
    return len(valid)
