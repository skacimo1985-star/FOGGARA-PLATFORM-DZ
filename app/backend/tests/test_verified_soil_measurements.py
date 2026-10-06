from datetime import datetime, timedelta, timezone

from tests.conftest import login


def project(client, headers, title="Verified soil project", site_id=None):
    payload = {"title": title, "domain": "food"}
    if site_id is not None:
        payload["site_id"] = site_id
    response = client.post("/api/projects", headers=headers, json=payload)
    assert response.status_code == 201, response.text
    return response.json()




def owned_parcel(client, email="o1m@t.dz"):
    headers = login(client, email)
    response = client.post("/api/agriculture/parcels", headers=headers, json={
        "name": "Verified soil field",
        "crop": "wheat",
        "area_ha": 4.0,
        "location": "Laghouat",
    })
    assert response.status_code == 201, response.text
    return headers, response.json()["id"]


def soil_row(parcel_id, parameter, value, unit, source):
    return {
        "parcel_id": parcel_id,
        "resource_id": None,
        "parameter": parameter,
        "value": value,
        "unit": unit,
        "measured_at": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
        "source": source,
        "method": "accredited laboratory method",
        "instrument_id": None,
        "asset_id": None,
    }


def test_verified_parcel_measurements_drive_soil_service_after_independent_review(client, world):
    member, parcel_id = owned_parcel(client)
    reviewer = login(client, "o1r@t.dz")
    p = project(client, member)
    batch = "SOIL-LAB-VERIFIED-01"
    rows = [
        soil_row(parcel_id, "ph", 8.3, "pH", "SOIL-LAB-PH"),
        soil_row(parcel_id, "soil_ec", 5.2, "dS/m", "SOIL-LAB-EC"),
        soil_row(parcel_id, "soil_nitrogen", 48, "mg/kg", "SOIL-LAB-N"),
        soil_row(parcel_id, "soil_soc", 1.7, "%", "SOIL-LAB-SOC"),
    ]
    imported = client.post(
        f"/api/projects/{p['id']}/measurements/import",
        headers=member,
        json={"batch_reference": batch, "rows": rows},
    )
    assert imported.status_code == 201, imported.text
    assert imported.json()["created_count"] == 4

    before = client.get(
        f"/api/agriculture/parcels/{parcel_id}/service-summary?project_id={p['id']}",
        headers=member,
    )
    assert before.status_code == 200, before.text
    before_body = before.json()
    assert before_body["soil_provenance"] == "AGRICULTURE_OBSERVATIONS"
    assert before_body["soil_assessment"]["coverage"] == []

    reviewed = client.post("/api/reviews/measurement-batches", headers=reviewer, json={
        "project_id": p["id"],
        "batch_reference": batch,
        "decision": "accepted",
        "note": "laboratory report and provenance checked",
        "reason": "independent technical review",
    })
    assert reviewed.status_code == 201, reviewed.text
    assert reviewed.json()["reviewed_count"] == 4

    after = client.get(
        f"/api/agriculture/parcels/{parcel_id}/service-summary?project_id={p['id']}",
        headers=member,
    )
    assert after.status_code == 200, after.text
    body = after.json()
    soil = body["soil_assessment"]
    assert body["soil_provenance"] == "VERIFIED_MEASUREMENTS"
    assert body["available_services"]["soil_screening"] is True
    assert soil["evidence_status"] == "COMPUTED_FROM_VERIFIED_MEASUREMENTS"
    assert soil["decision_status"] == "PROPOSED"
    assert {"ph", "ec", "nitrogen", "soc"} <= set(soil["coverage"])
    assert soil["inputs"]["ph"] == 8.3
    assert soil["inputs"]["ec"] == 5.2
    assert any(item["message"] == "salinity_risk" for item in soil["findings"])
    assert len(soil["measurement_ids"]) == 4
    assert {item["source"] for item in soil["measurement_sources"]} == {
        "SOIL-LAB-PH", "SOIL-LAB-EC", "SOIL-LAB-N", "SOIL-LAB-SOC"
    }

    saved = client.post(
        f"/api/agriculture/parcels/{parcel_id}/service-summary/evidence",
        headers=member,
        json={"project_id": p["id"]},
    )
    assert saved.status_code == 201, saved.text
    evidence = client.get(f"/api/evidences/{saved.json()['evidence_id']}", headers=member).json()
    assert '"soil_provenance":"VERIFIED_MEASUREMENTS"' in evidence["content_note"]
    for measurement_id in soil["measurement_ids"]:
        assert str(measurement_id) in evidence["content_note"]


def test_parcel_link_is_tenant_scoped_and_site_consistent(client, world):
    h1 = login(client, "o1m@t.dz")
    h2 = login(client, "o2m@t.dz")
    p = project(client, h1, "Parcel link integrity")
    other_parcel = client.post("/api/agriculture/parcels", headers=h2, json={
        "name": "Other tenant field", "crop": "wheat", "area_ha": 2, "location": "other",
    })
    assert other_parcel.status_code == 201, other_parcel.text
    cross = client.post(
        f"/api/projects/{p['id']}/measurements/import",
        headers=h1,
        json={
            "batch_reference": "CROSS-PARCEL",
            "rows": [soil_row(other_parcel.json()["id"], "soil_ec", 1.2, "dS/m", "CROSS")],
        },
    )
    assert cross.status_code == 404
    assert client.get(f"/api/projects/{p['id']}/measurements", headers=h1).json() == []

    site1 = client.post("/api/sites", headers=h1, json={"name": "Project site", "wilaya": "Laghouat"}).json()
    site2 = client.post("/api/sites", headers=h1, json={"name": "Other farm site", "wilaya": "Laghouat"}).json()
    site_project = project(client, h1, "Site-bound project", site1["id"])
    parcel = client.post("/api/agriculture/parcels", headers=h1, json={
        "name": "Site B parcel", "crop": "wheat", "area_ha": 3,
        "location": "Laghouat", "site_id": site2["id"],
    }).json()
    mismatch = client.post(
        f"/api/projects/{site_project['id']}/measurements/import",
        headers=h1,
        json={
            "batch_reference": "SITE-MISMATCH",
            "rows": [soil_row(parcel["id"], "soil_ec", 1.0, "dS/m", "SITE-CHECK")],
        },
    )
    assert mismatch.status_code == 409
    assert mismatch.json()["detail"]["code"] == "PARCEL_PROJECT_SITE_MISMATCH"


def test_manual_measurement_can_link_to_owned_parcel(client, world):
    member, parcel_id = owned_parcel(client)
    p = project(client, member, "Manual parcel measurement")
    response = client.post("/api/measurements", headers=member, json={
        "project_id": p["id"],
        "parcel_id": parcel_id,
        "parameter": "soil_moisture",
        "value": 24.2,
        "unit": "%",
        "measured_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
        "source": "FIELD-PROBE-01",
        "method": "gravimetric cross-check",
        "source_type": "manual",
    })
    assert response.status_code == 201, response.text
    assert response.json()["parcel_id"] == parcel_id
