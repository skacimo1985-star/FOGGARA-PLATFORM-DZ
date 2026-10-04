import json
from pathlib import Path
from sqlalchemy import select
from ..reference_models import NationalWilaya, ReferenceEntry
from ..wilayas import WILAYAS, VERSION, SOURCES


def ensure_reference_catalog(db):
    """Idempotent curated reference import; never inserts users or business facts."""
    for item in WILAYAS:
        row = db.get(NationalWilaya, item["code"])
        if row is None:
            row = NationalWilaya(code=item["code"])
            db.add(row)
        for key in ("ar", "fr", "en"):
            setattr(row, key, item[key])
        row.version, row.sources = VERSION, SOURCES
    path = Path(__file__).resolve().parents[3] / "reference" / "catalog.json"
    for item in json.loads(path.read_text()):
        row = db.get(ReferenceEntry, item["code"])
        if row is None:
            row = ReferenceEntry(code=item["code"])
            db.add(row)
        for key, value in item.items():
            setattr(row, key, value)
    db.flush()


def wilaya_rows(db):
    return [{"code": r.code, "ar": r.ar, "fr": r.fr, "en": r.en}
            for r in db.scalars(select(NationalWilaya).order_by(NationalWilaya.code))]
