"""Live weather adapter for georeferenced FOGGARA parcels.

The public Open-Meteo API is used only for development/evaluation. Production
commercial use is required by config to use the customer endpoint and API key.
Forecast values are model-derived (INFERRED), never field observations.
"""
from __future__ import annotations

from datetime import datetime, timezone
import math

import httpx

from .. import config


PROVIDER_NAME = "Open-Meteo"
PROVIDER_ATTRIBUTION = "Weather data © Open-Meteo, source data under CC BY 4.0"
PROVIDER_TERMS_URL = "https://open-meteo.com/en/terms"
DAILY_VARIABLES = (
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "precipitation_probability_max",
    "et0_fao_evapotranspiration",
    "wind_speed_10m_max",
)


class WeatherProviderError(RuntimeError):
    pass


def provider_status() -> dict:
    configured = bool(config.WEATHER_LIVE_ENABLED and config.WEATHER_BASE_URL)
    commercial = bool(
        configured
        and "customer-api.open-meteo.com" in config.WEATHER_BASE_URL
        and config.WEATHER_API_KEY
    )
    return {
        "provider": PROVIDER_NAME,
        "configured": configured,
        "mode": "commercial" if commercial else "evaluation" if configured else "disabled",
        "commercial_use_ready": commercial,
        "max_forecast_days": 16,
        "attribution": PROVIDER_ATTRIBUTION,
        "terms_url": PROVIDER_TERMS_URL,
        "provenance": "INFERRED",
    }


def _number(value, *, integer: bool = False):
    if value is None:
        return None
    if isinstance(value, bool):
        raise WeatherProviderError("weather provider returned an invalid numeric value")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise WeatherProviderError("weather provider returned a non-numeric value") from exc
    if not math.isfinite(number):
        raise WeatherProviderError("weather provider returned a non-finite value")
    return int(number) if integer else number


def _daily_value(daily: dict, key: str, index: int, *, integer: bool = False):
    values = daily.get(key)
    if not isinstance(values, list) or index >= len(values):
        raise WeatherProviderError(f"weather provider omitted daily variable {key}")
    return _number(values[index], integer=integer)


def fetch_forecast(latitude: float, longitude: float, *, days: int = 15) -> dict:
    if not config.WEATHER_LIVE_ENABLED or not config.WEATHER_BASE_URL:
        raise WeatherProviderError("live weather provider is not configured")
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise WeatherProviderError("weather coordinates are outside WGS84 bounds")
    if not 1 <= days <= 16:
        raise WeatherProviderError("forecast days must be between 1 and 16")

    params = {
        "latitude": round(float(latitude), 6),
        "longitude": round(float(longitude), 6),
        "daily": ",".join(DAILY_VARIABLES),
        "forecast_days": days,
        "timezone": "auto",
        "temperature_unit": "celsius",
        "precipitation_unit": "mm",
        "wind_speed_unit": "ms",
        "cell_selection": "land",
    }
    if config.WEATHER_API_KEY:
        params["apikey"] = config.WEATHER_API_KEY

    try:
        with httpx.Client(timeout=config.WEATHER_TIMEOUT_SECONDS, follow_redirects=False) as client:
            response = client.get(
                config.WEATHER_BASE_URL + "/forecast",
                params=params,
                headers={
                    "Accept": "application/json",
                    "User-Agent": f"FOGGARA-DZ/{config.APP_VERSION}",
                },
            )
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise WeatherProviderError("live weather provider is unavailable") from exc

    if not isinstance(payload, dict) or payload.get("error") is True:
        raise WeatherProviderError("weather provider returned an invalid response")
    daily = payload.get("daily")
    if not isinstance(daily, dict):
        raise WeatherProviderError("weather provider response has no daily forecast")
    dates = daily.get("time")
    if not isinstance(dates, list) or not dates or len(dates) > days:
        raise WeatherProviderError("weather provider returned an invalid forecast timeline")

    rows = []
    for index, day in enumerate(dates):
        if not isinstance(day, str) or len(day) != 10:
            raise WeatherProviderError("weather provider returned an invalid forecast date")
        rows.append({
            "date": day,
            "weather_code": _daily_value(daily, "weather_code", index, integer=True),
            "temperature_min_c": _daily_value(daily, "temperature_2m_min", index),
            "temperature_max_c": _daily_value(daily, "temperature_2m_max", index),
            "precipitation_mm": _daily_value(daily, "precipitation_sum", index),
            "precipitation_probability_pct": _daily_value(
                daily, "precipitation_probability_max", index
            ),
            "reference_et0_mm": _daily_value(
                daily, "et0_fao_evapotranspiration", index
            ),
            "wind_max_m_s": _daily_value(daily, "wind_speed_10m_max", index),
        })

    status = provider_status()
    return {
        "provider": {
            **status,
            "latitude": _number(payload.get("latitude")),
            "longitude": _number(payload.get("longitude")),
            "elevation_m": _number(payload.get("elevation")),
            "timezone": str(payload.get("timezone") or "unknown")[:80],
            "utc_offset_seconds": _number(payload.get("utc_offset_seconds"), integer=True),
        },
        "forecast_days": len(rows),
        "days": rows,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "provenance": {
            "forecast": "INFERRED",
            "reference_et0": "COMPUTED_FROM_FORECAST",
            "verified": False,
        },
        "field_execution": False,
    }
