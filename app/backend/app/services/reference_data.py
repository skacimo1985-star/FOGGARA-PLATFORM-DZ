"""Production reference initialization independent of synthetic demo seeding."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Indicator
from .catalog import ensure_service_catalog
from .indicators import INDICATOR_CODE, ensure_default_indicator


def ensure_reference_data(db: Session) -> dict[str, int]:
    """Ensure authored global references without creating tenant/demo business rows.

    The caller owns the transaction. Running this repeatedly is idempotent.
    """
    services_created = ensure_service_catalog(db)
    indicator_existed = db.scalar(
        select(Indicator.id).where(Indicator.code == INDICATOR_CODE)
    ) is not None
    ensure_default_indicator(db)
    return {
        "services": services_created,
        "indicators": 0 if indicator_existed else 1,
    }
