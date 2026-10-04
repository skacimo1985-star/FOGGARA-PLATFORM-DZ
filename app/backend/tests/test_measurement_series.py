"""Security, provenance and numerical boundaries of measurement analytics."""
import csv
import io
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.models import AuditLog, Measurement
from app.routers.analytics import spreadsheet_text
from tests.conftest import login
from tests.test_acceptance import make_project

NOW = datetime.now(timezone.utc)


def insert(db, world, project, **overrides):
    data = dict(org_id=world["org1"].id, project_id=project["id"], parameter="flow_rate",
                value=2, unit="L/s", measured_at=NOW - timedelta(hours=1), source="field",
                method="meter", quality_status="validated", verification_status="verified",
                is_demo=False, submitted_by=world["o1_member"].id)
    data.update(overrides)
    row = Measurement(**data)
    db.add(row)
    db.flush()
    return row


def url(project, suffix="", **filters):
    from urllib.parse import urlencode
    query = dict(parameter="flow_rate", unit="L/s", window_to=NOW.isoformat())
    query.update(filters)
    return f"/api/projects/{project['id']}/measurement-series{suffix}?{urlencode(query)}"


def test_default_excludes_demo_rejected_pending_other_units_and_orgs(client, world, db):
    h = login(client, "o1m@t.dz")
    p = make_project(client, h)
    good = insert(db, world, p, value=2)
    insert(db, world, p, value=10)
    insert(db, world, p, value=200, is_demo=True)
    insert(db, world, p, value=300, quality_status="rejected")
    insert(db, world, p, value=400, quality_status="pending", verification_status="unverified")
    insert(db, world, p, value=36, unit="m3/h")
    insert(db, world, p, value=500, org_id=world["org2"].id)
    db.commit()
    r = client.get(url(p), headers=h)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["summary"] == {"count": 2, "minimum": 2, "maximum": 10, "average": 6}
    assert data["total"] == 2 and data["truncated"] is False
    assert good.id in [m["id"] for m in data["items"]]
    assert all(m["measured_at"].endswith("Z") for m in data["items"])
    other = client.get(url(p, unit="m3/h"), headers=h).json()
    assert other["summary"]["average"] == 36 and other["total"] == 1


def test_authentication_and_tenant_isolation_apply_to_json_and_csv(client, world):
    owner = login(client, "o1m@t.dz")
    outsider = login(client, "o2m@t.dz")
    p = make_project(client, owner)
    for suffix in ("", "/export.csv"):
        assert client.get(url(p, suffix)).status_code == 401
        assert client.get(url(p, suffix), headers=outsider).status_code == 404


def test_window_boundaries_alias_and_latest_sample_summary(client, world, db):
    h = login(client, "o1m@t.dz")
    p = make_project(client, h)
    insert(db, world, p, value=1, measured_at=NOW - timedelta(days=7), unit="l/s")
    insert(db, world, p, value=3, measured_at=NOW)
    last = insert(db, world, p, value=5, measured_at=NOW)
    insert(db, world, p, value=99, measured_at=NOW - timedelta(days=7, microseconds=1))
    insert(db, world, p, value=99, measured_at=NOW + timedelta(microseconds=1))
    db.commit()
    data = client.get(url(p, days=7, limit=1), headers=h).json()
    assert data["total"] == 3 and data["truncated"] is True
    assert len(data["items"]) == 1 and data["items"][0]["id"] == last.id
    assert data["summary"]["average"] == 3


def test_unreviewed_and_demo_are_explicit_opt_ins(client, world, db):
    h = login(client, "o1m@t.dz")
    p = make_project(client, h)
    insert(db, world, p, quality_status="pending", verification_status="unverified")
    insert(db, world, p, value=4, is_demo=True)
    insert(db, world, p, value=999, quality_status="rejected")
    db.commit()
    data = client.get(url(p, quality="all", include_demo="true"), headers=h).json()
    assert data["total"] == 2 and data["include_demo"] is True and data["quality"] == "all"
    assert data["summary"]["average"] == 3
    pending = client.get(url(p, quality="pending"), headers=h).json()
    assert pending["total"] == 1 and pending["items"][0]["verification_status"] == "unverified"


@pytest.mark.parametrize("filters", [dict(limit=0), dict(limit=1001), dict(days=0), dict(days=367),
    dict(unit="kg"), dict(quality="rejected"), dict(parameter="'; DROP TABLE measurements;--"),
    dict(window_to="2026-10-04T12:00:00")])
def test_invalid_or_unbounded_filters_rejected(client, world, filters):
    h = login(client, "o1m@t.dz")
    p = make_project(client, h)
    assert client.get(url(p, **filters), headers=h).status_code == 422


def test_csv_is_bounded_audited_and_formula_safe(client, world, db):
    h = login(client, "o1m@t.dz")
    p = make_project(client, h)
    insert(db, world, p, source='  =HYPERLINK("https://example.org")', method="\t+1", value=2)
    insert(db, world, p, source="normal,quoted", value=4)
    db.commit()
    response = client.get(url(p, "/export.csv", limit=1), headers=h)
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"
    rows = list(csv.DictReader(io.StringIO(response.content.decode("utf-8-sig"))))
    assert len(rows) == 1 and rows[0]["matching_total"] == "2" and rows[0]["truncated"] == "True"
    record = db.scalar(select(AuditLog).where(AuditLog.action == "export", AuditLog.project_id == p["id"]))
    assert record is not None and record.org_id == world["org1"].id
    response = client.get(url(p, "/export.csv", limit=10), headers=h)
    rows = list(csv.DictReader(io.StringIO(response.content.decode("utf-8-sig"))))
    assert rows[0]["source"].startswith("'") and rows[0]["method"].startswith("'")
    assert rows[1]["source"] == "normal,quoted"


@pytest.mark.parametrize("text", ["=1+1", " +CMD", "-CMD", "@SUM(A1)", "\ufeff=1", "\nplain"])
def test_spreadsheet_formula_prefixes_neutralized(text):
    assert spreadsheet_text(text).startswith("'")
