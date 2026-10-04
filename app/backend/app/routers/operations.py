"""Organization-scoped WEFEH and value-chain workflows."""
from datetime import datetime, timezone
from decimal import Decimal
import os
import secrets
from fastapi import APIRouter, Depends, Request
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user, require_reviewer, pagination, paginate
from ..models import User, Project, Organization
from ..operations_models import (MatrixPolicy, MatrixObservation, MatrixEvaluation, ValueListing,
    ValueMatch, ProductionLot, MatrixJob, ContactTicket, PrivacyRequest)
from ..operations_schemas import (PolicyIn, ObservationIn, ReviewIn, ListingIn, LotIn,
    TransitionIn, ContactIn, PrivacyIn, ResolutionIn, TeamIn, PasswordIn)
from ..operations_engine import lock_org, enqueue, evaluate, match_listings, DOMAINS
from ..automation_runtime import runtime
from .. import config
from ..ratelimit import check_rate_limit, limiter

router = APIRouter(prefix="/api/operations", tags=["operations"])
POLICY_VERSION = "2026-10-02"

def record(row):
    # Explicit columns only: no relationships, internal ORM state, or password hashes.
    return {col.name: (str(getattr(row, col.name)) if isinstance(getattr(row, col.name), Decimal)
                       else getattr(row, col.name)) for col in row.__table__.columns}

def own(db, model, row_id, user):
    row = db.execute(select(model).where(model.id == row_id, model.org_id == user.org_id)).scalar_one_or_none()
    if row is None:
        api_error(404, "NOT_FOUND", "Record not found")
    return row

def admin(user):
    if user.role != "admin":
        api_error(403, "ROLE_FORBIDDEN", "Administrator required")

def saved(db, user, row, action="create"):
    db.flush()
    audit(db, user, action, row.__tablename__, entity_id=row.id)
    db.commit()
    return record(row)

def rows(db, model, user, pg, extra=None):
    stmt = select(model).where(model.org_id == user.org_id)
    if extra is not None:
        stmt = stmt.where(extra)
    page, size = pg
    items, total, pages = paginate(db, stmt.order_by(model.id.desc()), page, size)
    return {"items": [record(r) for r in items], "total": total, "pages": pages, "page": page, "page_size": size}

@router.get("/automation")
def automation(user=Depends(get_current_user), db=Depends(get_db)):
    policy = db.scalar(select(MatrixPolicy).where(MatrixPolicy.org_id == user.org_id, MatrixPolicy.active.is_(True)))
    # Co-occurrence is a structural relationship, never a causal or learned coefficient.
    domains = select(MatrixObservation.project_id, MatrixObservation.domain).where(
        MatrixObservation.org_id == user.org_id, MatrixObservation.status == "approved"
    ).distinct().subquery()
    other = domains.alias()
    pairs = db.execute(select(domains.c.domain, other.c.domain, func.count()).select_from(
        domains.join(other, domains.c.project_id == other.c.project_id)
    ).group_by(domains.c.domain, other.c.domain)).all()
    counts = {(a, b): count for a, b, count in pairs}
    job_counts = dict(db.execute(select(MatrixJob.status, func.count()).where(
        MatrixJob.org_id == user.org_id).group_by(MatrixJob.status)).all())
    observation_counts = dict(db.execute(select(MatrixObservation.status, func.count()).where(
        MatrixObservation.org_id == user.org_id).group_by(MatrixObservation.status)).all())
    return {"policy": record(policy) if policy else None, "domains": DOMAINS,
            "matrix": [[counts.get((a, b), 0) for b in DOMAINS] for a in DOMAINS],
            "matrix_semantics": "shared_projects_with_reviewed_observations_not_causation",
            "jobs": job_counts, "observations": observation_counts,
            "evaluations": db.scalar(select(func.count()).select_from(MatrixEvaluation).where(MatrixEvaluation.org_id == user.org_id)),
            "runtime": {"enabled": config.OPERATIONS_AUTOMATION_ENABLED, **runtime},
            "algorithm": "wefeh-reviewed-provenance-v2", "field_execution": False,
            "refresh_seconds": 3600, "poll_seconds": 15}

