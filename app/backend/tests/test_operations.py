from datetime import datetime, timezone, timedelta
import pytest
from sqlalchemy import select
from .conftest import login
from app.models import Project
from app.operations_models import ContactTicket, MatrixObservation, MatrixJob
from app.operations_engine import evaluate, lock_org
from app.operations_worker import process_one

BASE = "/api/operations"

@pytest.fixture()
def ops(client, db, world):
    world["o1_reviewer"].role = "admin"
    p = Project(org_id=world["org1"].id, title="Oasis production", domain="water",
                created_by=world["o1_member"].id)
    db.add(p)
    db.commit()
    return {
        "project": p.id,
        "member": login(client, world["o1_member"].email),
        "admin": login(client, world["o1_reviewer"].email),
        "foreign": login(client, world["o2_reviewer"].email),
    }

def policy(client, ops):
    rules = {d: {"metric": d + "-index", "unit": "%", "lower": 0, "upper": 100, "direction": "higher",
        "weight": 0.2, "max_age_hours": 24} for d in ["water", "energy", "food", "ecosystem", "health"]}
    r = client.post(BASE + "/policies", headers=ops["admin"], json={"name": "Test policy", "rules": rules})
    assert r.status_code == 201, r.text
    pid = r.json()["id"]
    assert client.post(f"{BASE}/policies/{pid}/activate", headers=ops["admin"]).status_code == 200
    return rules

def observation(client, ops, domain="water", age=0):
    r = client.post(BASE + "/observations", headers=ops["member"], json={
        "project_id": ops["project"], "domain": domain, "metric": domain + "-index", "unit": "%", "value": 80,
        "source": "Field report test", "measured_at": (datetime.now(timezone.utc) - timedelta(hours=age)).isoformat()})
    assert r.status_code == 201, r.text
    return r.json()["id"]

def approve(client, ops, oid):
    r = client.post(f"{BASE}/observations/{oid}/review", headers=ops["admin"],
                    json={"status": "approved", "note": "Source checked"})
    assert r.status_code == 200, r.text

def test_incomplete_freshness_snapshot_and_isolation(client, db, ops, world):
    policy(client, ops)
    oid = observation(client, ops)
    assert client.post(f"{BASE}/observations/{oid}/review", headers=ops["foreign"],
        json={"status": "approved", "note": "Checked"}).status_code == 404
    approve(client, ops, oid)
    path = f"{BASE}/projects/{ops['project']}/evaluate"
    r = client.post(path, headers=ops["member"])
    assert r.status_code == 200, r.text
    assert r.json()["result"]["score"] is None
    assert r.json()["result"]["coverage"] == 0.2
    assert client.post(path, headers=ops["foreign"]).status_code == 404
    for d in ["energy", "food", "ecosystem", "health"]:
        approve(client, ops, observation(client, ops, d))
    r = client.post(path, headers=ops["member"])
    assert r.json()["result"]["score"] == 80
    assert client.post(path, headers=ops["member"]).json()["id"] == r.json()["id"]
    assert client.get(BASE + "/observations", headers=ops["foreign"]).json()["total"] == 0
    lock_org(db, world["org1"].id)
    stale = evaluate(db, world["org1"].id, ops["project"], datetime.now(timezone.utc) + timedelta(hours=25))
    assert stale.result["score"] is None
    assert stale.result["coverage"] == 0
    db.rollback()

def test_policies_validation_and_reviewer_separation(client, db, ops, world):
    rules = policy(client, ops)
    rules["water"]["upper"] = 0
    r = client.post(BASE + "/policies", headers=ops["admin"], json={"name": "Bad rules", "rules": rules})
    assert r.status_code == 422, r.text
    assert "input" not in str(r.json())
    assert client.post(BASE + "/policies", headers=ops["member"], json={
        "name": "Bad role", "rules": {d: dict(x, upper=100) for d, x in rules.items()}
    }).status_code == 403
    world["o1_member"].role = "reviewer"
    db.commit()
    oid = observation(client, ops)
    assert client.post(f"{BASE}/observations/{oid}/review", headers=ops["member"],
        json={"status": "approved", "note": "My own data"}).status_code == 403

def test_worker_persists_results_and_retries(client, db, ops):
    policy(client, ops)
    approve(client, ops, observation(client, ops))
    assert process_one() == "completed"
    result = client.get(BASE + "/evaluations", headers=ops["member"]).json()
    assert result["total"] == 1
    p = db.get(Project, ops["project"])
    db.add(MatrixJob(org_id=p.org_id, kind="invalid"))
    db.commit()
    assert process_one() == "pending"
    assert process_one() == "pending"
    assert process_one() == "failed"
    assert process_one() is None

def listing(client, ops, kind, unit="kg"):
    r = client.post(BASE + "/listings", headers=ops["member"], json={
        "kind": kind, "sector": "agriculture", "title": "Dates production",
        "product_code": "dates-deglet", "quantity": 100, "unit": unit, "wilaya": "03"})
    assert r.status_code == 201, r.text
    return r.json()["id"]

