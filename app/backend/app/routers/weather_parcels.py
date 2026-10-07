"""Parcel-scoped live agricultural weather service."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import AgriParcel, User
from ..services.weather_provider import (
    WeatherNotConfigured,
    WeatherProviderError,
    fetch_daily_forecast,
    provider_status,
)
from .agriculture_operations import own


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
