"""Production-container HTTP checks against isolated GitHub Actions infrastructure."""
import json
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
        assert status == expected, (path, status, expected)
        return json.loads(content) if content else None

    call("/auth/me", 401)
    credentials = {"email": "production-qa@example.invalid", "full_name": "Production QA",
                   "password": secrets.token_urlsafe(32)}
    call("/setup/bootstrap", 403, body=credentials, headers={"X-Setup-Key": "invalid"})
    setup = {"X-Setup-Key": os.environ["SETUP_KEY"]}
    call("/setup/bootstrap", 201, body=credentials, headers=setup)
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
    page = call("/projects?page_size=12", headers=headers)
    assert any(item["id"] == project["id"] for item in page["items"])
    call("/projects/" + str(project["id"]), headers=headers)
    print("Production HTTP checks passed: bootstrap closure, login, authorization, 14 modules, persisted project")

if __name__ == "__main__":
    main()
