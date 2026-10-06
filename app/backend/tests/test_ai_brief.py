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


def test_ai_status_exposes_sovereign_local_mode(client, world, monkeypatch):
    monkeypatch.setattr(config, "AI_PROVIDER_MODE", "local")
    monkeypatch.setattr(config, "AI_BASE_URL", "http://127.0.0.1:11434/v1")
    monkeypatch.setattr(config, "AI_MODEL", "qwen2.5:7b")
    monkeypatch.setattr(config, "AI_API_KEY", "")
    headers = login(client, "o1m@t.dz")

    response = client.get("/api/ai/status", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["configured"] is True
    assert body["provider_mode"] == "local"
    assert body["local_enabled"] is True
    assert body["external_enabled"] is False
    assert body["data_boundary"] == "operator-local"
    assert body["external_payload_policy"] == "aggregated_counts_only"


def test_local_ai_provider_omits_authorization_and_receives_aggregate_only(monkeypatch):
    monkeypatch.setattr(config, "AI_PROVIDER_MODE", "local")
    monkeypatch.setattr(config, "AI_BASE_URL", "http://127.0.0.1:11434/v1")
    monkeypatch.setattr(config, "AI_MODEL", "qwen2.5:7b")
    monkeypatch.setattr(config, "AI_API_KEY", "")
    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "choices": [{
                    "message": {
                        "content": '{"headline":"H","executive_summary":"S","proof_points":["P"],"gaps":["G"],"next_actions":["A"]}'
                    }
                }]
            }

    class FakeClient:
        def __init__(self, *args, **kwargs):
            captured["client_kwargs"] = kwargs

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, headers, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return FakeResponse()

    monkeypatch.setattr(ai_brief.httpx, "Client", FakeClient)
    fallback = {
        "headline": "fallback",
        "executive_summary": "fallback",
        "proof_points": ["fallback"],
        "gaps": ["fallback"],
        "next_actions": ["fallback"],
    }
    scope = {"type": "project", "domain": "water", "is_demo": False, "project_title": "SECRET TITLE"}
    snapshot = {"projects_total": 1, "verified_evidence": 2}

    brief, used = ai_brief._provider_brief("en", scope, snapshot, fallback)
    assert used is True
    assert brief["headline"] == "H"
    assert captured["url"] == "http://127.0.0.1:11434/v1/chat/completions"
    assert "Authorization" not in captured["headers"]
    payload_text = captured["json"]["messages"][1]["content"]
    assert "projects_total" in payload_text
    assert "SECRET TITLE" not in payload_text


def test_configured_local_ai_falls_back_deterministically(client, world, monkeypatch):
    monkeypatch.setattr(config, "AI_PROVIDER_MODE", "local")
    monkeypatch.setattr(config, "AI_BASE_URL", "http://127.0.0.1:11434/v1")
    monkeypatch.setattr(config, "AI_MODEL", "qwen2.5:7b")
    monkeypatch.setattr(config, "AI_API_KEY", "")
    monkeypatch.setattr(ai_brief, "_provider_brief", lambda *args: (args[-1], False))
    headers = login(client, "o1m@t.dz")

    response = client.post("/api/ai/investor-brief", headers=headers, json={"locale": "en"})
    assert response.status_code == 200
    body = response.json()
    assert body["provider"]["configured"] is True
    assert body["provider"]["mode"] == "deterministic"
    assert body["provider"]["fallback_used"] is True
    assert body["provider"]["data_boundary"] == "in-process"
