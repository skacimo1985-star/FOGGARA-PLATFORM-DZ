"""Atomic creation of a real organization workspace.

This endpoint is intentionally separate from demo seeding. Every record created here
belongs to the authenticated organization and remains is_demo=False.
"""
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..deps import get_current_user
from ..models import AgriParcel, Project, Site, User, WaterResource

router = APIRouter(prefix="/api/workspace", tags=["workspace-setup"])


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SiteSetup(Input):
    name: str = Field(min_length=1, max_length=255)
    wilaya: str = Field(min_length=1, max_length=100)
    commune: str | None = Field(default=None, max_length=100)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def coordinate_pair(self):
        if (self.lat is None) != (self.lon is None):
            raise ValueError("Latitude and longitude must be supplied together")
        return self


class ResourceSetup(Input):
    type: Literal["foggara", "borehole", "spring", "well", "dam"]
    name: str = Field(min_length=1, max_length=255)
    status: Literal["active", "degraded", "dry", "abandoned"] = "active"


class ProjectSetup(Input):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    domain: Literal["water", "energy", "food", "ecosystem", "health"] = "water"


class ParcelSetup(Input):
    name: str = Field(min_length=1, max_length=160)
    crop: str = Field(min_length=1, max_length=80)
    area_ha: float = Field(gt=0, le=100000)
    stage: Literal["initial", "development", "mid", "late"] = "initial"


class WorkspaceSetupIn(Input):
    site: SiteSetup
    project: ProjectSetup
    resource: ResourceSetup | None = None
    parcel: ParcelSetup | None = None


def _site(db: Session, user: User, payload: SiteSetup):
    row = db.scalar(select(Site).where(
        Site.org_id == user.org_id,
        Site.name == payload.name,
        Site.wilaya == payload.wilaya,
    ))
    if row is not None:
        return row, False
    row = Site(org_id=user.org_id, is_demo=False, **payload.model_dump())
    db.add(row)
    db.flush()
    audit(db, user, "create", "site", entity_id=row.id, meta={"source": "workspace_setup"})
    return row, True


def _resource(db: Session, user: User, site: Site, payload: ResourceSetup | None):
    if payload is None:
        return None, False
    row = db.scalar(select(WaterResource).where(
        WaterResource.org_id == user.org_id,
        WaterResource.site_id == site.id,
        WaterResource.name == payload.name,
    ))
    if row is not None:
        return row, False
    row = WaterResource(org_id=user.org_id, site_id=site.id, is_demo=False, **payload.model_dump())
    db.add(row)
    db.flush()
    audit(db, user, "create", "water_resource", entity_id=row.id, meta={"source": "workspace_setup"})
    return row, True


def _project(db: Session, user: User, site: Site, resource: WaterResource | None, payload: ProjectSetup):
    row = db.scalar(select(Project).where(
        Project.org_id == user.org_id,
        Project.title == payload.title,
        Project.site_id == site.id,
    ))
    if row is not None:
        return row, False
    row = Project(
        org_id=user.org_id,
        created_by=user.id,
        site_id=site.id,
        resource_id=resource.id if resource else None,
        asset_id=None,
        is_demo=False,
        status="active",
        **payload.model_dump(),
    )
    db.add(row)
    db.flush()
    audit(db, user, "create", "project", entity_id=row.id, project_id=row.id,
          meta={"source": "workspace_setup", "title": row.title})
    return row, True


def _parcel(db: Session, user: User, site: Site, payload: ParcelSetup | None):
    if payload is None:
        return None, False
    row = db.scalar(select(AgriParcel).where(
        AgriParcel.org_id == user.org_id,
        AgriParcel.site_id == site.id,
        AgriParcel.name == payload.name,
    ))
    if row is not None:
        return row, False
    row = AgriParcel(
        org_id=user.org_id,
        created_by=user.id,
        site_id=site.id,
        location=site.wilaya,
        lat=site.lat,
        lon=site.lon,
        archived=False,
        is_demo=False,
        **payload.model_dump(),
    )
    db.add(row)
    db.flush()
    audit(db, user, "create", "agri_parcel", entity_id=row.id,
          meta={"source": "workspace_setup", "site_id": site.id})
    return row, True


@router.post("/setup", status_code=201)
def setup_workspace(payload: WorkspaceSetupIn, user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    """Create the first operational records as one database transaction.

    Repeating an identical payload reuses matching records instead of duplicating
    them. This is an onboarding convenience, not demo-data generation.
    """
    site, site_created = _site(db, user, payload.site)
    resource, resource_created = _resource(db, user, site, payload.resource)
    project, project_created = _project(db, user, site, resource, payload.project)
    parcel, parcel_created = _parcel(db, user, site, payload.parcel)
    audit(db, user, "workspace_setup", "organization", entity_id=user.org_id,
          project_id=project.id,
          meta={
              "site_id": site.id,
              "resource_id": resource.id if resource else None,
              "parcel_id": parcel.id if parcel else None,
          })
    db.commit()
    return {
        "workspace_initialized": True,
        "site": {"id": site.id, "created": site_created},
        "resource": None if resource is None else {"id": resource.id, "created": resource_created},
        "project": {"id": project.id, "created": project_created},
        "parcel": None if parcel is None else {"id": parcel.id, "created": parcel_created},
        "is_demo": False,
    }
