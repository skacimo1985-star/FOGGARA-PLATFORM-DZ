"""Optional isolated backend release gate for deployment verification.

Runs only when explicitly invoked. It never points pytest at the service database.
"""
from __future__ import annotations

import os
from pathlib import Path
import secrets
import subprocess
import sys

FOCUSED_TESTS = (
    "tests/test_service_delivery_analysis.py",
    "tests/test_agriculture_operations.py",
    "tests/test_gis_infrastructure.py",
    "tests/test_gis_iot_bindings.py",
    "tests/test_telemetry_simulator.py",
    "tests/test_system_readiness.py",
)


def _sqlite_url(path: Path) -> str:
    return "sqlite+pysqlite:///" + path.resolve().as_posix()


def run_release_gate() -> None:
    backend_root = Path(__file__).resolve().parents[1]
    db_path = backend_root / ".release-gate.sqlite3"
    transient_paths = (
        db_path,
        Path(str(db_path) + "-journal"),
        Path(str(db_path) + "-shm"),
        Path(str(db_path) + "-wal"),
    )
    for path in transient_paths:
        path.unlink(missing_ok=True)

    env = os.environ.copy()
    test_database_url = _sqlite_url(db_path)
    env.update({
        "ENV": "dev",
        "DATABASE_URL": test_database_url,
        "TEST_DATABASE_URL": test_database_url,
        "JWT_SECRET": secrets.token_urlsafe(48),
        "SETUP_KEY": secrets.token_urlsafe(36),
        "SEED_DEMO": "false",
    })

    command = [
        sys.executable,
        "-m",
        "pytest",
        *FOCUSED_TESTS,
        "-q",
        "-ra",
        "--tb=short",
    ]
    print(f"Release gate: running {len(FOCUSED_TESTS)} isolated backend suites.")
    try:
        subprocess.run(command, cwd=backend_root, env=env, check=True)
    finally:
        for path in transient_paths:
            path.unlink(missing_ok=True)
    print("Release gate: focused backend regression passed.")
