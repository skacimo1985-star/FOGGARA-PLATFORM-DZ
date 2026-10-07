import json
from datetime import datetime, timedelta, timezone

from app import config
from app.models import Project, Site
from app.routers import ai_brief
from .conftest import login


def test_investor_brief_is_org_scoped_and_falls_back_without_external_ai(client, world, db, monkeypatch):
    monkeypatch.setattr(config, "AI_EXTERNAL_ENABLED", False)
    db.add_all([
        Project(org_id=world["org1"].id, title="O1 investor project", domain="water", status="active",
                created_by=world["o1_member"].id, is_demo=True),
        Project(org_id=world["org2"].id, title="O2 hidden project", domain="energy", status="active",
                created_by=world["o2_member"].id, is_demo=True),
        Site(org_id=world["org1"].id, name="O1 site", wilaya="03", lat=33.8, lon=2.9, is_demo=True),
        Site(org_id=world["org2"].id, name="O2 hidden site", wilaya="31", lat=35.7, lon=-0.6, is_demo=True),
    ])
    db.commit()
    headers = login(client, "o1m@t.dz")
    status = client.get("/api/ai/status", headers=headers)
    assert status.status_code == 200
    assert status.json()["configured"] is False
    response = client.post("/api/ai/investor-brief", headers=headers, json={"locale": "en"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["provider"]["mode"] == "deterministic"
    assert body["provenance"] == "PROPOSED"
    assert body["investment_certification"] is False
    assert body["snapshot"]["projects_total"] == 1
    assert body["snapshot"]["sites_total"] == 1
    assert "O2 hidden project" not in body["brief"]["executive_summary"]


def test_investor_brief_project_scope_rejects_cross_org(client, world, db, monkeypatch):
    monkeypatch.setattr(config, "AI_EXTERNAL_ENABLED", False)
    project = Project(org_id=world["org2"].id, title="Private O2", domain="food", status="active",
                      created_by=world["o2_member"].id, is_demo=True)
    db.add(project)
    db.commit()
    headers = login(client, "o1m@t.dz")
    response = client.post("/api/ai/investor-brief", headers=headers, json={"locale": "ar", "project_id": project.id})
    assert response.status_code == 404



class _AIResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _AIClient:
    def __init__(self, capture):
        self.capture = capture

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def post(self, url, **kwargs):
        self.capture["url"] = url
        self.capture["kwargs"] = kwargs
        return _AIResponse({
            "choices": [{
                "message": {
                    "content": json.dumps({
                        "summary": "Grounded parcel advisory.",
                        "alerts": ["Satellite signal is inferred."],
                        "recommended_actions": ["Review the latest field evidence."],
                        "missing_evidence": ["Verified soil moisture measurement."],
                    })
                }
            }]
        })


def _make_ai_parcel(client, headers):
    parcel = client.post("/api/agriculture/parcels", headers=headers, json={
        "name": "Private parcel name",
        "crop": "wheat",
        "area_ha": 2.5,
        "location": "Private location",
        "lat": 33.8123,
        "lon": 2.9123,
    })
    assert parcel.status_code == 201, parcel.text
    parcel_id = parcel.json()["id"]
    observed_at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    observation = client.post("/api/agriculture/observations", headers=headers, json={
        "parcel_id": parcel_id,
        "metric": "ndvi",
        "value": 0.54,
        "source_type": "satellite",
        "source_ref": "PRIVATE-SCENE-REF",
        "observed_at": observed_at,
    })
    assert observation.status_code == 201, observation.text
    return parcel_id


def test_field_advisory_fails_closed_when_no_model_runtime(client, world, monkeypatch):
    monkeypatch.setattr(config, "AI_EXTERNAL_ENABLED", False)
    monkeypatch.setattr(config, "AI_LOCAL_ENABLED", False)
    headers = login(client, "o1m@t.dz")
    parcel_id = _make_ai_parcel(client, headers)

    response = client.post("/api/ai/field-advisory", headers=headers, json={
        "locale": "en",
        "parcel_id": parcel_id,
    })
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "AI_PROVIDER_NOT_CONFIGURED"


def test_field_advisory_uses_local_runtime_and_sanitized_metric_context(client, world, monkeypatch):
    monkeypatch.setattr(config, "AI_EXTERNAL_ENABLED", False)
    monkeypatch.setattr(config, "AI_LOCAL_ENABLED", True)
    monkeypatch.setattr(config, "AI_LOCAL_BASE_URL", "http://ollama:11434/v1")
    monkeypatch.setattr(config, "AI_LOCAL_API_KEY", "")
    monkeypatch.setattr(config, "AI_LOCAL_MODEL", "qwen-local-test")

    capture = {}
    monkeypatch.setattr(ai_brief.httpx, "Client", lambda **_kwargs: _AIClient(capture))

    headers = login(client, "o1m@t.dz")
    parcel_id = _make_ai_parcel(client, headers)
    response = client.post("/api/ai/field-advisory", headers=headers, json={
        "locale": "ar",
        "parcel_id": parcel_id,
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["provider"]["mode"] == "local"
    assert body["provider"]["model"] == "qwen-local-test"
    assert body["provenance"] == "PROPOSED"
    assert body["verified"] is False
    assert body["field_execution"] is False
    assert body["analysis_input"]["latest_metrics"]["ndvi"]["evidence_status"] == "INFERRED"

    assert capture["url"] == "http://ollama:11434/v1/chat/completions"
    sent = json.loads(capture["kwargs"]["json"]["messages"][1]["content"])
    assert sent["parcel"] == {"crop": "wheat", "stage": "initial", "area_ha": 2.5}
    assert "name" not in sent["parcel"]
    assert "lat" not in sent["parcel"] and "lon" not in sent["parcel"]
    assert "source_ref" not in sent["latest_metrics"]["ndvi"]
    assert capture["kwargs"]["headers"] == {"Content-Type": "application/json"}
