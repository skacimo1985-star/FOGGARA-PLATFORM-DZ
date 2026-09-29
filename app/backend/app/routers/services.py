"""Services catalog + service requests (org-isolated, audited)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user, require_reviewer
from ..models import Project, Service, ServiceRequest, Site, User
from ..schemas import (ServiceOut, ServiceRequestIn, ServiceRequestOut,
                       ServiceRequestStatusUpdate)

router = APIRouter(prefix="/api", tags=["services"])

SERVICE_TYPES = ("calibration", "inspection", "measurement", "technical_study",
                 "irrigation_service", "maintenance", "consultation")

# انتقالات الحالة الموثقة لطلبات الخدمة (لا رجوع للحالات النهائية)
ALLOWED_TRANSITIONS: dict[str, set[str]] = {
    "submitted": {"triaged", "cancelled"},
    "triaged": {"assigned", "cancelled"},
    "assigned": {"in_progress", "cancelled"},
    "in_progress": {"completed", "cancelled"},
    "completed": set(),
    "cancelled": set(),
}


# ---------- Catalog (عام داخل الجلسة) ----------
@router.get("/services", response_model=list[ServiceOut])
def list_services(type: str | None = Query(default=None),
                  domain: str | None = Query(default=None),
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    q = select(Service).order_by(Service.id)
    if type is not None:
        q = q.where(Service.type == type)
    if domain is not None:
        q = q.where((Service.domain == domain) | (Service.domain.is_(None)))
    return db.execute(q).scalars().all()


# ---------- Service requests (مؤسستي فقط) ----------
@router.post("/service-requests", response_model=ServiceRequestOut, status_code=201)
def create_service_request(payload: ServiceRequestIn, user: User = Depends(get_current_user),
                           db: Session = Depends(get_db)):
    service = db.get(Service, payload.service_id)
    if service is None:
        api_error(404, "SERVICE_NOT_FOUND", "Service not found in catalog")
    if payload.project_id is not None:
        p = db.get(Project, payload.project_id)
        if p is None or p.org_id != user.org_id:
            api_error(404, "NOT_FOUND", "Project not found")
    if payload.site_id is not None:
        s = db.get(Site, payload.site_id)
        if s is None or s.org_id != user.org_id:
            api_error(404, "NOT_FOUND", "Site not found")
    sr = ServiceRequest(org_id=user.org_id, created_by=user.id, status="submitted",
                        **payload.model_dump())
    db.add(sr)
    db.flush()
    audit(db, user, "create", "service_request", entity_id=sr.id, project_id=sr.project_id,
          meta={"service_id": sr.service_id})
    db.commit()
    return sr


@router.get("/service-requests", response_model=list[ServiceRequestOut])
def list_service_requests(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(ServiceRequest).where(ServiceRequest.org_id == user.org_id)
                      .order_by(ServiceRequest.id.desc())).scalars().all()


def get_request_or_404(db: Session, user: User, request_id: int) -> ServiceRequest:
    sr = db.get(ServiceRequest, request_id)
    if sr is None or sr.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Service request not found")
    return sr


@router.get("/service-requests/{request_id}", response_model=ServiceRequestOut)
def get_service_request(request_id: int, user: User = Depends(get_current_user),
                        db: Session = Depends(get_db)):
    return get_request_or_404(db, user, request_id)


@router.patch("/service-requests/{request_id}/status", response_model=ServiceRequestOut)
def update_service_request_status(request_id: int, payload: ServiceRequestStatusUpdate,
                                  user: User = Depends(require_reviewer), db: Session = Depends(get_db)):
    """تغيير الحالة — admin/reviewer فقط، وفق انتقالات موثقة."""
    sr = get_request_or_404(db, user, request_id)
    if payload.status != sr.status and payload.status not in ALLOWED_TRANSITIONS[sr.status]:
        api_error(409, "INVALID_STATUS_TRANSITION",
                  f"Cannot move service request from '{sr.status}' to '{payload.status}'")
    old = sr.status
    sr.status = payload.status
    if payload.notes is not None:
        sr.notes = payload.notes
    db.flush()
    audit(db, user, "status_change", "service_request", entity_id=sr.id, project_id=sr.project_id,
          meta={"from": old, "to": sr.status})
    db.commit()
    return sr
