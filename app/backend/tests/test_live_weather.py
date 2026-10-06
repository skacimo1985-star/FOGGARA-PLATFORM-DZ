import pytest

from app.services import weather_provider
from tests.conftest import login


def _site_project(client, headers, *, coordinates=True, title="Weather project"):
    site_payload = {"name": f"{title} site", "wilaya": "Laghouat"}
    if coordinates:
        site_payload.update({"lat": 33.8000, "lon": 2.8800})
    site = client.post("/api/sites", headers=headers, json=site_payload)
    assert site.status_code == 201, site.text
    project = client.post("/api/projects", headers=headers, json={
        "title": title,
        "domain": "food",
        "site_id": site.json()["id"],
    })
    assert project.status_code == 201, project.text
    return site.json(), project.json()


def _provider_result():
    return {
        "provider": "FOGGARA Weather",
        "provider_contract": "open-meteo-compatible-v1",
        "attribution": "Weather data test attribution",
        "model_name": "provider-best-match",
        "latitude": 33.8,
        "longitude": 2.88,
        "timezone": "Africa/Algiers",
        "fetched_at": "2026-10-06T22:00:00+00:00",
        "days": [{
            "day": "2026-10-07",
            "min_c": 16.0,
            "max_c": 29.0,
            "rain_mm": 0.0,
            "precipitation_probability": 5.0,
            "eto_mm": 5.4,
            "wind_speed_kmh": 19.0,
            "weather_code": 1,
        }],
        "live": True,
        "stored": False,
        "provenance": "INFERRED_PROVIDER_FORECAST",
        "verified": False,
        "field_execution": False,
    }


def test_live_weather_uses_owned_project_site_coordinates(client, world, monkeypatch):
    headers = login(client, "o1m@t.dz")
    site, project = _site_project(client, headers)
    captured = {}

    def fake_fetch_forecast(*, latitude, longitude, days):
        captured.update(latitude=latitude, longitude=longitude, days=days)
        return _provider_result()

    monkeypatch.setattr(weather_provider, "fetch_forecast", fake_fetch_forecast)
    response = client.get(
        f"/api/projects/{project['id']}/agriculture/weather/live?days=15",
        headers=headers,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert captured == {"latitude": 33.8, "longitude": 2.88, "days": 15}
    assert body["site"]["id"] == site["id"]
    assert body["provenance"] == "INFERRED_PROVIDER_FORECAST"
    assert body["verified"] is False
    assert body["stored"] is False
    assert body["field_execution"] is False


def test_live_weather_requires_site_coordinates_and_tenant_ownership(client, world, monkeypatch):
    owner = login(client, "o1m@t.dz")
    other = login(client, "o2m@t.dz")
    _site, project = _site_project(client, owner, coordinates=False, title="No-coordinate weather")

    missing = client.get(
        f"/api/projects/{project['id']}/agriculture/weather/live",
        headers=owner,
    )
    assert missing.status_code == 409
    assert missing.json()["detail"]["code"] == "PROJECT_SITE_COORDINATES_REQUIRED"

    cross_tenant = client.get(
        f"/api/projects/{project['id']}/agriculture/weather/live",
        headers=other,
    )
    assert cross_tenant.status_code == 404


def test_live_weather_disabled_provider_fails_closed(client, world, monkeypatch):
    headers = login(client, "o1m@t.dz")
    _site, project = _site_project(client, headers, title="Disabled provider weather")
    monkeypatch.setattr(weather_provider.config, "WEATHER_PROVIDER_ENABLED", False)

    response = client.get(
        f"/api/projects/{project['id']}/agriculture/weather/live",
        headers=headers,
    )
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "WEATHER_PROVIDER_NOT_CONFIGURED"


def test_weather_provider_normalizes_daily_agricultural_fields(monkeypatch):
    monkeypatch.setattr(weather_provider.config, "WEATHER_PROVIDER_NAME", "Test Weather")
    monkeypatch.setattr(weather_provider.config, "WEATHER_PROVIDER_ATTRIBUTION", "CC BY test")
    body = {
        "latitude": 33.8125,
        "longitude": 2.875,
        "timezone": "Africa/Algiers",
        "daily": {
            "time": ["2026-10-07", "2026-10-08"],
            "weather_code": [1, 3],
            "temperature_2m_max": [29.2, 27.0],
            "temperature_2m_min": [16.1, 15.4],
            "precipitation_sum": [0.0, 2.7],
            "precipitation_probability_max": [4, 55],
            "et0_fao_evapotranspiration": [5.3, 4.7],
            "wind_speed_10m_max": [18.0, 24.5],
        },
    }
    result = weather_provider.normalize_forecast(body, requested_days=15)
    assert result["provider"] == "Test Weather"
    assert result["provenance"] == "INFERRED_PROVIDER_FORECAST"
    assert result["verified"] is False
    assert result["days"][1]["rain_mm"] == 2.7
    assert result["days"][0]["eto_mm"] == 5.3


def test_weather_provider_rejects_malformed_or_out_of_bounds_data():
    malformed = {
        "latitude": 33.8,
        "longitude": 2.88,
        "daily": {
            "time": ["2026-10-07"],
            "weather_code": [1],
            "temperature_2m_max": [25],
            "temperature_2m_min": [30],
            "precipitation_sum": [0],
            "precipitation_probability_max": [0],
            "et0_fao_evapotranspiration": [4],
            "wind_speed_10m_max": [10],
        },
    }
    with pytest.raises(weather_provider.WeatherProviderInvalidResponse):
        weather_provider.normalize_forecast(malformed, requested_days=15)