@router.post("/automation/enqueue", status_code=202)
def automation_enqueue(user=Depends(get_current_user), db=Depends(get_db)):
    if not limiter.allow("automation", str(user.org_id), 10, 60):
        api_error(429, "RATE_LIMITED", "Too many refresh requests")
    lock_org(db, user.org_id)
    policy = db.scalar(select(MatrixPolicy.id).where(MatrixPolicy.org_id == user.org_id, MatrixPolicy.active.is_(True)))
    ids = db.scalars(select(Project.id).where(Project.org_id == user.org_id).order_by(Project.id).limit(501)).all() if policy else []
    if len(ids) > 500:
        api_error(409, "CAPACITY_REACHED", "Use the dedicated worker for more than 500 projects")
    for project_id in ids:
        enqueue(db, user.org_id, "wefeh", project_id)
    enqueue(db, user.org_id, "matching")
    audit(db, user, "automation_enqueue", "matrix_jobs", meta={"projects": len(ids), "matching": True})
    db.commit()
    return {"projects": len(ids), "matching": True, "field_execution": False}

@router.get("/policies")
def policies(pg=Depends(pagination), user=Depends(get_current_user), db=Depends(get_db)):
    return rows(db, MatrixPolicy, user, pg)

@router.post("/policies", status_code=201)
def policy_create(payload: PolicyIn, user=Depends(get_current_user), db=Depends(get_db)):
    admin(user)
    lock_org(db, user.org_id)
    version = (db.scalar(select(func.max(MatrixPolicy.version)).where(MatrixPolicy.org_id == user.org_id)) or 0) + 1
    row = MatrixPolicy(org_id=user.org_id, version=version, name=payload.name,
        rules={k: v.model_dump() for k, v in payload.rules.items()}, created_by=user.id)
    db.add(row)
    return saved(db, user, row)

