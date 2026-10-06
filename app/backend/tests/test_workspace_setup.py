from app.models import AgriParcel, Project, Site, WaterResource


def test_workspace_setup_creates_real_operational_records(client, world):
    token = world["token1"]
    headers = {"Authorization": f"Bearer {token}"}
    body = {
        "site": {"name": "Operational farm", "wilaya": "الأغواط", "commune": "Laghouat", "lat": 33.8, "lon": 2.87},
        "project": {"title": "Irrigation modernization", "description": "Real onboarding record", "domain": "food"},
        "resource": {"type": "borehole", "name": "Well A", "status": "active"},
        "parcel": {"name": "Parcel A", "crop": "wheat", "area_ha": 4.5, "stage": "initial"},
    }

    first = client.post("/api/workspace/setup", json=body, headers=headers)
    assert first.status_code == 201, first.text
    payload = first.json()
    assert payload["workspace_initialized"] is True
    assert payload["is_demo"] is False
    assert payload["site"]["created"] is True
    assert payload["project"]["created"] is True
    assert payload["resource"]["created"] is True
    assert payload["parcel"]["created"] is True

    second = client.post("/api/workspace/setup", json=body, headers=headers)
    assert second.status_code == 201, second.text
    repeated = second.json()
    assert repeated["site"]["id"] == payload["site"]["id"]
    assert repeated["project"]["id"] == payload["project"]["id"]
    assert repeated["resource"]["id"] == payload["resource"]["id"]
    assert repeated["parcel"]["id"] == payload["parcel"]["id"]
    assert repeated["site"]["created"] is False
    assert repeated["project"]["created"] is False
    assert repeated["resource"]["created"] is False
    assert repeated["parcel"]["created"] is False


def test_workspace_setup_rejects_half_coordinate_pair(client, world):
    headers = {"Authorization": f"Bearer {world['token1']}"}
    result = client.post("/api/workspace/setup", headers=headers, json={
        "site": {"name": "Bad coordinate site", "wilaya": "الأغواط", "lat": 33.8},
        "project": {"title": "Bad coordinate project", "domain": "water"},
    })
    assert result.status_code == 422
