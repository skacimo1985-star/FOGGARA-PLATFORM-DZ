"""Illustrative API response evaluation without any network calls."""

import json


def check_response(*, status, expected_status, body, required_keys=(), elapsed_ms=None):
    errors = []
    if status != expected_status:
        errors.append(f"Expected HTTP {expected_status}, observed {status}")
    try:
        parsed = json.loads(body)
    except (json.JSONDecodeError, TypeError):
        parsed = None
        if required_keys:
            errors.append("Body is not valid JSON")
    if required_keys and isinstance(parsed, dict):
        missing = [k for k in required_keys if k not in parsed]
        if missing:
            errors.append("Missing JSON keys: " + ", ".join(missing))
    elif required_keys and parsed is not None:
        errors.append("JSON body must be an object")
    if elapsed_ms is not None and elapsed_ms < 0:
        errors.append("Elapsed time cannot be negative")
    return {"passed": not errors, "expected_status": expected_status,
            "observed_status": status, "elapsed_ms": elapsed_ms, "errors": errors}
