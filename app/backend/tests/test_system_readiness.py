from app import config
from tests.conftest import login


def test_readiness_requires_authentication(client):
    response = client.get("/api/system/readiness")
    assert response.status_code == 401


def test_readiness_reports_runtime_without_claiming_production_certification(client, world):
    headers = login(client, "o1m@t.dz")
    response = client.get("/api/system/readiness", headers=headers)
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["runtime_status"] == "healthy"
    assert body["core"]["database"]["status"] == "up"
    assert body["core"]["database"]["schema_revision"]
    assert body["production_certification"] is False
    assert body["meaning"].startswith("Runtime health")
    assert len(body["assurance_gates"]) == 5
    assert {gate["status"] for gate in body["assurance_gates"]} == {"NOT_PROVEN"}


def test_readiness_reflects_ai_weather_and_automation_configuration(client, world, monkeypatch):
    monkeypatch.setattr(config, "AI_PROVIDER_MODE", "local")
    monkeypatch.setattr(config, "AI_BASE_URL", "http://127.0.0.1:11434/v1")
    monkeypatch.setattr(config, "AI_MODEL", "qwen2.5:7b")
    monkeypatch.setattr(config, "AI_API_KEY", "")
    monkeypatch.setattr(config, "WEATHER_PROVIDER_ENABLED", True)
    monkeypatch.setattr(config, "WEATHER_BASE_URL", "https://weather.example.invalid")
    monkeypatch.setattr(config, "WEATHER_PROVIDER_NAME", "Weather Test")
    monkeypatch.setattr(config, "WEATHER_PROVIDER_ATTRIBUTION", "Weather attribution")
    monkeypatch.setattr(config, "WEATHER_PROVIDER_ATTRIBUTION_URL", "https://weather.example.invalid/source")
    monkeypatch.setattr(config, "OPERATIONS_AUTOMATION_ENABLED", True)
    headers = login(client, "o1m@t.dz")

    body = client.get("/api/system/readiness", headers=headers).json()
    assert body["integrations"]["ai"]["status"] == "configured"
    assert body["integrations"]["ai"]["mode"] == "local"
    assert body["integrations"]["ai"]["data_boundary"] == "operator-local"
    assert body["integrations"]["weather"]["status"] == "configured"
    assert body["integrations"]["weather"]["field_execution"] is False
    assert body["integrations"]["automation"]["web_runtime_enabled"] is True
    assert body["integrations"]["satellite"]["status"] == "available"
