from datetime import date

from app.admin_reference import WILAYAS_2026, ensure_2026_wilaya_reference
from app.gis_models import Wilaya


def test_2026_reference_contains_69_wilayas():
    assert len(WILAYAS_2026) == 69
    keys = [item[0] for item in WILAYAS_2026]
    assert len(keys) == len(set(keys))


def test_new_wilayas_have_no_invented_official_code():
    new_rows = [item for item in WILAYAS_2026 if item[5] == date(2027, 1, 1)]
    assert len(new_rows) == 11
    assert all(item[1] is None for item in new_rows)


def test_reference_seed_is_idempotent(db):
    version = ensure_2026_wilaya_reference(db)
    db.commit()
    first = db.query(Wilaya).filter(Wilaya.version_id == version.id).count()
    ensure_2026_wilaya_reference(db)
    db.commit()
    second = db.query(Wilaya).filter(Wilaya.version_id == version.id).count()
    assert first == second == 69
