"""Regression tests for canonical national references and production initialization."""
import json
from pathlib import Path

from sqlalchemy import func, select

from app.models import Indicator, Organization, Service, User
from app.services.catalog import CATALOG, CATALOG_PROVIDER
from app.services.indicators import INDICATOR_CODE
from app.services.reference_data import ensure_reference_data
from app.wilayas import WILAYAS


def test_canonical_wilaya_registry_matches_runtime_adapter():
    registry_path = Path(__file__).resolve().parents[2] / "reference" / "wilayas.json"
    data = json.loads(registry_path.read_text(encoding="utf-8"))

    assert data == WILAYAS
    assert len(data) == 69
    assert {row["code"] for row in data} == {f"{i:02d}" for i in range(1, 70)}
    assert len({row["ar"] for row in data}) == 69
    assert len({row["fr"] for row in data}) == 69
    assert len({row["en"] for row in data}) == 69


def test_reference_initializer_is_idempotent_and_tenant_free(db):
    assert db.scalar(select(func.count(Organization.id))) == 0
    assert db.scalar(select(func.count(User.id))) == 0

    first = ensure_reference_data(db)
    db.commit()

    service_count = db.scalar(
        select(func.count(Service.id)).where(
            Service.provider == CATALOG_PROVIDER,
            Service.is_demo.is_(False),
        )
    )
    indicator_count = db.scalar(
        select(func.count(Indicator.id)).where(Indicator.code == INDICATOR_CODE)
    )

    second = ensure_reference_data(db)
    db.commit()

    assert first == {"services": len(CATALOG), "indicators": 1}
    assert second == {"services": 0, "indicators": 0}
    assert service_count == len(CATALOG)
    assert indicator_count == 1
    assert db.scalar(select(func.count(Organization.id))) == 0
    assert db.scalar(select(func.count(User.id))) == 0
