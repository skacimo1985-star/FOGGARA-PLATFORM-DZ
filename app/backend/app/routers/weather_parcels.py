"""Parcel-scoped live agricultural weather service."""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import AgriParcel, AgriPlan, User
from ..services.agriculture_operations import irrigation_scenario
from ..services.weather_provider import (
    WeatherNotConfigured,
    WeatherProviderError,
    fetch_daily_forecast,
    provider_status,
)
from .agriculture_operations import own, record


class WeatherIrrigationPlanIn(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    kc: float = Field(gt=0, le=2)
    efficiency: float = Field(gt=0, le=1)
    days: int = Field(default=7, ge=1, le=15)
    effective_rain_fraction: float = Field(default=0.8, ge=0, le=1)


def _forecast_irrigation(parcel: AgriParcel, forecast: dict, payload: WeatherIrrigationPlanIn) -> tuple[dict, dict]:
    rows = list(forecast.get("forecast_days") or [])[: payload.days]
    if len(rows) != payload.days:
        raise WeatherProviderError("forecast horizon is incomplete")
    eto_values = [float(row["et0_fao_mm"]) for row in rows]
    rain_values = [float(row["precipitation_mm"]) for row in rows]
    total_eto = sum(eto_values)
    total_rain = sum(rain_values)
    effective_rain = total_rain * payload.effective_rain_fraction
    average_eto = total_eto / payload.days
    result = irrigation_scenario(
        float(parcel.area_ha),
        average_eto,
        payload.kc,
        effective_rain,
        payload.efficiency,
        payload.days,
    )
    result.update({
        "evidence_status": "COMPUTED_FROM_INFERRED_FORECAST",
        "decision_status": "PROPOSED",
        "method": "foggara-weather-water-balance-v1",
        "forecast_total_eto_mm": round(total_eto, 4),
        "forecast_total_precipitation_mm": round(total_rain, 4),
        "effective_rain_mm": round(effective_rain, 4),
        "forecast_from": rows[0]["date"],
        "forecast_to": rows[-1]["date"],
        "limitations": [
            "NUMERICAL_WEATHER_FORECAST_NOT_FIELD_MEASUREMENT",
            "EFFECTIVE_RAIN_FRACTION_IS_AN_ASSUMPTION",
            "NO_SOIL_STORAGE_OR_SALINITY_MODEL",
            "HUMAN_REVIEW_REQUIRED",
        ],
    })
    inputs = {
        "area_ha": float(parcel.area_ha),
        "kc": payload.kc,
        "efficiency": payload.efficiency,
        "days": payload.days,
        "effective_rain_fraction": payload.effective_rain_fraction,
        "forecast_total_eto_mm": round(total_eto, 4),
        "forecast_total_precipitation_mm": round(total_rain, 4),
        "weather_provider": forecast.get("provider"),
        "weather_generated_at": forecast.get("generated_at"),
        "weather_method": forecast.get("method"),
        "weather_provenance": forecast.get("provenance"),
        "input_source": "LIVE_WEATHER_FORECAST",
    }
    return inputs, result


router = APIRouter(prefix="/api/agriculture", tags=["parcel-weather"])


@router.get("/weather/status")
def weather_status(_user: User = Depends(get_current_user)):
    return {
        **provider_status(),
        "max_forecast_days": 15,
        "provenance": "INFERRED",
        "field_measurement": False,
    }


@router.get("/parcels/{identity}/weather")
def parcel_weather(
    identity: int,
    days: int = Query(default=15, ge=1, le=15),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    parcel = own(db, AgriParcel, identity, user)
    if parcel.archived:
        api_error(409, "PARCEL_ARCHIVED", "Parcel is archived")
    if parcel.lat is None or parcel.lon is None:
        api_error(422, "PARCEL_COORDINATES_REQUIRED", "Set parcel coordinates or draw its boundary before weather analysis")
    try:
        result = fetch_daily_forecast(float(parcel.lat), float(parcel.lon), days=days)
    except WeatherNotConfigured:
        api_error(503, "WEATHER_PROVIDER_NOT_CONFIGURED", "Live weather provider is not configured")
    except WeatherProviderError:
        api_error(502, "WEATHER_PROVIDER_UNAVAILABLE", "Live weather provider did not return a valid forecast")
    return {
        "parcel_id": parcel.id,
        "forecast": result,
    }


@router.post("/parcels/{identity}/weather/irrigation-plan", status_code=201)
def create_weather_irrigation_plan(
    identity: int,
    payload: WeatherIrrigationPlanIn,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a stored irrigation scenario directly from the live weather forecast."""
    parcel = own(db, AgriParcel, identity, user)
    if parcel.archived:
        api_error(409, "PARCEL_ARCHIVED", "Parcel is archived")
    if parcel.lat is None or parcel.lon is None:
        api_error(422, "PARCEL_COORDINATES_REQUIRED", "Set parcel coordinates or draw its boundary before weather analysis")
    try:
        forecast = fetch_daily_forecast(float(parcel.lat), float(parcel.lon), days=payload.days)
        inputs, result = _forecast_irrigation(parcel, forecast, payload)
    except WeatherNotConfigured:
        api_error(503, "WEATHER_PROVIDER_NOT_CONFIGURED", "Live weather provider is not configured")
    except WeatherProviderError:
        api_error(502, "WEATHER_PROVIDER_UNAVAILABLE", "Live weather provider did not return a valid forecast")
    return record(
        db,
        user,
        AgriPlan(
            org_id=user.org_id,
            parcel_id=parcel.id,
            inputs=inputs,
            result=result,
            created_by=user.id,
            is_demo=False,
        ),
        "weather_irrigation_plan",
    )
