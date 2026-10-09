from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import config
from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user, paginate, pagination
from ..models import Asset, AuditLog, Organization, Project, Site, User, WaterResource
from ..schemas import (AssetIn, AssetOut, AuditOut, OrgOut, Page, ProjectIn,
                       ProjectOut, ProjectUpdate, ResourceIn, ResourceOut,
                       SiteIn, SiteOut)

router = APIRouter(prefix="/api", tags=["core"])


# ---------- Organization (read-only, own org) ----------
@router.get("/org", response_model=OrgOut)
def my_org(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.get(Organization, user.org_id)


# ---------- Sites ----------
@router.get("/sites", response_model=Page[SiteOut])
def list_sites(pg: tuple[int, int] = Depends(pagination),
               user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    page, page_size = pg
    stmt = select(Site).where(Site.org_id == user.org_id).order_by(Site.id)
    items, total, pages = paginate(db, stmt, page, page_size)
    return Page(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.post("/sites", response_model=SiteOut, status_code=201)
def create_site(payload: SiteIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    site = Site(org_id=user.org_id, **payload.model_dump())
    db.add(site)
    db.flush()
    audit(db, user, "create", "site", entity_id=site.id)
    db.commit()
    return site


# ---------- Water resources ----------
@router.get("/resources", response_model=Page[ResourceOut])
def list_resources(pg: tuple[int, int] = Depends(pagination),
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    page, page_size = pg
    stmt = select(WaterResource).where(WaterResource.org_id == user.org_id).order_by(WaterResource.id)
    items, total, pages = paginate(db, stmt, page, page_size)
    return Page(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.post("/resources", response_model=ResourceOut, status_code=201)
def create_resource(payload: ResourceIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    site = db.get(Site, payload.site_id)
    if site is None or site.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Site not found")
    res = WaterResource(org_id=user.org_id, **payload.model_dump())
    db.add(res)
    db.flush()
    audit(db, user, "create", "water_resource", entity_id=res.id)
    db.commit()
    return res


# ---------- Assets ----------
@router.get("/assets", response_model=Page[AssetOut])
def list_assets(pg: tuple[int, int] = Depends(pagination),
                user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    page, page_size = pg
    stmt = select(Asset).where(Asset.org_id == user.org_id).order_by(Asset.id)
    items, total, pages = paginate(db, stmt, page, page_size)
    return Page(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.post("/assets", response_model=AssetOut, status_code=201)
def create_asset(payload: AssetIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    res = db.get(WaterResource, payload.resource_id)
    if res is None or res.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Resource not found")
    asset = Asset(org_id=user.org_id, **payload.model_dump())
    db.add(asset)
    db.flush()
    audit(db, user, "create", "asset", entity_id=asset.id)
    db.commit()
    return asset


# ---------- Projects ----------
def _check_links(db: Session, org_id: int, site_id, resource_id, asset_id):
    r = None
    if site_id is not None:
        s = db.get(Site, site_id)
        if s is None or s.org_id != org_id:
            api_error(404, "NOT_FOUND", "Site not found")
    if resource_id is not None:
        r = db.get(WaterResource, resource_id)
        if r is None or r.org_id != org_id:
            api_error(404, "NOT_FOUND", "Resource not found")
    if asset_id is not None:
        a = db.get(Asset, asset_id)
        if a is None or a.org_id != org_id:
            api_error(404, "NOT_FOUND", "Asset not found")
        if resource_id is not None and a.resource_id != resource_id:
            api_error(422, "INCONSISTENT_PROJECT_LINKS", "Asset does not belong to the selected resource")
        # Resolve the resource even for an asset-only project so an explicit
        # site cannot contradict the asset's resource ancestry.
        if r is None:
            r = db.get(WaterResource, a.resource_id)
            if r is None or r.org_id != org_id:
                api_error(404, "NOT_FOUND", "Resource not found")
    if site_id is not None and r is not None and r.site_id != site_id:
        api_error(422, "INCONSISTENT_PROJECT_LINKS", "Resource does not belong to the selected site")


@router.get("/projects", response_model=Page[ProjectOut])
def list_projects(pg: tuple[int, int] = Depends(pagination),
                  user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    page, page_size = pg
    stmt = select(Project).where(Project.org_id == user.org_id).order_by(Project.id.desc())
    items, total, pages = paginate(db, stmt, page, page_size)
    return Page(items=items, total=total, page=page, page_size=page_size, pages=pages)


@router.post("/projects", response_model=ProjectOut, status_code=201)
def create_project(payload: ProjectIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    _check_links(db, user.org_id, payload.site_id, payload.resource_id, payload.asset_id)
    p = Project(org_id=user.org_id, created_by=user.id, **payload.model_dump())
    db.add(p)
    db.flush()
    audit(db, user, "create", "project", entity_id=p.id, project_id=p.id, meta={"title": p.title})
    db.commit()
    return p


def get_project_or_404(db: Session, user: User, project_id: int) -> Project:
    p = db.get(Project, project_id)
    # عزل المؤسسات: لا نكشف وجود مشروع جهة أخرى
    if p is None or p.org_id != user.org_id:
        api_error(404, "NOT_FOUND", "Project not found")
    return p


@router.get("/projects/{project_id}", response_model=ProjectOut)
def get_project(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_project_or_404(db, user, project_id)


@router.patch("/projects/{project_id}", response_model=ProjectOut)
def update_project(project_id: int, payload: ProjectUpdate,
                   user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = get_project_or_404(db, user, project_id)
    data = payload.model_dump(exclude_unset=True)
    if any(k in data for k in ("site_id", "resource_id", "asset_id")):
        _check_links(db, user.org_id,
                     data.get("site_id", p.site_id),
                     data.get("resource_id", p.resource_id),
                     data.get("asset_id", p.asset_id))
    old_status = p.status
    for k, v in data.items():
        setattr(p, k, v)
    if "status" in data and data["status"] != old_status:
        audit(db, user, "status_change", "project", entity_id=p.id, project_id=p.id,
              meta={"from": old_status, "to": data["status"]})
    audit(db, user, "update", "project", entity_id=p.id, project_id=p.id, meta={"fields": sorted(data.keys())})
    db.commit()
    return p


@router.get("/projects/{project_id}/history", response_model=list[AuditOut])
def project_history(project_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_project_or_404(db, user, project_id)
    return db.execute(select(AuditLog).where(AuditLog.project_id == project_id)
                      .order_by(AuditLog.id.desc()).limit(200)).scalars().all()
