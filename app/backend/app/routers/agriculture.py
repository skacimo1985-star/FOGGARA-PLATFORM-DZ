"""Agricultural intelligence from reviewed records plus optional read-only live forecasts."""
from datetime import date, datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, Query
from pydantic import Field, model_validator
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import Evidence, Site, User
from ..platform_models import AgriculturalRecord, EvidenceFile
from .collaboration import Payload, commit, evidence_for_user
from .core import get_project_or_404
from ..services import weather_provider

router = APIRouter(prefix="/api", tags=["agricultural-intelligence"])


class SourceIn(Payload):
    evidence_id: int
    source: str = Field(min_length=3, max_length=255)
    observed_at: datetime

    @model_validator(mode="after")
    def check_time(self):
        if self.observed_at.tzinfo is None or self.observed_at > datetime.now(timezone.utc):
            raise ValueError("Source time must have a timezone and cannot be in the future")
        return self


class SatelliteIn(SourceIn):
    product_id: str = Field(min_length=3, max_length=255)
    red: float = Field(ge=0, le=1, allow_inf_nan=False)
    nir: float = Field(ge=0, le=1, allow_inf_nan=False)
    swir1: float = Field(ge=0, le=1, allow_inf_nan=False)
    common_resolution_m: float = Field(gt=0, le=1000, allow_inf_nan=False)
    cloud_free: bool
    same_grid: bool


class SoilIn(SourceIn):
    sample_id: str = Field(min_length=2, max_length=100)
    method: str = Field(min_length=3, max_length=255)
    nitrogen_mg_kg: float | None = Field(default=None, ge=0, le=1000000, allow_inf_nan=False)
    phosphorus_mg_kg: float | None = Field(default=None, ge=0, le=1000000, allow_inf_nan=False)
    potassium_mg_kg: float | None = Field(default=None, ge=0, le=1000000, allow_inf_nan=False)
    soc_g_kg: float | None = Field(default=None, ge=0, le=1000, allow_inf_nan=False)
    ph: float | None = Field(default=None, ge=0, le=14, allow_inf_nan=False)
    moisture_percent: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)

    @model_validator(mode="after")
    def has_measurement(self):
        if not any(getattr(self, k) is not None for k in ("nitrogen_mg_kg", "phosphorus_mg_kg", "potassium_mg_kg", "soc_g_kg", "ph", "moisture_percent")):
            raise ValueError("At least one measured soil parameter is required")
        return self


class ProviderEstimateIn(SourceIn):
    product: Literal["soil", "moisture", "ndvi", "lswi"]
    report_ref: str = Field(min_length=3, max_length=255)
    method: str = Field(min_length=3, max_length=255)
    source_resolution_m: float | None = Field(default=None, gt=0, le=10000, allow_inf_nan=False)
    update_interval_days: int | None = Field(default=None, ge=1, le=366)
    rights_confirmed: Literal[True]
    nitrogen_mg_kg: float | None = Field(default=None, ge=0, le=1000000, allow_inf_nan=False)
    phosphorus_mg_kg: float | None = Field(default=None, ge=0, le=1000000, allow_inf_nan=False)
    potassium_mg_kg: float | None = Field(default=None, ge=0, le=1000000, allow_inf_nan=False)
    soc_g_kg: float | None = Field(default=None, ge=0, le=1000, allow_inf_nan=False)
    ph: float | None = Field(default=None, ge=0, le=14, allow_inf_nan=False)
    moisture_percent: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)
    ndvi: float | None = Field(default=None, ge=-1, le=1, allow_inf_nan=False)
    lswi: float | None = Field(default=None, ge=-1, le=1, allow_inf_nan=False)

    @model_validator(mode="after")
    def product_values(self):
        allowed = {"soil": {"nitrogen_mg_kg", "phosphorus_mg_kg", "potassium_mg_kg", "soc_g_kg", "ph"},
                   "moisture": {"moisture_percent"}, "ndvi": {"ndvi"}, "lswi": {"lswi"}}[self.product]
        supplied = {k for k in ("nitrogen_mg_kg", "phosphorus_mg_kg", "potassium_mg_kg", "soc_g_kg", "ph", "moisture_percent", "ndvi", "lswi") if getattr(self, k) is not None}
        if not supplied or not supplied.issubset(allowed):
            raise ValueError("Supply values only for the selected estimate product")
        return self


class ForecastDay(Payload):
    day: date
    min_c: float = Field(ge=-90, le=70, allow_inf_nan=False)
    max_c: float = Field(ge=-90, le=70, allow_inf_nan=False)
    rain_mm: float = Field(ge=0, le=1000, allow_inf_nan=False)
    precipitation_probability: float | None = Field(default=None, ge=0, le=100, allow_inf_nan=False)

    @model_validator(mode="after")
    def temperature_order(self):
        if self.min_c > self.max_c:
            raise ValueError("Minimum exceeds maximum")
        return self


