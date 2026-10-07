from datetime import datetime, timezone

from app import config
from app.routers import weather_parcels
from app.services import weather_provider
from tests.conftest import login


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeClient:
    def __init__(self, payload, capture):
        self.payload = payload
        self.capture = capture

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def get(self, url, **kwargs):
        self.capture["url"] = url
        self.capture["kwargs"] = kwargs
        return FakeResponse(self.payload)


def provider_payload(days=2):
    dates = ["2026-10-07", "2026-10-08"][:days]
    return {
        "daily": {
            "time": dates,
            "weather_code": [1, 2][:days],
            "temperature_2m_max": [31.0, 30.0][:days],
            "temperature_2m_min": [18.0, 17.0][:days],
            "precipitation_sum": [0.0, 1.2][:days],
            "precipitation_probability_max": [5.0, 35.0][:days],
            "wind_speed_10m_max": [6.5, 7.1][:days],
            "shortwave_radiation_sum": [21.4, 20.2][:days],
            "et0_fao_evapotranspiration": [5.4, 4.9][:days],
        },
        "daily_units": {
            "temperature_2m_max": "°C",
            "temperature_2m_min": "°C",
            "precipitation_sum": "mm",
            "precipitation_probability_max": "%",
            "wind_speed_10m_max": "m/s",
            "shortwave_radiation_sum": "MJ/m²",
            "et0_fao_evapotranspiration": "mm",
        },
    }


def test_weather_provider_fetches_agricultural_daily_forecast(monkeypatch):
    monkeypatch.setattr(config, "WEATHER_PROVIDER_ENABLED", True)
    monkeypatch.setattr(config, "WEATHER_BASE_URL", "https://customer-api.open-meteo.com/v1/forecast")
    monkeypatch.setattr(config, "WEATHER_API_KEY", "test-key")
    monkeypatch.setattr(config, "WEATHER_TIMEOUT_SECONDS", 10.0)

    capture = {}
    monkeypatch.setattr(
        weather_provider.httpx,
        "Client",
        lambda **_kwargs: FakeClient(provider_payload(), capture),
    )
    result = weather_provider.fetch_daily_forecast(33.8, 2.9, days=2)

    assert result["provenance"] == "INFERRED"
    assert result["field_measurement"] is False
    assert result["provider"]["mode"] == "commercial"
    assert result["forecast_days"][0]["et0_fao_mm"] == 5.4
    assert result["forecast_days"][1]["precipitation_mm"] == 1.2
    assert capture["url"] == "https://customer-api.open-meteo.com/v1/forecast"
    params = capture["kwargs"]["params"]
    assert params["timezone"] == "Africa/Algiers"
    assert params["forecast_days"] == 2
    assert params["wind_speed_unit"] == "ms"
    assert params["apikey"] == "test-key"
    assert "et0_fao_evapotranspiration" in params["daily"]


def test_weather_status_is_honest_when_disabled(client, world, monkeypatch):
    monkeypatch.setattr(config, "WEATHER_PROVIDER_ENABLED", False)
    headers = login(client, "o1m@t.dz")
    response = client.get("/api/agriculture/weather/status", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is False
    assert body["max_forecast_days"] == 15
    assert body["provenance"] == "INFERRED"


def _parcel(client, headers, *, located=True):
    payload = {
        "name": "Weather parcel",
        "crop": "wheat",
        "area_ha": 2.0,
        "location": "Laghouat",
    }
    if located:
        payload.update({"lat": 33.8, "lon": 2.9})
    response = client.post("/api/agriculture/parcels", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def test_parcel_weather_is_org_isolated_and_requires_coordinates(client, world, monkeypatch):
    h1 = login(client, "o1m@t.dz")
    h2 = login(client, "o2m@t.dz")
    missing = _parcel(client, h1, located=False)
    no_coords = client.get(f"/api/agriculture/parcels/{missing}/weather", headers=h1)
    assert no_coords.status_code == 422
    assert no_coords.json()["detail"]["code"] == "PARCEL_COORDINATES_REQUIRED"

    located = _parcel(client, h1, located=True)
    assert client.get(f"/api/agriculture/parcels/{located}/weather", headers=h2).status_code == 404


def test_parcel_weather_returns_live_provider_result(client, world, monkeypatch):
    h = login(client, "o1m@t.dz")
    parcel_id = _parcel(client, h, located=True)
    monkeypatch.setattr(
        weather_parcels,
        "fetch_daily_forecast",
        lambda lat, lon, days=15: {
            "provider": {"configured": True, "mode": "commercial", "provider": "open-meteo-compatible"},
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "timezone": "Africa/Algiers",
            "forecast_days": [{
                "date": "2026-10-07",
                "weather_code": 1,
                "temperature_min_c": 18.0,
                "temperature_max_c": 31.0,
                "precipitation_mm": 0.0,
                "precipitation_probability_max_pct": 5.0,
                "wind_speed_max_m_s": 6.5,
                "shortwave_radiation_mj_m2": 21.4,
                "et0_fao_mm": 5.4,
            }],
            "units": {"et0_fao": "mm/day"},
            "provenance": "INFERRED",
            "method": "numerical_weather_forecast",
            "field_measurement": False,
        },
    )
    response = client.get(
        f"/api/agriculture/parcels/{parcel_id}/weather",
        params={"days": 15},
        headers=h,
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["parcel_id"] == parcel_id
    assert body["forecast"]["forecast_days"][0]["et0_fao_mm"] == 5.4
    assert body["forecast"]["provenance"] == "INFERRED"
    assert body["forecast"]["field_measurement"] is False
