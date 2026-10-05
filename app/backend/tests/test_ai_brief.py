from app import config
from app.models import Project, Site
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
