from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models import AuditLog, Review
from tests.conftest import login


def make_project(client, headers, title="Batch review project"):
    response = client.post("/api/projects", headers=headers, json={"title": title, "domain": "water"})
    assert response.status_code == 201, response.text
    return response.json()


def import_rows(client, headers, project_id, batch, rows):
    response = client.post(
        f"/api/projects/{project_id}/measurements/import",
        headers=headers,
        json={"batch_reference": batch, "rows": rows},
    )
    assert response.status_code == 201, response.text
    return response.json()


def measurement_row(parameter="ph", value=7.2, unit="pH", source="LAB-BATCH", instrument_id=None):
    return {
        "parameter": parameter,
        "value": value,
        "unit": unit,
        "measured_at": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(),
        "source": source,
        "method": "batch laboratory import",
        "resource_id": None,
        "instrument_id": instrument_id,
        "asset_id": None,
    }


def review_batch(client, headers, project_id, batch, decision="accepted"):
    return client.post("/api/reviews/measurement-batches", headers=headers, json={
        "project_id": project_id,
        "batch_reference": batch,
        "decision": decision,
        "note": "batch review note",
        "reason": "independent batch verification",
    })


def test_pending_queue_groups_imported_measurements_and_batch_accept_is_atomic(client, world, db):
    member = login(client, "o1m@t.dz")
    reviewer = login(client, "o1r@t.dz")
    project = make_project(client, member)
    batch = "LAB-2026-10-06-BATCH-A"
    imported = import_rows(client, member, project["id"], batch, [
        measurement_row(),
        measurement_row(parameter="ec", value=1.8, unit="dS/m", source="LAB-BATCH-EC"),
    ])
    assert imported["created_count"] == 2

    pending = client.get("/api/reviews/pending", headers=reviewer)
    assert pending.status_code == 200, pending.text
    body = pending.json()
    grouped = [item for item in body["measurement_batches"] if item["batch_reference"] == batch]
    assert len(grouped) == 1
    assert grouped[0]["project_id"] == project["id"]
    assert grouped[0]["count"] == 2
    assert grouped[0]["parameters"] == ["ec", "ph"]
    assert len(grouped[0]["measurement_ids"]) == 2
    assert all(m["import_batch_ref"] == batch for m in body["measurements"] if m["id"] in grouped[0]["measurement_ids"])

    reviewed = review_batch(client, reviewer, project["id"], batch)
    assert reviewed.status_code == 201, reviewed.text
    result = reviewed.json()
    assert result["reviewed_count"] == 2
    assert result["decision"] == "accepted"

    measurements = client.get(f"/api/projects/{project['id']}/measurements", headers=member).json()
    batch_rows = [m for m in measurements if m["import_batch_ref"] == batch]
    assert len(batch_rows) == 2
    assert {m["quality_status"] for m in batch_rows} == {"validated"}
    assert {m["verification_status"] for m in batch_rows} == {"verified"}

    reviews = list(db.scalars(select(Review).where(
        Review.org_id == world["org1"].id,
        Review.target_type == "measurement",
    )))
    assert len(reviews) == 2
    batch_audit = db.scalar(select(AuditLog).where(
        AuditLog.action == "measurement_batch_review",
        AuditLog.entity_type == "project",
        AuditLog.entity_id == project["id"],
    ))
    assert batch_audit is not None
    assert batch_audit.meta["batch_reference"] == batch
    assert batch_audit.meta["measurement_count"] == 2

    empty = review_batch(client, reviewer, project["id"], batch)
    assert empty.status_code == 404
    assert empty.json()["detail"]["code"] == "BATCH_NOT_FOUND"


def test_batch_review_forbids_self_review_and_cross_tenant_access(client, world):
    member = login(client, "o1m@t.dz")
    reviewer = login(client, "o1r@t.dz")
    reviewer2 = login(client, "o2r@t.dz")
    project = make_project(client, member, "Batch review isolation")
    batch = "REVIEWER-SUBMITTED"
    imported = import_rows(client, reviewer, project["id"], batch, [measurement_row(source="REVIEWER-LAB")])
    assert imported["created_count"] == 1

    own = review_batch(client, reviewer, project["id"], batch)
    assert own.status_code == 403
    assert own.json()["detail"]["code"] == "SELF_REVIEW_FORBIDDEN"

    other = review_batch(client, reviewer2, project["id"], batch)
    assert other.status_code == 404

    pending = client.get("/api/reviews/pending", headers=reviewer)
    row = next(m for m in pending.json()["measurements"] if m["import_batch_ref"] == batch)
    assert row["quality_status"] == "pending"
    assert row["verification_status"] == "unverified"


def test_batch_acceptance_fails_atomically_when_any_instrument_is_uncalibrated(client, world):
    member = login(client, "o1m@t.dz")
    reviewer = login(client, "o1r@t.dz")
    project = make_project(client, member, "Calibration batch")
    instrument = client.post("/api/instruments", headers=member, json={
        "type": "flow_meter",
        "serial_number": "BATCH-NO-CAL",
    })
    assert instrument.status_code == 201, instrument.text
    instrument_id = instrument.json()["id"]
    batch = "UNCALIBRATED-BATCH"
    import_rows(client, member, project["id"], batch, [
        measurement_row(parameter="flow_rate", value=2.3, unit="L/s",
                        source="FLOW-1", instrument_id=instrument_id),
        measurement_row(parameter="ph", value=7.3, unit="pH", source="LAB-2"),
    ])

    rejected = review_batch(client, reviewer, project["id"], batch, "accepted")
    assert rejected.status_code == 409, rejected.text
    assert rejected.json()["detail"]["code"] == "CALIBRATION_REQUIRED"

    rows = client.get(f"/api/projects/{project['id']}/measurements", headers=member).json()
    batch_rows = [m for m in rows if m["import_batch_ref"] == batch]
    assert len(batch_rows) == 2
    assert {m["quality_status"] for m in batch_rows} == {"pending"}
    assert {m["verification_status"] for m in batch_rows} == {"unverified"}

    # Rejection is allowed without claiming metrological validity.
    rejected_batch = review_batch(client, reviewer, project["id"], batch, "rejected")
    assert rejected_batch.status_code == 201, rejected_batch.text
    rows = client.get(f"/api/projects/{project['id']}/measurements", headers=member).json()
    batch_rows = [m for m in rows if m["import_batch_ref"] == batch]
    assert {m["quality_status"] for m in batch_rows} == {"rejected"}
    assert {m["verification_status"] for m in batch_rows} == {"rejected"}
