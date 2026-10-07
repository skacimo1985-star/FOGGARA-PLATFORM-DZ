"""Canonical Algerian wilaya registry shared with the web application.

The authored data lives in app/reference/wilayas.json so frontend and backend
cannot silently diverge. This module preserves the existing WILAYAS API.
"""
from __future__ import annotations

import json
from pathlib import Path

_REGISTRY_PATH = Path(__file__).resolve().parents[2] / "reference" / "wilayas.json"

with _REGISTRY_PATH.open("r", encoding="utf-8") as handle:
    WILAYAS: list[dict[str, str]] = json.load(handle)

if len(WILAYAS) != 69:
    raise RuntimeError(f"Expected 69 wilayas, found {len(WILAYAS)}")
if {row["code"] for row in WILAYAS} != {f"{i:02d}" for i in range(1, 70)}:
    raise RuntimeError("Canonical wilaya registry must contain unique codes 01..69")
