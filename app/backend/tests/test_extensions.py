"""اختبارات التوسعة: مترولوجيا، خدمات، قرارات بشرية، توضيح، تحليلات شفافة، استكشاف، عزل."""
from datetime import datetime, timedelta, timezone

from tests.conftest import login
from tests.test_acceptance import NOW, add_evidence, add_measurement, make_project

FUTURE = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()
PAST = (datetime.now(timezone.utc) - timedelta(days=400)).isoformat()
RECENT = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
EXPIRED = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()


def make_instrument(client, headers, serial="SN-1"):
    r = client.post("/api/instruments", json={
        "type": "flow_meter", "serial_number": serial}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def add_calibration(client, headers, instrument_id, next_due=FUTURE, result="pass"):
    r = client.post(f"/api/instruments/{instrument_id}/calibrations", json={
        "calibrated_on": RECENT, "authority": "مخبر تجريبي",
        "result": result, "next_due": next_due}, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def add_instrument_measurement(client, headers, project_id, instrument_id, value=1.0):
    r = client.post("/api/measurements", json={
        "project_id": project_id, "parameter": "flow_rate", "value": value, "unit": "L/s",
        "measured_at": NOW, "source": "قراءة أداة", "method": "آلية",
        "source_type": "instrument", "instrument_id": instrument_id,
    }, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


def review_raw(client, headers, target_type, target_id, decision):
    return client.post("/api/reviews", json={
        "target_type": target_type, "target_id": target_id,
        "decision": decision, "note": "ملاحظة", "reason": "سبب"}, headers=headers)


# Placeholder — full file content will be pushed via push_files
