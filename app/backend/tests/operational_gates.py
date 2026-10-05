"""Recovery and concurrent HTTP gates. Run only against disposable CI PostgreSQL.

Creates isolated databases, never connects to a deployed site, never uploads
database backups, and stores only aggregate timings/counts in the QA artifact.
"""
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import tempfile
import time

import httpx
import psycopg
from psycopg import sql

from scripts.postgres_recovery import backup, connection_settings, restore


@contextmanager
def api_server(database_url, directory):
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    environment = dict(os.environ, DATABASE_URL=database_url,
                       JWT_SECRET=secrets.token_urlsafe(48), SETUP_KEY=secrets.token_urlsafe(32),
                       OPERATIONS_AUTOMATION_ENABLED="false", SEED_DEMO="false", ENV="prod")
    origin = f"http://127.0.0.1:{port}"
    with (directory / (str(port) + ".log")).open("w") as stream:
        process = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app",
                                    "--host", "127.0.0.1", "--port", str(port)],
                                   env=environment, stdout=stream, stderr=stream)
        try:
            for attempt in range(100):
                if process.poll() is not None:
                    raise RuntimeError("Disposable API exited before health check")
                try:
                    response = httpx.get(origin + "/api/health", timeout=2)
                    if response.status_code == 200:
                        break
                except httpx.HTTPError:
                    pass
                time.sleep(0.1)
            else:
                raise RuntimeError("Disposable API did not become healthy")
            yield origin, environment["SETUP_KEY"]
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


def call(client, method, path, expected=200, **kwargs):
    response = client.request(method, path, **kwargs)
    assert response.status_code == expected, (path, response.status_code, expected)
    return response.json()


def populate_and_check(database_url, directory, credentials=None, project_ids=None):
    with api_server(database_url, directory) as (origin, key), httpx.Client(base_url=origin, timeout=10) as client:
        if credentials is None:
            password = secrets.token_urlsafe(24)
            credentials = [{"email": "restore-a@example.invalid", "password": password},
                           {"email": "restore-b@example.invalid", "password": password}]
            call(client, "POST", "/api/setup/bootstrap", 201,
                 json={**credentials[0], "full_name": "Recovery A"}, headers={"X-Setup-Key": key})
            call(client, "POST", "/api/auth/register", 201,
                 json={**credentials[1], "full_name": "Recovery B", "organization_name": "Recovery B"})
        sessions = [call(client, "POST", "/api/auth/login", json=item) for item in credentials]
        headers = [{"Authorization": "Bearer " + session["token"]} for session in sessions]
        if project_ids is None:
            project_ids = [call(client, "POST", "/api/projects", 201, json={"title": "Recovery " + str(i), "domain": "water"}, headers=header)["id"]
                           for i, header in enumerate(headers)]
        for i, header in enumerate(headers):
            call(client, "GET", "/api/projects/" + str(project_ids[i]), headers=header)
            call(client, "GET", "/api/projects/" + str(project_ids[1-i]), 404, headers=header)
        # Restored records can accept new authorized writes, including audit rows.
        call(client, "POST", "/api/projects", 201, json={"title": "Recovery write", "domain": "energy"}, headers=headers[0])
        return credentials, project_ids


def percentile(values, fraction):
    ordered = sorted(values)
    return round(ordered[min(len(ordered)-1, int((len(ordered)-1)*fraction))], 2)