class WeatherIn(SourceIn):
    model_name: str = Field(min_length=2, max_length=100)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    days: list[ForecastDay] = Field(min_length=1, max_length=15)

    @model_validator(mode="after")
    def forecast_window(self):
        days = [d.day for d in self.days]
        if len(set(days)) != len(days) or days != sorted(days):
            raise ValueError("Forecast days must be unique and chronological")
        if any((d - self.observed_at.date()).days < 0 or (d - self.observed_at.date()).days > 15 for d in days):
            raise ValueError("Forecast must fall within 15 days of issue time")
        return self


class CalendarEvent(Payload):
    day: date
    activity: str = Field(min_length=3, max_length=255)


class CalendarIn(SourceIn):
    crop: str = Field(min_length=2, max_length=100)
    location: str = Field(min_length=2, max_length=255)
    events: list[CalendarEvent] = Field(min_length=1, max_length=50)


class DiagnosisIn(SourceIn):
    crop: str = Field(min_length=2, max_length=100)
    observation: str = Field(min_length=5, max_length=3000)
    conclusion: str = Field(min_length=5, max_length=3000)
    mode: Literal["diagnosis", "forewarning"]


class IrrigationIn(SourceIn):
    crop: str = Field(min_length=2, max_length=100)
    eto_mm_day: float = Field(ge=0, le=30, allow_inf_nan=False)
    kc: float = Field(ge=0, le=2, allow_inf_nan=False)
    effective_rain_mm: float = Field(ge=0, le=1000, allow_inf_nan=False)
    area_ha: float = Field(gt=0, le=1000000, allow_inf_nan=False)
    efficiency: float = Field(gt=0, le=1, allow_inf_nan=False)
    kc_source: str = Field(min_length=3, max_length=255)


def save(kind, project_id, payload, user, db, computed=None):
    project = get_project_or_404(db, user, project_id)
    ev = evidence_for_user(payload.evidence_id, user, db)
    if ev.project_id != project.id or ev.status != "verified":
        api_error(409, "DISCLOSURE_INVALID", "Reviewed project evidence required")
    data = payload.model_dump(mode="json", exclude={"evidence_id", "source", "observed_at"})
    if computed:
        data.update(computed)
    record = AgriculturalRecord(org_id=user.org_id, project_id=project.id, evidence_id=ev.id, kind=kind,
                                source=payload.source, observed_at=payload.observed_at, content=data, created_by=user.id)
    db.add(record)
    db.flush()
    audit(db, user, "record", "agricultural_record", entity_id=record.id, project_id=project.id, meta={"kind": kind, "evidence_id": ev.id})
    commit(db)
    return {"id": record.id, "kind": kind, "content": data, "live_feed": False}


