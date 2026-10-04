"""Bounded, tenant-scoped measurement trends and audited spreadsheet export."""
import csv
import io
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import Measurement, User
from ..schemas import MEASUREMENT_PARAMETERS, MeasurementOut
from ..services.indicators import PARAMETERS, canonical_unit, unit_aliases
from .core import get_project_or_404

router = APIRouter(prefix="/api", tags=["analytics"])


class SeriesSummary(BaseModel):
    count: int
    minimum: float | None
    maximum: float | None
    average: float | None


class MeasurementSeries(BaseModel):
    project_id: int
    parameter: str
    unit: str
    quality: str
    include_demo: bool
    window_from: datetime
    window_to: datetime
    generated_at: datetime
    items: list[MeasurementOut]
    total: int
    limit: int
    truncated: bool
    summary: SeriesSummary


def options(
    parameter: MEASUREMENT_PARAMETERS,
    unit: str = Query(min_length=1, max_length=20),
    days: int = Query(default=30, ge=1, le=366),
    quality: Literal["validated", "pending", "all"] = "validated",
    include_demo: bool = False,
    limit: int = Query(default=500, ge=1, le=1000),
    window_to: datetime | None = None,
):
    if unit not in PARAMETERS[parameter][0]:
        api_error(422, "INVALID_UNIT", "Unit is not valid for the selected parameter")
    if window_to is not None and window_to.utcoffset() is None:
        api_error(422, "VALIDATION_ERROR", "window_to must include a timezone")
    try:
        end = (window_to or datetime.now(timezone.utc)).astimezone(timezone.utc)
        end - timedelta(days=days)
    except (OverflowError, ValueError):
        api_error(422, "VALIDATION_ERROR", "Date window is outside supported datetime bounds")
    return dict(parameter=parameter, unit=canonical_unit(parameter, unit), days=days,
                quality=quality, include_demo=include_demo, limit=limit, window_to=end)


def build_series(db: Session, user: User, project_id: int, filters: dict) -> MeasurementSeries:
    get_project_or_404(db, user, project_id)
    start = filters["window_to"] - timedelta(days=filters["days"])
    predicates = [Measurement.org_id == user.org_id, Measurement.project_id == project_id,
                  Measurement.parameter == filters["parameter"],
                  Measurement.unit.in_(unit_aliases(filters["parameter"], filters["unit"])),
                  Measurement.measured_at >= start,
                  Measurement.measured_at <= filters["window_to"],
                  Measurement.quality_status != "rejected"]
    if filters["quality"] != "all":
        predicates.append(Measurement.quality_status == filters["quality"])
    if not filters["include_demo"]:
        predicates.append(Measurement.is_demo.is_(False))
    count, minimum, maximum, average = db.execute(select(
        func.count(Measurement.id), func.min(Measurement.value),
        func.max(Measurement.value), func.avg(Measurement.value),
    ).where(*predicates)).one()
    # Most recent bounded sample, stable ordering for equal timestamps.
    rows = db.scalars(select(Measurement).where(*predicates).order_by(
        Measurement.measured_at.desc(), Measurement.id.desc()).limit(filters["limit"])).all()
    items = []
    for row in reversed(rows):
        item = MeasurementOut.model_validate(row)
        # SQLite drops tzinfo; historical naive timestamps are stored as UTC.
        if item.measured_at.tzinfo is None:
            item.measured_at = item.measured_at.replace(tzinfo=timezone.utc)
        if item.created_at.tzinfo is None:
            item.created_at = item.created_at.replace(tzinfo=timezone.utc)
        items.append(item)
    return MeasurementSeries(project_id=project_id, parameter=filters["parameter"],
        unit=filters["unit"], quality=filters["quality"], include_demo=filters["include_demo"],
        window_from=start, window_to=filters["window_to"], generated_at=datetime.now(timezone.utc),
        items=items, total=count, limit=filters["limit"], truncated=count > len(items),
        summary=SeriesSummary(count=count, minimum=minimum, maximum=maximum, average=average))


@router.get("/projects/{project_id}/measurement-series", response_model=MeasurementSeries)
def measurement_series(project_id: int, filters: dict = Depends(options),
                       user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return build_series(db, user, project_id, filters)


def spreadsheet_text(value: str) -> str:
    """Prevent text cells from being interpreted as spreadsheet formulas."""
    stripped = value.lstrip(" \t\r\n\ufeff")
    if stripped.startswith(("=", "+", "-", "@")) or value.startswith(("\t", "\r", "\n")):
        return "'" + value
    return value


@router.get("/projects/{project_id}/measurement-series/export.csv")
def export_measurement_series(project_id: int, filters: dict = Depends(options),
                              user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    series = build_series(db, user, project_id, filters)
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(["measurement_id", "project_id", "parameter", "value", "unit", "measured_at_utc",
                     "source", "method", "quality_status", "verification_status", "is_demo",
                     "instrument_id", "window_from_utc", "window_to_utc", "matching_total", "truncated"])
    for item in series.items:
        writer.writerow([item.id, project_id, item.parameter, item.value, item.unit,
            item.measured_at.astimezone(timezone.utc).isoformat(), spreadsheet_text(item.source),
            spreadsheet_text(item.method), item.quality_status, item.verification_status,
            item.is_demo, item.instrument_id, series.window_from.isoformat(),
            series.window_to.isoformat(), series.total, series.truncated])
    audit(db, user, "export", "measurement_series", project_id=project_id,
          meta={"parameter": series.parameter, "unit": series.unit, "quality": series.quality,
                "include_demo": series.include_demo, "rows": len(series.items), "total": series.total,
                "truncated": series.truncated, "window_from": series.window_from.isoformat(),
                "window_to": series.window_to.isoformat()})
    db.commit()
    return Response(content="\ufeff" + output.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="foggara-project-{project_id}-measurements.csv"'})
