"""Strict importer for official Algerian administrative reference datasets.

The importer never downloads data and never upgrades trust implicitly.  A caller
must provide the source document, its expected SHA-256, and explicitly opt in to
verified mode.  This keeps community/cached datasets usable for staging without
misrepresenting them as official.
"""

from __future__ import annotations

import hashlib
import json
from datetime import date
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .gis_models import AdministrativeVersion, Commune, Daira, Wilaya


class AdministrativeImportError(ValueError):
    pass


def _required_text(value: Any, field: str, *, max_len: int = 255) -> str:
    if not isinstance(value, str) or not value.strip():
        raise AdministrativeImportError(f"{field} must be a non-empty string")
    result = value.strip()
    if len(result) > max_len:
        raise AdministrativeImportError(f"{field} exceeds {max_len} characters")
    return result


def _optional_text(value: Any, field: str, *, max_len: int = 255) -> str | None:
    if value is None:
        return None
    return _required_text(value, field, max_len=max_len)


def _iso_date(value: Any, field: str) -> date:
    raw = _required_text(value, field, max_len=10)
    try:
        return date.fromisoformat(raw)
    except ValueError as exc:
        raise AdministrativeImportError(f"{field} must be YYYY-MM-DD") from exc


def _rows(payload: dict[str, Any], key: str) -> list[dict[str, Any]]:
    value = payload.get(key)
    if not isinstance(value, list):
        raise AdministrativeImportError(f"{key} must be an array")
    if any(not isinstance(item, dict) for item in value):
        raise AdministrativeImportError(f"{key} entries must be objects")
    return value


def _unique_reference_keys(rows: list[dict[str, Any]], label: str, max_len: int) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for index, row in enumerate(rows):
        key = _required_text(row.get("reference_key"), f"{label}[{index}].reference_key", max_len=max_len)
        if key in result:
            raise AdministrativeImportError(f"duplicate {label} reference_key: {key}")
        result[key] = row
    return result


def _validate_names(row: dict[str, Any], label: str) -> tuple[str, str, str]:
    return (
        _required_text(row.get("name_ar"), f"{label}.name_ar", max_len=150),
        _required_text(row.get("name_fr"), f"{label}.name_fr", max_len=150),
        _required_text(row.get("name_en"), f"{label}.name_en", max_len=150),
    )


