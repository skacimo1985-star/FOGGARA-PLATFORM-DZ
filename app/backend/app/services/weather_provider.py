"""Read-only agricultural weather provider adapter.

The request URL is operator-configured, never supplied by a user. Forecasts are
provider predictions, therefore FOGGARA exposes them as INFERRED and never as
verified measurements or automatic field-control inputs.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
import math

import httpx

from .. import config


DAILY_VARIABLES = (
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "precipitation_sum",
    "precipitation_probability_max",
    "et0_fao_evapotranspiration",
    "wind_speed_10m_max",
)


class WeatherProviderNotConfigured(RuntimeError):
    pass


class WeatherProviderUnavailable(RuntimeError):
    pass


class WeatherProviderInvalidResponse(RuntimeError):
    pass


def _required_number(value, *, minimum: float, maximum: float, label: str) -> float:
    if isinstance(value, bool):
        raise WeatherProviderInvalidResponse(f"{label} must be numeric")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise WeatherProviderInvalidResponse(f"{label} must be numeric") from exc
    if not math.isfinite(number) or not minimum <= number <= maximum:
        raise WeatherProviderInvalidResponse(f"{label} is outside supported bounds")
    return number


def _optional_number(value, *, minimum: float, maximum: float, label: str) -> float | None:
    if value is None:
        return None
    return _required_number(value, minimum=minimum, maximum=maximum, label=label)


def _daily_array(daily: dict, key: str, length: int) -> list:
    value = daily.get(key)
    if not isinstance(value, list) or len(value) != length:
        raise WeatherProviderInvalidResponse(f"daily.{key} length is invalid")
    return value


def normalize_forecast(body: object, *, requested_days: int) -> dict:
    if not isinstance(body, dict):
        raise WeatherProviderInvalidResponse("weather provider returned a non-object response")
    daily = body.get("daily")
    if not isinstance(daily, dict):
        raise WeatherProviderInvalidResponse("weather provider response has no daily object")
    raw_days = daily.get("time")
    if not isinstance(raw_days, list) or not 1 <= len(raw_days) <= requested_days:
        raise WeatherProviderInvalidResponse("weather provider returned an invalid forecast length")

    keys = {key: _daily_array(daily, key, len(raw_days)) for key in DAILY_VARIABLES}
    result_days: list[dict] = []
    previous: date | None = None
    for index, raw_day in enumerate(raw_days):
        if not isinstance(raw_day, str):
            raise WeatherProviderInvalidResponse("forecast day must be an ISO date")
        try:
            parsed_day = date.fromisoformat(raw_day)
        except ValueError as exc:
            raise WeatherProviderInvalidResponse("forecast day is not ISO-8601") from exc
        if previous is not None and parsed_day <= previous:
            raise WeatherProviderInvalidResponse("forecast days must be strictly chronological")
        previous = parsed_day

        minimum = _required_number(
            keys["temperature_2m_min"][index], minimum=-90, maximum=70, label="temperature_2m_min"
        )
        maximum = _required_number(
            keys["temperature_2m_max"][index], minimum=-90, maximum=70, label="temperature_2m_max"
        )
        if minimum > maximum:
            raise WeatherProviderInvalidResponse("minimum temperature exceeds maximum temperature")

        weather_code = _required_number(
            keys["weather_code"][index], minimum=0, maximum=99, label="weather_code"
        )
        result_days.append({
            "day": parsed_day.isoformat(),
            "min_c": minimum,
            "max_c": maximum,
            "rain_mm": _required_number(
                keys["precipitation_sum"][index], minimum=0, maximum=1000, label="precipitation_sum"
            ),
            "precipitation_probability": _optional_number(
                keys["precipitation_probability_max"][index],
                minimum=0,
                maximum=100,
                label="precipitation_probability_max",
            ),
            "eto_mm": _optional_number(
                keys["et0_fao_evapotranspiration"][index],
                minimum=0,
                maximum=50,
                label="et0_fao_evapotranspiration",
            ),
            "wind_speed_kmh": _optional_number(
                keys["wind_speed_10m_max"][index], minimum=0, maximum=500, label="wind_speed_10m_max"
            ),
            "weather_code": int(weather_code),
        })

    latitude = _required_number(body.get("latitude"), minimum=-90, maximum=90, label="latitude")
    longitude = _required_number(body.get("longitude"), minimum=-180, maximum=180, label="longitude")
    return {
        "provider": config.WEATHER_PROVIDER_NAME,
        "provider_contract": "open-meteo-compatible-v1",
        "attribution": config.WEATHER_PROVIDER_ATTRIBUTION,
        "attribution_url": config.WEATHER_PROVIDER_ATTRIBUTION_URL,
        "model_name": "provider-best-match",
        "latitude": latitude,
        "longitude": longitude,
        "timezone": str(body.get("timezone") or "Africa/Algiers"),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "days": result_days,
        "live": True,
        "stored": False,
        "provenance": "INFERRED_PROVIDER_FORECAST",
        "verified": False,
        "field_execution": False,
    }


def fetch_forecast(*, latitude: float, longitude: float, days: int = 15) -> dict:
    if not config.WEATHER_PROVIDER_ENABLED:
        raise WeatherProviderNotConfigured("weather provider is disabled")
    if not 1 <= days <= 15:
        raise ValueError("days must be between 1 and 15")

    params: dict[str, str | float | int] = {
        "latitude": latitude,
        "longitude": longitude,
        "daily": ",".join(DAILY_VARIABLES),
        "timezone": "Africa/Algiers",
        "forecast_days": days,
        "wind_speed_unit": "kmh",
        "precipitation_unit": "mm",
    }
    if config.WEATHER_API_KEY:
        params["apikey"] = config.WEATHER_API_KEY

    try:
        timeout = httpx.Timeout(config.WEATHER_TIMEOUT_SECONDS, connect=min(5.0, config.WEATHER_TIMEOUT_SECONDS))
        with httpx.Client(timeout=timeout, follow_redirects=False) as client:
            response = client.get(
                f"{config.WEATHER_BASE_URL}/v1/forecast",
                params=params,
                headers={"Accept": "application/json", "User-Agent": "FOGGARA-DZ/weather"},
            )
            response.raise_for_status()
            body = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise WeatherProviderUnavailable("weather provider is unavailable") from exc

    return normalize_forecast(body, requested_days=days)
