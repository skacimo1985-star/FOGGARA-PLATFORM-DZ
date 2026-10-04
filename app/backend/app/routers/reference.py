from typing import Literal
from fastapi import APIRouter, Depends
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from ..db import get_db
from ..reference_models import ReferenceEntry, NationalWilaya
from ..services.reference_catalog import wilaya_rows
from ..wilayas import VERSION, SOURCES

router = APIRouter(prefix="/api/reference", tags=["reference"])


@router.get("/wilayas")
def national_directory(db: Session = Depends(get_db)):
    rows = wilaya_rows(db)
    return {"count": len(rows), "wilayas": rows, "version": VERSION, "sources": SOURCES,
            "checked_on": "2026-10-04", "operational_coverage": False}


@router.get("/catalog")
def catalog(locale: Literal["ar", "fr", "en"] = "ar", domain: str | None = None,
            category: Literal["law", "method", "dataset"] | None = None, db: Session = Depends(get_db)):
    statement = select(ReferenceEntry).order_by(ReferenceEntry.category, ReferenceEntry.code)
    if domain:
        statement = statement.where(ReferenceEntry.domain.in_((domain, "all")))
    if category:
        statement = statement.where(ReferenceEntry.category == category)
    return {"version": "2026-10-04-v1", "wilaya_count": db.scalar(select(func.count()).select_from(NationalWilaya)),
            "items": [{"code": r.code, "category": r.category, "domain": r.domain,
                       "title": r.content["titles"][locale], "summary": r.content["summaries"][locale],
                       "formula": r.content.get("formula", ""), "publisher": r.publisher,
                       "source_url": r.source_url, "version": r.version, "checked_on": r.checked_on,
                       "data_class": "REFERENCE"} for r in db.scalars(statement)]}