@router.post("/policies/{policy_id}/activate")
def policy_activate(policy_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    admin(user)
    lock_org(db, user.org_id)
    row = own(db, MatrixPolicy, policy_id, user)
    for p in db.scalars(select(MatrixPolicy).where(MatrixPolicy.org_id == user.org_id)):
        p.active = p.id == row.id
    # Bounded by this organization's projects; new approved observations enqueue automatically.
    for project_id in db.scalars(select(Project.id).where(Project.org_id == user.org_id)):
        enqueue(db, user.org_id, "wefeh", project_id)
    return saved(db, user, row, "activate")

@router.get("/observations")
def observations(pg=Depends(pagination), user=Depends(get_current_user), db=Depends(get_db)):
    return rows(db, MatrixObservation, user, pg)

@router.post("/observations", status_code=201)
def observation_create(payload: ObservationIn, user=Depends(get_current_user), db=Depends(get_db)):
    own(db, Project, payload.project_id, user)
    row = MatrixObservation(org_id=user.org_id, submitted_by=user.id, **payload.model_dump())
    db.add(row)
    return saved(db, user, row)

@router.post("/observations/{observation_id}/review")
def observation_review(observation_id: int, payload: ReviewIn, user=Depends(require_reviewer), db=Depends(get_db)):
    lock_org(db, user.org_id)
    row = own(db, MatrixObservation, observation_id, user)
    if row.submitted_by == user.id:
        api_error(403, "SELF_REVIEW", "A different reviewer is required")
    if row.status != "pending":
        api_error(409, "ALREADY_REVIEWED", "Observation already reviewed")
    row.status, row.reviewed_by, row.review_note = payload.status, user.id, payload.note
    if row.status == "approved":
        enqueue(db, user.org_id, "wefeh", row.project_id)
    return saved(db, user, row, "review")

@router.get("/evaluations")
def evaluations(pg=Depends(pagination), user=Depends(get_current_user), db=Depends(get_db)):
    return rows(db, MatrixEvaluation, user, pg)

@router.post("/projects/{project_id}/evaluate")
def evaluate_project(project_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    own(db, Project, project_id, user)
    lock_org(db, user.org_id)
    row = evaluate(db, user.org_id, project_id)
    if row is None:
        api_error(409, "POLICY_REQUIRED", "Activate a validated organization policy first")
    return saved(db, user, row, "evaluate")

@router.post("/evaluations/{evaluation_id}/review")
def evaluation_review(evaluation_id: int, payload: ReviewIn, user=Depends(require_reviewer), db=Depends(get_db)):
    lock_org(db, user.org_id)
    row = own(db, MatrixEvaluation, evaluation_id, user)
    if row.status != "pending":
        api_error(409, "ALREADY_REVIEWED", "Evaluation already reviewed")
    if payload.status == "approved":
        if row.result["score"] is None:
            api_error(409, "INCOMPLETE_DATA", "Incomplete evaluations cannot be approved")
        current = evaluate(db, user.org_id, row.project_id)
        if current is None or current.id != row.id:
            api_error(409, "STALE_EVALUATION", "Re-evaluate with current policy and observations")
        ids = list(row.result["observations"].values())
        if db.scalar(select(MatrixObservation.id).where(
            MatrixObservation.id.in_(ids), MatrixObservation.submitted_by == user.id).limit(1)):
            api_error(403, "SELF_REVIEW", "A reviewer independent of the source submissions is required")
    row.status, row.reviewed_by, row.review_note = payload.status, user.id, payload.note
    return saved(db, user, row, "review")

@router.get("/listings")
def listings(pg=Depends(pagination), user=Depends(get_current_user), db=Depends(get_db)):
    return rows(db, ValueListing, user, pg)

@router.post("/listings", status_code=201)
def listing_create(payload: ListingIn, user=Depends(get_current_user), db=Depends(get_db)):
    lock_org(db, user.org_id)
    if payload.project_id is not None:
        own(db, Project, payload.project_id, user)
    if db.scalar(select(func.count()).select_from(ValueListing).where(
        ValueListing.org_id == user.org_id, ValueListing.status == "active")) >= 2000:
        api_error(409, "CAPACITY_REACHED", "Close inactive listings before adding more")
    row = ValueListing(org_id=user.org_id, created_by=user.id, **payload.model_dump())
    db.add(row)
    enqueue(db, user.org_id, "matching")
    return saved(db, user, row)

@router.post("/listings/{listing_id}/close")
def listing_close(listing_id: int, user=Depends(get_current_user), db=Depends(get_db)):
    lock_org(db, user.org_id)
    row = own(db, ValueListing, listing_id, user)
    if row.created_by != user.id:
        admin(user)
    row.status = "closed"
    db.flush()
    match_listings(db, user.org_id)
    return saved(db, user, row, "close")

@router.get("/matches")
def matches(pg=Depends(pagination), user=Depends(get_current_user), db=Depends(get_db)):
    result = rows(db, ValueMatch, user, pg, ValueMatch.status == "suggested")
    offer_ids = [item["offer_id"] for item in result["items"]]
    offers = {r.id: r for r in db.scalars(select(ValueListing).where(
        ValueListing.org_id == user.org_id, ValueListing.id.in_(offer_ids)))}
    for item in result["items"]:
        offer = offers[item["offer_id"]]
        item.update(unit=offer.unit, product_code=offer.product_code, title=offer.title)
    return result

@router.post("/match")
def match_now(user=Depends(get_current_user), db=Depends(get_db)):
    lock_org(db, user.org_id)
    count = match_listings(db, user.org_id)
    audit(db, user, "match", "value_matches", meta={"suggestions": count})
    db.commit()
    return {"suggestions": count, "binding": False, "scope": "organization"}

@router.get("/lots")
def lots(pg=Depends(pagination), user=Depends(get_current_user), db=Depends(get_db)):
    return rows(db, ProductionLot, user, pg)

@router.post("/lots", status_code=201)
def lot_create(payload: LotIn, user=Depends(get_current_user), db=Depends(get_db)):
    lock_org(db, user.org_id)
    own(db, Project, payload.project_id, user)
    if db.scalar(select(ProductionLot.id).where(ProductionLot.org_id == user.org_id, ProductionLot.code == payload.code)):
        api_error(409, "DUPLICATE_CODE", "Lot code already exists")
    row = ProductionLot(org_id=user.org_id, **payload.model_dump(), trace=[
        {"stage": "production", "user_id": user.id, "at": datetime.now(timezone.utc).isoformat(), "note": "created"}])
    db.add(row)
    return saved(db, user, row)

@router.post("/lots/{lot_id}/transition")
def lot_transition(lot_id: int, payload: TransitionIn, user=Depends(get_current_user), db=Depends(get_db)):
    lock_org(db, user.org_id)
    row = own(db, ProductionLot, lot_id, user)
    allowed = {"production": "processing", "processing": "quality_review", "quality_review": "ready",
               "ready": "dispatched", "dispatched": "closed"}
    if allowed.get(row.stage) != payload.stage:
        api_error(409, "INVALID_TRANSITION", "Follow the production sequence")
    if payload.stage == "ready":
        if user.role not in ("reviewer", "admin"):
            api_error(403, "ROLE_FORBIDDEN", "Quality reviewer required")
        if any(e["user_id"] == user.id for e in row.trace):
            api_error(403, "SELF_REVIEW", "Independent quality reviewer required")
    row.stage = payload.stage
    row.trace = [*row.trace, {"stage": payload.stage, "user_id": user.id,
                            "at": datetime.now(timezone.utc).isoformat(), "note": payload.note}]
    return saved(db, user, row, "transition")

@router.get("/jobs")
def jobs(pg=Depends(pagination), user=Depends(get_current_user), db=Depends(get_db)):
    return rows(db, MatrixJob, user, pg)

@router.post("/contact", status_code=201)
def contact(payload: ContactIn, request: Request, db=Depends(get_db)):
    check_rate_limit(request, "contact", "RATE_LIMIT_CONTACT_MAX", "RATE_LIMIT_CONTACT_WINDOW", 5, 600)
    row = ContactTicket(reference="FG-" + secrets.token_hex(8).upper(),
        policy_version=POLICY_VERSION, **payload.model_dump(exclude={"consent", "website"}))
    db.add(row)
    db.commit()
    return {"reference": row.reference, "status": row.status, "email_sent": False}

@router.get("/contacts")
def contacts(pg=Depends(pagination), user=Depends(get_current_user), db=Depends(get_db)):
    admin(user)
    contact_org = os.environ.get("CONTACT_ORG_CODE", "")
    if not contact_org or db.get(Organization, user.org_id).code != contact_org:
        api_error(403, "ROLE_FORBIDDEN", "Platform contact operator required")
    page, size = pg
    items, total, pages = paginate(db, select(ContactTicket).order_by(ContactTicket.id.desc()), page, size)
    return {"items": [record(r) for r in items], "total": total, "pages": pages, "page": page, "page_size": size}

@router.post("/privacy", status_code=201)
def privacy_create(payload: PrivacyIn, user=Depends(get_current_user), db=Depends(get_db)):
    row = PrivacyRequest(org_id=user.org_id, user_id=user.id, **payload.model_dump())
    db.add(row)
    return saved(db, user, row)

@router.get("/privacy")
def privacy_list(pg=Depends(pagination), user=Depends(get_current_user), db=Depends(get_db)):
    return rows(db, PrivacyRequest, user, pg, None if user.role == "admin" else PrivacyRequest.user_id == user.id)

@router.post("/privacy/{request_id}/resolve")
def privacy_resolve(request_id: int, payload: ResolutionIn, user=Depends(get_current_user), db=Depends(get_db)):
    admin(user)
    lock_org(db, user.org_id)
    row = own(db, PrivacyRequest, request_id, user)
    if row.status != "received":
        api_error(409, "ALREADY_RESOLVED", "Request already resolved")
    row.status, row.response = "resolved", payload.response
    return saved(db, user, row, "resolve")


@router.get("/team")
def team_list(pg=Depends(pagination), user=Depends(get_current_user), db=Depends(get_db)):
    from ..schemas import UserOut
    admin(user)
    page, size = pg
    items, total, pages = paginate(db, select(User).where(User.org_id == user.org_id).order_by(User.id), page, size)
    return {"items": [UserOut.model_validate(r) for r in items], "total": total, "pages": pages, "page": page, "page_size": size}


@router.post("/team", status_code=201)
def team_create(payload: TeamIn, user=Depends(get_current_user), db=Depends(get_db)):
    from sqlalchemy.exc import IntegrityError
    from ..security import hash_password
    from ..schemas import UserOut
    admin(user)
    lock_org(db, user.org_id)
    email = payload.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        api_error(409, "EMAIL_UNAVAILABLE", "Email unavailable")
    row = User(org_id=user.org_id, email=email, full_name=payload.full_name,
               role=payload.role, password_hash=hash_password(payload.password), locale="ar")
    db.add(row)
    try:
        db.flush()
        audit(db, user, "create", "user", entity_id=row.id, meta={"role": row.role})
        db.commit()
    except IntegrityError:
        db.rollback()
        api_error(409, "EMAIL_UNAVAILABLE", "Email unavailable")
    return UserOut.model_validate(row)

@router.post("/password")
def change_password(payload: PasswordIn, request: Request, user=Depends(get_current_user), db=Depends(get_db)):
    from ..security import verify_password, hash_password
    check_rate_limit(request, "password", "RATE_LIMIT_PASSWORD_MAX", "RATE_LIMIT_PASSWORD_WINDOW", 5, 600)
    # Lock the account so concurrent password changes cannot overwrite each other.
    row = db.execute(select(User).where(User.id == user.id).with_for_update()
                     .execution_options(populate_existing=True)).scalar_one()
    if not verify_password(payload.current_password, row.password_hash):
        api_error(403, "BAD_CREDENTIALS", "Current password is incorrect")
    if payload.current_password == payload.new_password:
        api_error(422, "PASSWORD_UNCHANGED", "Choose a different password")
    row.password_hash = hash_password(payload.new_password)
    audit(db, user, "password_change", "user", entity_id=user.id)
    db.commit()
    return {"status": "changed", "reauthenticate": True}