def test_matching_units_tenant_close_and_idempotency(client, ops):
    offer = listing(client, ops, "offer")
    listing(client, ops, "demand")
    listing(client, ops, "demand", "t")
    for _ in range(2):
        r = client.post(BASE + "/match", headers=ops["member"])
        assert r.json()["suggestions"] == 1
        assert r.json()["binding"] is False
    assert client.get(BASE + "/matches", headers=ops["foreign"]).json()["total"] == 0
    assert client.get(BASE + "/matches", headers=ops["member"]).json()["total"] == 1
    assert client.post(f"{BASE}/listings/{offer}/close", headers=ops["foreign"]).status_code == 404
    assert client.post(f"{BASE}/listings/{offer}/close", headers=ops["member"]).status_code == 200
    assert client.get(BASE + "/matches", headers=ops["member"]).json()["total"] == 0

def test_lot_quality_gate_and_trace(client, ops):
    r = client.post(BASE + "/lots", headers=ops["member"], json={
        "project_id": ops["project"], "code": "FG-001", "product": "Dates",
        "sector": "agriculture", "quantity": 50, "unit": "kg"})
    assert r.status_code == 201, r.text
    path = f"{BASE}/lots/{r.json()['id']}/transition"
    assert client.post(path, headers=ops["member"], json={"stage": "ready", "note": "Skip"}).status_code == 409
    for stage in ["processing", "quality_review"]:
        assert client.post(path, headers=ops["member"], json={"stage": stage, "note": "Checked source"}).status_code == 200
    assert client.post(path, headers=ops["member"], json={"stage": "ready", "note": "Checked source"}).status_code == 403
    assert client.post(path, headers=ops["foreign"], json={"stage": "ready", "note": "Checked source"}).status_code == 404
    r = client.post(path, headers=ops["admin"], json={"stage": "ready", "note": "Quality report checked"})
    assert r.status_code == 200, r.text
    assert len(r.json()["trace"]) == 4

def test_contact_consent_privacy_and_operator_scope(client, db, ops, monkeypatch):
    data = {"name": "Test user", "email": "person@example.org", "subject": "Partnership",
            "message": "Discuss oasis development", "consent": True}
    assert client.post(BASE + "/contact", json=dict(data, consent=False)).status_code == 422
    r = client.post(BASE + "/contact", json=data)
    assert r.status_code == 201
    assert r.json()["email_sent"] is False
    assert db.scalar(select(ContactTicket.reference)) == r.json()["reference"]
    assert client.get(BASE + "/contacts", headers=ops["admin"]).status_code == 403
    monkeypatch.setenv("CONTACT_ORG_CODE", "T-ORG1")
    assert client.get(BASE + "/contacts", headers=ops["admin"]).json()["total"] == 1
    r = client.post(BASE + "/privacy", headers=ops["member"], json={"kind": "access", "note": "My personal data"})
    assert r.status_code == 201
    assert client.get(BASE + "/privacy", headers=ops["foreign"]).json()["total"] == 0
    path = f"{BASE}/privacy/{r.json()['id']}/resolve"
    assert client.post(path, headers=ops["member"], json={"response": "Request processed"}).status_code == 403
    assert client.post(path, headers=ops["admin"], json={"response": "Identity verified and response provided"}).status_code == 200


def test_team_scoping_password_redaction_and_token_revocation(client, ops):
    account = {"email": "new@example.org", "full_name": "New member",
               "password": "Fresh-secret-928!", "role": "reviewer"}
    assert client.post(BASE + "/team", headers=ops["member"], json=account).status_code == 403
    r = client.post(BASE + "/team", headers=ops["admin"], json=account)
    assert r.status_code == 201, r.text
    assert "password" not in r.text
    assert r.json()["role"] == "reviewer"
    assert client.post(BASE + "/team", headers=ops["admin"], json=account).status_code == 409
    r = client.post(BASE + "/password", headers=ops["member"],
                    json={"current_password":"pass#1","new_password":"Changed-secret-928!"})
    assert r.status_code == 200, r.text
    assert client.get("/api/auth/me", headers=ops["member"]).status_code == 401
    r = client.post("/api/auth/login", json={"email":"o1m@t.dz","password":"Changed-secret-928!"})
    assert r.status_code == 200
    assert client.get("/api/auth/me", headers={"Authorization":"Bearer "+r.json()["token"]}).status_code == 200


def test_different_metrics_in_same_domain_are_not_mixed(client, ops):
    policy(client, ops)
    r = client.post(BASE + "/observations", headers=ops["member"], json={
        "project_id": ops["project"], "domain": "water", "metric": "different-water-indicator",
        "unit": "%", "value": 95, "source": "Other valid but unrelated indicator",
        "measured_at": (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()})
    assert r.status_code == 201
    approve(client, ops, r.json()["id"])
    r = client.post(f"{BASE}/projects/{ops['project']}/evaluate", headers=ops["member"])
    assert r.status_code == 200
    assert r.json()["result"]["coverage"] == 0
    assert "water" in r.json()["result"]["missing"]