def import_administrative_json(
    db: Session,
    raw: bytes,
    *,
    expected_sha256: str,
    allow_verified: bool = False,
    require_complete_2026: bool = False,
) -> AdministrativeVersion:
    """Validate and atomically replace one administrative-version dataset.

    Geometry is deliberately excluded from this importer until a boundary source
    with explicit provenance/licensing is approved.  This importer handles the
    legal/administrative hierarchy only.
    """
    actual_sha256 = hashlib.sha256(raw).hexdigest()
    if actual_sha256.lower() != expected_sha256.lower():
        raise AdministrativeImportError("SHA-256 mismatch")

    try:
        payload = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise AdministrativeImportError("dataset must be valid UTF-8 JSON") from exc
    if not isinstance(payload, dict):
        raise AdministrativeImportError("dataset root must be an object")

    metadata = payload.get("metadata")
    if not isinstance(metadata, dict):
        raise AdministrativeImportError("metadata must be an object")

    version_code = _required_text(metadata.get("version_code"), "metadata.version_code", max_len=50)
    title = _required_text(metadata.get("title"), "metadata.title")
    valid_from = _iso_date(metadata.get("valid_from"), "metadata.valid_from")
    source_title = _required_text(metadata.get("source_title"), "metadata.source_title")
    source_uri = _required_text(metadata.get("source_uri"), "metadata.source_uri", max_len=2000)
    source_date = _iso_date(metadata.get("source_date"), "metadata.source_date")
    requested_verified = metadata.get("verified") is True
    if requested_verified and not allow_verified:
        raise AdministrativeImportError("verified import requires explicit operator approval")

    wilaya_rows = _rows(payload, "wilayas")
    daira_rows = _rows(payload, "dairas")
    commune_rows = _rows(payload, "communes")
    wilayas = _unique_reference_keys(wilaya_rows, "wilayas", 80)
    dairas = _unique_reference_keys(daira_rows, "dairas", 100)
    communes = _unique_reference_keys(commune_rows, "communes", 120)

    if require_complete_2026:
        if not requested_verified or not allow_verified:
            raise AdministrativeImportError("complete 2026 import must be explicitly verified")
        if len(wilayas) != 69:
            raise AdministrativeImportError("complete 2026 dataset must contain exactly 69 wilayas")
        if len(communes) != 1541:
            raise AdministrativeImportError("complete 2026 dataset must contain exactly 1541 communes")

    official_wilaya_codes: set[str] = set()
    for key, row in wilayas.items():
        _validate_names(row, f"wilayas[{key}]")
        code = _optional_text(row.get("official_code"), f"wilayas[{key}].official_code", max_len=20)
        if code:
            if code in official_wilaya_codes:
                raise AdministrativeImportError(f"duplicate wilaya official_code: {code}")
            official_wilaya_codes.add(code)

    for key, row in dairas.items():
        _validate_names(row, f"dairas[{key}]")
        parent = _required_text(row.get("wilaya_key"), f"dairas[{key}].wilaya_key", max_len=80)
        if parent not in wilayas:
            raise AdministrativeImportError(f"daira {key} references unknown wilaya {parent}")

    for key, row in communes.items():
        _validate_names(row, f"communes[{key}]")
        wilaya_key = _required_text(row.get("wilaya_key"), f"communes[{key}].wilaya_key", max_len=80)
        if wilaya_key not in wilayas:
            raise AdministrativeImportError(f"commune {key} references unknown wilaya {wilaya_key}")
        daira_key = _optional_text(row.get("daira_key"), f"communes[{key}].daira_key", max_len=100)
        if daira_key:
            daira = dairas.get(daira_key)
            if daira is None:
                raise AdministrativeImportError(f"commune {key} references unknown daira {daira_key}")
            if daira.get("wilaya_key") != wilaya_key:
                raise AdministrativeImportError(f"commune {key} daira/wilaya parent mismatch")

    version = db.scalar(select(AdministrativeVersion).where(AdministrativeVersion.code == version_code))
    if version is None:
        version = AdministrativeVersion(
            code=version_code,
            title=title,
            valid_from=valid_from,
            source_title=source_title,
            source_uri=source_uri,
            source_date=source_date,
            verified=requested_verified,
        )
        db.add(version)
        db.flush()
    else:
        version.title = title
        version.valid_from = valid_from
        version.source_title = source_title
        version.source_uri = source_uri
        version.source_date = source_date
        version.verified = requested_verified
        db.execute(delete(Commune).where(Commune.version_id == version.id))
        db.execute(delete(Daira).where(Daira.version_id == version.id))
        db.execute(delete(Wilaya).where(Wilaya.version_id == version.id))
        db.flush()

    wilaya_models: dict[str, Wilaya] = {}
    for key, row in wilayas.items():
        ar, fr, en = _validate_names(row, f"wilayas[{key}]")
        operational_from = row.get("operational_from")
        model = Wilaya(
            version_id=version.id,
            reference_key=key,
            official_code=_optional_text(row.get("official_code"), f"wilayas[{key}].official_code", max_len=20),
            operational_from=_iso_date(operational_from, f"wilayas[{key}].operational_from") if operational_from else None,
            name_ar=ar,
            name_fr=fr,
            name_en=en,
            source_uri=_optional_text(row.get("source_uri"), f"wilayas[{key}].source_uri", max_len=2000) or source_uri,
            verified=requested_verified,
        )
        db.add(model)
        db.flush()
        wilaya_models[key] = model

    daira_models: dict[str, Daira] = {}
    for key, row in dairas.items():
        ar, fr, en = _validate_names(row, f"dairas[{key}]")
        model = Daira(
            version_id=version.id,
            wilaya_id=wilaya_models[row["wilaya_key"]].id,
            reference_key=key,
            official_code=_optional_text(row.get("official_code"), f"dairas[{key}].official_code", max_len=30),
            name_ar=ar,
            name_fr=fr,
            name_en=en,
            source_uri=_optional_text(row.get("source_uri"), f"dairas[{key}].source_uri", max_len=2000) or source_uri,
            verified=requested_verified,
        )
        db.add(model)
        db.flush()
        daira_models[key] = model

    for key, row in communes.items():
        ar, fr, en = _validate_names(row, f"communes[{key}]")
        daira_key = row.get("daira_key")
        db.add(Commune(
            version_id=version.id,
            wilaya_id=wilaya_models[row["wilaya_key"]].id,
            daira_id=daira_models[daira_key].id if daira_key else None,
            reference_key=key,
            official_code=_optional_text(row.get("official_code"), f"communes[{key}].official_code", max_len=30),
            name_ar=ar,
            name_fr=fr,
            name_en=en,
            source_uri=_optional_text(row.get("source_uri"), f"communes[{key}].source_uri", max_len=2000) or source_uri,
            verified=requested_verified,
        ))

    db.flush()
    return version