@router.get("/projects/{project_id}/agriculture")
def records(project_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    p = get_project_or_404(db, user, project_id)
    rows = db.scalars(select(AgriculturalRecord).join(Evidence, Evidence.id == AgriculturalRecord.evidence_id).where(
        AgriculturalRecord.project_id == p.id, Evidence.status == "verified").order_by(AgriculturalRecord.observed_at.desc(), AgriculturalRecord.id.desc()))
    return {"project_id": p.id, "is_demo": p.is_demo, "live_feed": False,
            "records": [{"id": r.id, "kind": r.kind, "source": r.source, "observed_at": r.observed_at,
                         "evidence_id": r.evidence_id, "content": r.content,
                         "provenance": r.content["provenance"] if r.content.get("provenance") in ("INFERRED", "COMPUTED", "PROPOSED") else "COMPUTED" if r.kind in ("satellite", "irrigation") else "PROPOSED" if r.kind in ("diagnosis", "forewarning", "calendar") else "OBSERVED" if r.kind == "soil" else "INFERRED"} for r in rows]}


@router.post("/projects/{project_id}/agriculture/satellite", status_code=201)
def satellite(project_id: int, payload: SatelliteIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    valid = payload.cloud_free and payload.same_grid
    ndvi = (payload.nir - payload.red) / (payload.nir + payload.red) if valid and payload.nir + payload.red > 0 else None
    lswi = (payload.nir - payload.swir1) / (payload.nir + payload.swir1) if valid and payload.nir + payload.swir1 > 0 else None
    return save("satellite", project_id, payload, user, db, {"ndvi": ndvi, "lswi": lswi, "quality": "eligible" if valid else "masked",
                "formula_ndvi": "(NIR-RED)/(NIR+RED)", "formula_lswi": "(NIR-SWIR1)/(NIR+SWIR1)", "method_version": "spectral-v1"})


@router.post("/projects/{project_id}/agriculture/soil", status_code=201)
def soil(project_id: int, payload: SoilIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    return save("soil", project_id, payload, user, db)


@router.post("/projects/{project_id}/agriculture/weather", status_code=201)
def weather(project_id: int, payload: WeatherIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    return save("weather", project_id, payload, user, db)

@router.get("/projects/{project_id}/agriculture/weather/live")
def live_weather(
    project_id: int,
    days: int = Query(default=15, ge=1, le=15),
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    project = get_project_or_404(db, user, project_id)
    if project.site_id is None:
        api_error(409, "PROJECT_SITE_REQUIRED", "Project must be linked to a site for live weather")

    site = db.scalar(select(Site).where(Site.id == project.site_id, Site.org_id == user.org_id))
    if site is None:
        api_error(404, "SITE_NOT_FOUND", "Project site not found")
    if site.lat is None or site.lon is None:
        api_error(
            409,
            "PROJECT_SITE_COORDINATES_REQUIRED",
            "Project site requires WGS84 latitude and longitude for live weather",
        )

    try:
        forecast = weather_provider.fetch_forecast(
            latitude=float(site.lat),
            longitude=float(site.lon),
            days=days,
        )
    except weather_provider.WeatherProviderNotConfigured:
        api_error(503, "WEATHER_PROVIDER_NOT_CONFIGURED", "Live weather provider is not configured")
    except weather_provider.WeatherProviderUnavailable:
        api_error(502, "WEATHER_PROVIDER_UNAVAILABLE", "Live weather provider is unavailable")
    except weather_provider.WeatherProviderInvalidResponse:
        api_error(502, "WEATHER_PROVIDER_INVALID_RESPONSE", "Live weather provider returned invalid data")

    return {
        "project_id": project.id,
        "project_is_demo": project.is_demo,
        "site": {
            "id": site.id,
            "name": site.name,
            "wilaya": site.wilaya,
            "latitude": float(site.lat),
            "longitude": float(site.lon),
        },
        **forecast,
    }



@router.post("/projects/{project_id}/agriculture/calendar", status_code=201)
def calendar(project_id: int, payload: CalendarIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    return save("calendar", project_id, payload, user, db)


@router.post("/projects/{project_id}/agriculture/diagnosis", status_code=201)
def diagnosis(project_id: int, payload: DiagnosisIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role not in ("reviewer", "admin"):
        api_error(403, "ROLE_FORBIDDEN", "Reviewer required for expert observations")
    if payload.mode == "diagnosis":
        ev = evidence_for_user(payload.evidence_id, user, db)
        image = db.scalar(select(EvidenceFile.id).where(EvidenceFile.evidence_id == ev.id, EvidenceFile.media_type.in_(("image/png", "image/jpeg"))))
        if not image:
            api_error(422, "IMAGE_REQUIRED", "Attach an image to the reviewed evidence first")
    return save(payload.mode, project_id, payload, user, db, {"automated_image_diagnosis": False})


@router.post("/projects/{project_id}/agriculture/irrigation", status_code=201)
def irrigation(project_id: int, payload: IrrigationIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    etc = payload.eto_mm_day * payload.kc
    net = max(0, etc - payload.effective_rain_mm)
    gross = net / payload.efficiency
    return save("irrigation", project_id, payload, user, db, {"etc_mm_day": round(etc, 4), "net_mm_day": round(net, 4),
                "gross_mm_day": round(gross, 4), "volume_m3_day": round(gross * payload.area_ha * 10, 4),
                "formula": "ETc=Kc*ETo; net=max(0,ETc-effective_rain); gross=net/efficiency; volume=gross*ha*10",
                "method_version": "water-budget-v1", "field_execution": False, "review_required": True})


@router.post("/projects/{project_id}/agriculture/provider-estimate", status_code=201)
def provider_estimate(project_id: int, payload: ProviderEstimateIn, user=Depends(get_current_user), db: Session = Depends(get_db)):
    if user.role not in ("reviewer", "admin"):
        api_error(403, "ROLE_FORBIDDEN", "Reviewer required for provider estimates")
    kind = "satellite" if payload.product in ("ndvi", "lswi") else "soil"
    # Reviewed report provenance does not validate the estimated physical quantities.
    return save(kind, project_id, payload, user, db, {"provenance": "INFERRED", "external_estimate": True,
                "live_feed": False, "local_validation": False, "method_version": "provider-estimate-v1",
                "field_execution": False, "review_required": True, "redistribution_authorized": False})
