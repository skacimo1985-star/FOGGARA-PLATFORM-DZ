import hashlib
import json

import pytest

from app.admin_importer import AdministrativeImportError, import_administrative_json
from app.gis_models import Commune, Daira, Wilaya


def _payload(*, verified=False):
    return {
        "metadata": {
            "version_code": "DZ-OFFICIAL-TEST-1",
            "title": "Official test hierarchy",
            "valid_from": "2026-04-05",
            "source_title": "Official source",
            "source_uri": "https://interieur.gov.dz/example",
            "source_date": "2026-04-05",
            "verified": verified,
        },
        "wilayas": [
            {
                "reference_key": "laghouat",
                "official_code": "03",
                "name_ar": "الأغواط",
                "name_fr": "Laghouat",
                "name_en": "Laghouat",
            }
        ],
        "dairas": [
            {
                "reference_key": "laghouat-daira",
                "wilaya_key": "laghouat",
                "official_code": None,
                "name_ar": "دائرة الأغواط",
                "name_fr": "Laghouat",
                "name_en": "Laghouat",
            }
        ],
        "communes": [
            {
                "reference_key": "laghouat-commune",
                "wilaya_key": "laghouat",
                "daira_key": "laghouat-daira",
                "official_code": "0301",
                "name_ar": "الأغواط",
                "name_fr": "Laghouat",
                "name_en": "Laghouat",
            }
        ],
    }


def _raw(payload):
    return json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")


def test_import_requires_matching_checksum(db):
    raw = _raw(_payload())
    with pytest.raises(AdministrativeImportError, match="SHA-256 mismatch"):
        import_administrative_json(db, raw, expected_sha256="0" * 64)


def test_verified_import_requires_explicit_operator_approval(db):
    raw = _raw(_payload(verified=True))
    digest = hashlib.sha256(raw).hexdigest()
    with pytest.raises(AdministrativeImportError, match="explicit operator approval"):
        import_administrative_json(db, raw, expected_sha256=digest)


def test_import_validates_parent_hierarchy(db):
    payload = _payload()
    payload["communes"][0]["wilaya_key"] = "unknown"
    raw = _raw(payload)
    digest = hashlib.sha256(raw).hexdigest()
    with pytest.raises(AdministrativeImportError, match="unknown wilaya"):
        import_administrative_json(db, raw, expected_sha256=digest)


def test_import_is_idempotent_and_version_is_immutable(db):
    raw = _raw(_payload())
    digest = hashlib.sha256(raw).hexdigest()
    version = import_administrative_json(db, raw, expected_sha256=digest)
    db.commit()

    assert db.query(Wilaya).filter(Wilaya.version_id == version.id).count() == 1
    assert db.query(Daira).filter(Daira.version_id == version.id).count() == 1
    assert db.query(Commune).filter(Commune.version_id == version.id).count() == 1

    same = import_administrative_json(db, raw, expected_sha256=digest)
    assert same.id == version.id
    assert db.query(Wilaya).filter(Wilaya.version_id == version.id).count() == 1

    changed = _payload()
    changed["metadata"]["title"] = "Changed source content"
    changed_raw = _raw(changed)
    changed_digest = hashlib.sha256(changed_raw).hexdigest()
    with pytest.raises(AdministrativeImportError, match="different source checksum"):
        import_administrative_json(db, changed_raw, expected_sha256=changed_digest)


def test_complete_2026_mode_refuses_partial_dataset(db):
    raw = _raw(_payload(verified=True))
    digest = hashlib.sha256(raw).hexdigest()
    with pytest.raises(AdministrativeImportError, match="exactly 69 wilayas"):
        import_administrative_json(
            db,
            raw,
            expected_sha256=digest,
            allow_verified=True,
            require_complete_2026=True,
        )
