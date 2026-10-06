from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models import AuditLog
from tests.conftest import login


def make_project(client, headers, title="Measurement import project"):
    response = client.post("/api/projects", headers=headers, json={
        "title": title,
        "domain": "water",
    })
    assert response.status_code == 201, response.text
    return response.json()


def row(parameter="ph", value=7.2, unit="pH", measured_at=None, source="LAB-CSV-01"):
    return {
        "parameter": parameter,
        "value": value,
        "unit": unit,
        "measured_at": measured_at or (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat(),
        "source": source,
        "method": "CSV laboratory import",
        "resource_id": None,
        "instrument_id": None,
        "asset_id": None,
    }


def test_measurement_batch_import_is_pending_audited_and_idempotent(client, world, db):
    headers = login(client, "o1m@t.dz")
    project = make_project(client, headers)
    payload = {
        "batch_reference": "LAB-2026-10-06-A",
        "rows": [
            row(),
            row(parameter="ec", value=2.1, unit="dS/m", source="LAB-CSV-02"),
        ],
    }

    first = client.post(
        f"/api/projects/{project['id']}/measurements/import",
        headers=headers,
        json=payload,
    )
    assert first.status_code == 201, first.text
    body = first.json()
    assert body["received"] == 2
    assert body["created_count"] == 2
    assert body["skipped_duplicates"] == 0
    assert all(x["quality_status"] == "pending" for x in body["created"])
    assert all(x["verification_status"] == "unverified" for x in body["created"])

    stored = client.get(f"/api/projects/{project['id']}/measurements", headers=headers)
    assert stored.status_code == 200, stored.text
    assert len(stored.json()) == 2
    assert {x["source_type"] for x in stored.json()} == {"imported"}
    assert {x["is_demo"] for x in stored.json()} == {False}

    again = client.post(
        f"/api/projects/{project['id']}/measurements/import",
        headers=headers,
        json=payload,
    )
    assert again.status_code == 201, again.text
    assert again.json()["created_count"] == 0
    assert again.json()["skipped_duplicates"] == 2
    assert len(client.get(f"/api/projects/{project['id']}/measurements", headers=headers).json()) == 2

    audit_row = db.scalar(select(AuditLog).where(
        AuditLog.action == "measurement_batch_import",
        AuditLog.entity_type == "project",
        AuditLog.entity_id == project["id"],
    ).order_by(AuditLog.id.desc()))
    assert audit_row is not None
    assert audit_row.meta["batch_reference"] == payload["batch_reference"]


def test_measurement_batch_is_atomic_on_invalid_row(client, world):
    headers = login(client, "o1m@t.dz")
    project = make_project(client, headers, "Atomic import")
    payload = {
        "batch_reference": "ATOMIC-FAIL",
        "rows": [
            row(source="VALID-FIRST"),
            row(parameter="ph", value=99, unit="pH", source="INVALID-SECOND"),
        ],
    }
    response = client.post(
        f"/api/projects/{project['id']}/measurements/import",
        headers=headers,
        json=payload,
    )
    assert response.status_code == 422, response.text
    assert client.get(f"/api/projects/{project['id']}/measurements", headers=headers).json() == []


def test_measurement_batch_rejects_naive_future_and_other_tenant(client, world):
    owner = login(client, "o1m@t.dz")
    other = login(client, "o2m@t.dz")
    project = make_project(client, owner, "Tenant measurement import")
    url = f"/api/projects/{project['id']}/measurements/import"

    denied = client.post(url, headers=other, json={
        "batch_reference": "CROSS-TENANT",
        "rows": [row()],
    })
    assert denied.status_code == 404

    naive = client.post(url, headers=owner, json={
        "batch_reference": "NAIVE-TIME",
        "rows": [row(measured_at="2026-10-06T10:00:00")],
    })
    assert naive.status_code == 422

    future = client.post(url, headers=owner, json={
        "batch_reference": "FUTURE-TIME",
        "rows": [row(measured_at=(datetime.now(timezone.utc) + timedelta(days=1)).isoformat())],
    })
    assert future.status_code == 422


def test_measurement_batch_deduplicates_rows_inside_same_file(client, world):
    headers = login(client, "o1m@t.dz")
    project = make_project(client, headers, "Duplicate rows")
    exact = row(source="DUPLICATE-IN-FILE")
    response = client.post(
        f"/api/projects/{project['id']}/measurements/import",
        headers=headers,
        json={"batch_reference": "DUP-1", "rows": [exact, exact]},
    )
    assert response.status_code == 201, response.text
    assert response.json()["created_count"] == 1
    assert response.json()["skipped_duplicates"] == 1
