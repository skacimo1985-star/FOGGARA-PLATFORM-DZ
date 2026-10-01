"""Measurement validation catalog and water indicator computation.

Rules are explicit and auditable — no hidden heuristics.
"""
import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..deps import api_error
from ..models import Indicator, Measurement

# Input guardrails only; these ranges do not establish suitability or regulatory compliance.
# Pressure and flow are normalized before applying the software limits.
PARAMETERS: dict[str, tuple[set[str], float, float]] = {
    "flow_rate": ({"L/s", "l/s", "m3/h"}, 0.0, 100_000.0),
    "water_level": ({"m"}, -500.0, 10_000.0),
    "ph": ({"pH"}, 0.0, 14.0),
    "temperature": ({"°C", "C"}, -10.0, 80.0),
    "turbidity": ({"NTU"}, 0.0, 10_000.0),
    "pressure": ({"bar", "kPa"}, 0.0, 1_000.0),
    "humidity": ({"%RH"}, 0.0, 100.0),
    "electrical_power": ({"kW"}, 0.0, 100_000.0),
    "voltage": ({"V"}, 0.0, 100_000.0),
    "rainfall": ({"mm"}, 0.0, 2_000.0),
    "soil_moisture": ({"%"}, 0.0, 100.0),
    "dissolved_oxygen": ({"mg/L"}, 0.0, 30.0),
}

INDICATOR_CODE = "WATER_FLOW_AVG_LS"
MIN_MEASUREMENTS = 1

# مرادفات الوحدات: كل صيغة مقبولة في القاموس تُخزَّن بصيغتها القياسية،
# حتى لا يستبعد الحساب قيمة صالحة بسبب حالة الأحرف (اكتشفه test_unit_canonicalization).
CANONICAL_UNIT: dict[str, str] = {"l/s": "L/s", "C": "°C"}


def canonical_unit(parameter: str, unit: str) -> str:
    """الصيغة القياسية لوحدة اجتازت validate_measurement (تُستدعى بعدها فقط)."""
    return CANONICAL_UNIT.get(unit, unit)


def unit_aliases(parameter: str, canonical: str) -> set[str]:
    """كل المرادفات المقبولة التي صيغتها القياسية = canonical (لشمول السجلات القديمة)."""
    units = PARAMETERS[parameter][0]
    return {u for u in units if canonical_unit(parameter, u) == canonical}


def validate_measurement(parameter: str, value: float, unit: str):
    if not math.isfinite(value):
        api_error(422, "INVALID_VALUE", "Measurement value must be a finite number")
    spec = PARAMETERS.get(parameter)
    if spec is None:
        api_error(422, "INVALID_PARAMETER", f"Unknown parameter: {parameter}")
    units, vmin, vmax = spec
    if unit not in units:
        api_error(422, "INVALID_UNIT",
                  f"Unit '{unit}' is not valid for {parameter}; allowed: {', '.join(sorted(units))}")
    normalized = value / 100 if unit == "kPa" else value / 3.6 if unit == "m3/h" else value
    if not (vmin <= normalized <= vmax):
        api_error(422, "VALUE_OUT_OF_RANGE",
                  f"Value {value} outside configured software input range [{vmin}, {vmax}] for {parameter}")


def compute_flow_avg(db: Session, org_id: int, project_id: int,
                     window_from: datetime | None, window_to: datetime | None):
    """Average flow rate (L/s) from *validated* measurements only.

    Returns (value | None, unit, from, to, n, ids). None => insufficient data.
    """
    now = datetime.now(timezone.utc)
    wto = window_to or now
    wfrom = window_from or (wto - timedelta(days=30))

    q = select(Measurement).where(
        Measurement.org_id == org_id,
        Measurement.project_id == project_id,
        Measurement.parameter == "flow_rate",
        Measurement.unit.in_(unit_aliases("flow_rate", "L/s")),
        Measurement.quality_status == "validated",
        Measurement.measured_at >= wfrom,
        Measurement.measured_at <= wto,
    )
    rows = db.execute(q).scalars().all()
    ids = [m.id for m in rows]
    if len(rows) < MIN_MEASUREMENTS:
        return None, "L/s", wfrom, wto, 0, ids
    avg = float(sum(float(m.value) for m in rows) / len(rows))
    return round(avg, 4), "L/s", wfrom, wto, len(rows), ids


def build_recommendation(indicator: Indicator, value: float, n: int,
                         wfrom: datetime, wto: datetime, evidence_ids: list[int]):
    """Report the computed observation without inventing a suitability threshold."""
    basis = (f"indicator={indicator.code}; value={value} {indicator.unit}; "
             f"threshold=not_configured; n_validated={n}; "
             f"window={wfrom.isoformat()}..{wto.isoformat()}; evidence_ids={evidence_ids}")
    ar = (f"متوسط معدل التدفق {value} ل/ث، محسوب من {n} قياسات متحقق منها خلال الفترة المحددة. "
          "لم تُحدد قاعدة قبول خاصة بالمشروع؛ لا يثبت هذا المتوسط كفاية المورد أو سلامته. "
          "يلزم تقييم مختص وربط النتيجة بمتطلبات المشروع قبل اتخاذ إجراء.")
    fr = (f"Débit moyen : {value} L/s, calculé sur {n} mesures validées pour la période. "
          "Aucune règle d’acceptation propre au projet n’est configurée. Cette moyenne ne prouve "
          "ni la suffisance ni la sécurité de la ressource. Une évaluation technique est requise avant intervention.")
    en = (f"Average flow: {value} L/s, calculated from {n} validated measurements for the period. "
          "No project-specific acceptance rule is configured. This average does not establish resource "
          "sufficiency or safety. Technical review against project requirements is needed before action.")
    return basis, ar, fr, en


def ensure_default_indicator(db: Session) -> Indicator:
    ind = db.execute(select(Indicator).where(Indicator.code == INDICATOR_CODE)).scalar_one_or_none()
    if ind is None:
        ind = Indicator(
            code=INDICATOR_CODE,
            name_ar="متوسط معدل تدفق المورد المائي",
            name_fr="Débit moyen de la ressource en eau",
            name_en="Average water resource flow",
            formula="mean(value) des mesures flow_rate (L/s) validées sur une fenêtre glissante",
            unit="L/s",
            source="FOGGARA-DZ arithmetic indicator definition v1",
        )
        db.add(ind)
        db.flush()
    return ind

