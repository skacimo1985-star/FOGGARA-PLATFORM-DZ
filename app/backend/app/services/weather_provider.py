"""Live agricultural weather adapter for FOGGARA-DZ.

The adapter is Open-Meteo API compatible but configured server-side only.
Forecast values are model outputs (INFERRED), never field measurements.
"""
from __future__ import annotations

from datetime import datetime, timezone
import math

import httpx

from .. import config


DAILY_VARIABLES = (
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "precipitation_probability_max",
    "wind_speed_10m_max",
    "shortwave_radiation_sum",
    "et0_fao_evapotranspiration",
)


class WeatherProviderError(RuntimeError):
    pass


class WeatherNotConfigured(WeatherProviderError):
    pass


def provider_status() -> dict:
    if not config.WEATHER_PROVIDER_ENABLED:
        return {"configured": False, "mode": "disabled", "provider": None}
    host = httpx.URL(config.WEATHER_BASE_URL).host
    if host == "customer-api.open-meteo.com":
        mode = "commercial"
    elif host == "api.open-meteo.com":
        mode = "evaluation"
    else:
        mode = "self-hosted-or-compatible"
    return {
        "configured": True,
        "mode": mode,
        "provider": "open-meteo-compatible",
        "attribution": "Weather data: Open-Meteo / upstream weather-model providers (CC BY 4.0 where applicable)",
    }


def _finite_number(value, field: str) -> float:
    if isinstance(value, bool):
        raise WeatherProviderError(f"{field} must be numeric")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise WeatherProviderError(f"{field} must be numeric") from exc
    if not math.isfinite(number):
        raise WeatherProviderError(f"{field} must be finite")
    return number


def fetch_daily_forecast(latitude: float, longitude: float, *, days: int = 15) -> dict:
    if not config.WEATHER_PROVIDER_ENABLED:
        raise WeatherNotConfigured("live weather provider is disabled")
    lat = _finite_number(latitude, "latitude")
    lon = _finite_number(longitude, "longitude")
    if not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise WeatherProviderError("coordinates are outside WGS84 bounds")
    if not 1 <= int(days) <= 15:
        raise WeatherProviderError("forecast days must be between 1 and 15")

    params = {
        "latitude": lat,
        "longitude": lon,
        "daily": ",".join(DAILY_VARIABLES),
        "timezone": "Africa/Algiers",
        "forecast_days": int(days),
        "temperature_unit": "celsius",
        "wind_speed_unit": "ms",
        "precipitation_unit": "mm",
    }
    if config.WEATHER_API_KEY:
        params["apikey"] = config.WEATHER_API_KEY

    try:
        with httpx.Client(timeout=config.WEATHER_TIMEOUT_SECONDS, follow_redirects=False) as client:
            response = client.get(
                config.WEATHER_BASE_URL,
                params=params,
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise WeatherProviderError("weather provider request failed") from exc

    daily = payload.get("daily") if isinstance(payload, dict) else None
    units = payload.get("daily_units") if isinstance(payload, dict) else None
    if not isinstance(daily, dict) or not isinstance(units, dict):
        raise WeatherProviderError("weather provider response is missing daily data")
    times = daily.get("time")
    if not isinstance(times, list) or not 1 <= len(times) <= int(days):
        raise WeatherProviderError("weather provider returned an invalid forecast horizon")

    rows = []
    for i, day in enumerate(times):
        if not isinstance(day, str) or len(day) != 10:
            raise WeatherProviderError("weather provider returned an invalid date")
        def number(name: str) -> float:
            values = daily.get(name)
            if not isinstance(values, list) or i >= len(values):
                raise WeatherProviderError(f"weather provider omitted {name}")
            return _finite_number(values[i], name)

        code_values = daily.get("weather_code")
        if not isinstance(code_values, list) or i >= len(code_values):
            raise WeatherProviderError("weather provider omitted weather_code")
        weather_code = int(number("weather_code"))
        rows.append({
            "date": day,
            "weather_code": weather_code,
            "temperature_min_c": number("temperature_2m_min"),
            "temperature_max_c": number("temperature_2m_max"),
            "precipitation_mm": number("precipitation_sum"),
            "precipitation_probability_max_pct": number("precipitation_probability_max"),
            "wind_speed_max_m_s": number("wind_speed_10m_max"),
            "shortwave_radiation_mj_m2": number("shortwave_radiation_sum"),
            "et0_fao_mm": number("et0_fao_evapotranspiration"),
        })

    status = provider_status()
    return {
        "provider": status,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "timezone": "Africa/Algiers",
        "forecast_days": rows,
        "units": {
            "temperature": "°C",
            "precipitation": "mm",
            "wind_speed": "m/s",
            "shortwave_radiation": "MJ/m²",
            "et0_fao": "mm/day",
        },
        "provenance": "INFERRED",
        "method": "numerical_weather_forecast",
        "field_measurement": False,
    }
