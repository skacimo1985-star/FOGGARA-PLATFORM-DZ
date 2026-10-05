"""Production-container HTTP checks against isolated GitHub Actions infrastructure."""
import json
from concurrent.futures import ThreadPoolExecutor
import os
import secrets
import urllib.error
import urllib.request

def main():
    if os.environ.get("CI") != "true":
        raise RuntimeError("Only run against the disposable CI production stack")
    base = "http://127.0.0.1:8000/api"

    def call(path, expected=200, *, body=None, headers=None):
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(base + path, data=data,
            headers={"Content-Type": "application/json", **(headers or {})})
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                status, content = response.status, response.read()
        except urllib.error.HTTPError as response:
            status, content = response.code, response.read()
        assert status in (expected if isinstance(expected, tuple) else (expected,)), (path, status, expected)
        decoded = json.loads(content) if content else None
        return (status, decoded) if isinstance(expected, tuple) else decoded

    call("/auth/me", 401)
    credentials = {"email": "production-qa@example.invalid", "full_name": "Production QA",
                   "password": secrets.token_urlsafe(32)}
    call("/setup/bootstrap", 403, body=credentials, headers={"X-Setup-Key": "invalid"})
    setup = {"X-Setup-Key": os.environ["SETUP_KEY"]}
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda _: call("/setup/bootstrap", (201, 409), body=credentials, headers=setup), range(2)))
    assert sorted(status for status, _ in responses) == [201, 409]
    call("/setup/bootstrap", 409, body=credentials, headers=setup)
    session = call("/auth/login", body={"email": credentials["email"], "password": credentials["password"]})
    headers = {"Authorization": "Bearer " + session["token"]}
    assert call("/auth/me", headers=headers)["role"] == "admin"
    for path in ("/projects", "/org", "/sites", "/resources", "/assets", "/decisions",
                 "/telemetry/devices", "/simulator/runs", "/nexus/resources",
                 "/data-rooms", "/opportunities", "/agriculture/parcels",
                 "/operations/team", "/gis/sites"):
        call(path, headers=headers)
    project = call("/projects", 201, body={"title": "Production HTTP QA", "domain": "water"}, headers=headers)
    parcel = call("/agriculture/parcels", 201, body={
        "name": "Production Satellite QA", "crop": "wheat", "area_ha": 1.5,
        "location": "CI", "stage": "development"
    }, headers=headers)
    remote = call(f"/agriculture/parcels/{parcel['id']}/remote-sensing/ingest", 201, body={
        "provider": "ci_adapter", "scene_id": "CI-SCENE-001",
        "acquired_at": "2026-10-01T12:00:00Z",
        "ndvi": 0.61, "lswi": 0.14, "cloud_cover_pct": 6.0, "confidence": 0.9
    }, headers=headers)
    assert remote["provenance"] == "INFERRED" and remote["live_provider_connected"] is False
    assert len(remote["created"]) == 2
    history = call(f"/agriculture/parcels/{parcel['id']}/remote-sensing", headers=headers)
    assert history["adapter_contract"] == "provider_neutral"
    assert all(row["evidence_status"] == "INFERRED" for row in history["observations"])
    page = call("/projects?page_size=12", headers=headers)
    assert any(item["id"] == project["id"] for item in page["items"])
    call("/projects/" + str(project["id"]), headers=headers)
    print("Production HTTP checks passed: auth, modules, provider-neutral remote sensing, persisted project")

if __name__ == "__main__":
    main()
