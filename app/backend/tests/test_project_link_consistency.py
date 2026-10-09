"""Resource ancestry must remain coherent on create, patch and service intake."""
import pytest
from sqlalchemy import select
from app.models import Project, Service, ServiceRequest
from tests.conftest import login


def topology(client, world):
    headers = login(client, "o1m@t.dz")
    sites, resources, assets = [], [], []
    for name in ("A", "B"):
        s = client.post("/api/sites", headers=headers, json={"name": name, "wilaya": "Laghouat"})
        assert s.status_code == 201, s.text
        sites.append(s.json()["id"])
        r = client.post("/api/resources", headers=headers, json={"name": name, "type": "well", "site_id": sites[-1]})
        assert r.status_code == 201, r.text
        resources.append(r.json()["id"])
        a = client.post("/api/assets", headers=headers, json={"name": name, "kind": "pump", "resource_id": resources[-1]})
        assert a.status_code == 201, a.text
        assets.append(a.json()["id"])
    return headers, sites, resources, assets


@pytest.mark.parametrize("mismatch", ["site_resource", "resource_asset", "site_asset"])
def test_create_rejects_inconsistent_ancestry(client, world, db, mismatch):
    h, s, r, a = topology(client, world)
    links = {"site_resource": {"site_id": s[0], "resource_id": r[1]},
             "resource_asset": {"resource_id": r[0], "asset_id": a[1]},
             "site_asset": {"site_id": s[0], "asset_id": a[1]}}[mismatch]
    response = client.post("/api/projects", headers=h, json={"title": "Invalid", **links})
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "INCONSISTENT_PROJECT_LINKS"
    assert db.scalar(select(Project)) is None


def test_patch_checks_retained_links_and_preserves_existing_project(client, world, db):
    h, s, r, a = topology(client, world)
    response = client.post("/api/projects", headers=h, json={"title": "Valid", "site_id": s[0], "resource_id": r[0], "asset_id": a[0]})
    assert response.status_code == 201
    project = response.json()
    response = client.patch(f"/api/projects/{project['id']}", headers=h, json={"site_id": s[1]})
    assert response.status_code == 422
    assert client.get(f"/api/projects/{project['id']}", headers=h).json()["site_id"] == s[0]
    response = client.patch(f"/api/projects/{project['id']}", headers=h, json={"site_id": s[1], "resource_id": r[1], "asset_id": a[1]})
    assert response.status_code == 200


def test_foreign_links_remain_undisclosed(client, world, db):
    _, s, _, _ = topology(client, world)
    other = login(client, "o2m@t.dz")
    response = client.post("/api/projects", headers=other, json={"title": "Foreign", "site_id": s[0]})
    assert response.status_code == 404


def test_service_request_must_use_project_site(client, world, db):
    h, s, r, a = topology(client, world)
    p = client.post("/api/projects", headers=h, json={"title": "Valid", "resource_id": r[0], "asset_id": a[0]}).json()
    service = Service(name_ar="قياس", name_fr="Mesure", name_en="Measurement", type="measurement", provider="Test")
    db.add(service)
    db.commit()
    response = client.post("/api/service-requests", headers=h, json={"service_id": service.id, "project_id": p["id"], "site_id": s[1]})
    assert response.status_code == 422
    assert db.scalar(select(ServiceRequest)) is None
    response = client.post("/api/service-requests", headers=h, json={"service_id": service.id, "project_id": p["id"], "site_id": s[0]})
    assert response.status_code == 201, response.text