def load_gate(database_url, directory):
    with api_server(database_url, directory) as (origin, _), httpx.Client(base_url=origin, timeout=10,
                                                                        limits=httpx.Limits(max_connections=48)) as client:
        assert call(client, "GET", "/api/health")["db"] == "up"
        def login_attempt(_):
            started = time.perf_counter()
            response = client.post("/api/auth/login", json={"email": "missing@example.invalid", "password": "invalid"})
            assert response.status_code in (401, 429, 503), response.status_code
            if response.status_code in (429, 503):
                assert int(response.headers["Retry-After"]) > 0
            return response.status_code, (time.perf_counter()-started)*1000
        def health_attempt(_):
            started = time.perf_counter()
            response = client.get("/api/health")
            assert response.status_code == 200 and response.json()["db"] == "up"
            return (time.perf_counter()-started)*1000
        with ThreadPoolExecutor(max_workers=32) as auth_pool, ThreadPoolExecutor(max_workers=8) as health_pool:
            auth_futures = [auth_pool.submit(login_attempt, i) for i in range(96)]
            health_futures = [health_pool.submit(health_attempt, i) for i in range(24)]
            logins = [future.result() for future in auth_futures]
            health = [future.result() for future in health_futures]
        counts = Counter(status for status, _ in logins)
        assert counts[401] > 0 and counts[429] + counts[503] > 0
        assert max(health) < 10000, "Health was blocked by credential work"
        registrations = []
        for i in range(8):
            response = client.post("/api/auth/register", json={"email": f"burst{i}@example.invalid",
                "password": secrets.token_urlsafe(24), "full_name": "Burst QA", "organization_name": "Burst QA"})
            assert response.status_code in (201, 429)
            registrations.append(response.status_code)
        assert registrations.count(201) == 5 and registrations.count(429) == 3
        assert client.get("/api/health").status_code == 200
        report = {"login_requests": len(logins), "login_concurrency": 32,
                  "login_status_counts": dict(counts), "login_p95_ms": percentile([ms for _, ms in logins], .95),
                  "health_requests": len(health), "health_p95_ms": percentile(health, .95),
                  "health_max_ms": round(max(health), 2), "registration_status_counts": dict(Counter(registrations))}
    # A new process retains the database-backed signup limit (not just RAM).
    with api_server(database_url, directory) as (origin, _), httpx.Client(base_url=origin, timeout=10) as client:
        response = client.post("/api/auth/register", json={"email": "after-restart@example.invalid",
            "password": secrets.token_urlsafe(24), "full_name": "Restart QA", "organization_name": "Restart QA"})
        assert response.status_code == 429
        report["signup_limit_survives_restart"] = True
    return report


def main():
    original = os.environ.get("DATABASE_URL", "")
    if os.environ.get("CI") != "true" or "localhost:5432/foggara_migration" not in original:
        raise RuntimeError("Requires the disposable GitHub Actions PostgreSQL service")
    settings = connection_settings(original)
    settings["dbname"] = "postgres"
    suffix = secrets.token_hex(4)
    names = ["foggara_qa_" + purpose + "_" + suffix for purpose in ("source", "restored", "load")]
    output = Path("qa")
    output.mkdir(exist_ok=True)
    result = {"scope": "Disposable CI data and CI capacity; no deployed-site load or production recovery claim"}
    with psycopg.connect(**settings, autocommit=True) as admin, tempfile.TemporaryDirectory() as temporary:
        private = Path(temporary)
        try:
            for name in names:
                admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
            urls = ["postgresql+psycopg://postgres:postgres@localhost:5432/" + name for name in names]
            for url in (urls[0], urls[2]):
                subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"],
                               env=dict(os.environ, DATABASE_URL=url), check=True)
            credentials, ids = populate_and_check(urls[0], private)
            archive = backup(urls[0], private)
            result["recovery"] = restore(urls[1], archive, "an20261004m1")
            populate_and_check(urls[1], private, credentials, ids)
            result["recovery"]["http_login_write_tenant_isolation"] = True
            try:
                restore(urls[1], archive, "an20261004m1")
            except RuntimeError:
                result["recovery"]["nonempty_target_refused"] = True
            else:
                raise AssertionError("Nonempty target accepted")
            result["load"] = load_gate(urls[2], private)
            (output / "operational-gates.json").write_text(json.dumps(result, indent=2))
            print(json.dumps(result, indent=2))
        finally:
            # Names are generated solely for this run, never supplied by operators.
            for name in names:
                admin.execute(sql.SQL("DROP DATABASE IF EXISTS {} WITH (FORCE)").format(sql.Identifier(name)))


if __name__ == "__main__":
    main()
