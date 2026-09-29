"""Measurement validation catalog and water indicator computation.

Rules are explicit and auditable — no hidden heuristics.
"""
import math
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..deps import api_error
from ..models import Indicator, Measurement

# قاموس المعاملات/الوحدات المعتمد لكل مجال WEFEH.
# parameter -> (allowed units, min, max)
# المجالات المنطقية موثقة هنا وتُرفض القيم خارجها بـ 422 VALUE_OUT_OF_RANGE:
#   flow_rate: 0..100000 L/s (من قطر أنبوب منزلي حتى سد كبير)
#   water_level: -500..10000 m (منسوب قد يكون سالبًا تحت مستوى البحر)
#   ph: 0..14 (تعريف مقياس pH)
#   temperature: -10..80 °C (مياه سطحية/جوفية وصناعية في المناخ الجزائري)
#   turbidity: 0..10000 NTU (مياه شرب حتى مياه صرف شديدة العكارة)
#   pressure: 0..1000 bar / ما يعادلها kPa (شبكات حتى آبار عميقة جدًا)
#   humidity: 0..100 %RH (تعريف الرطوبة النسبية)
#   electrical_power: 0..100000 kW (عدّاد منشأة حتى محطة متوسطة)
#   voltage: 0..100000 V (حساس حتى خط نقل 220kV)
#   rainfall: 0..2000 mm (تراكم سنوي أقصى موثق في الجزائر أقل بكثير)
#   soil_moisture: 0..100 % (نسبة حجمية)
#   dissolved_oxygen: 0..30 mg/L (تشبع الماء ~14 mg/L عند 0°C مع هامش)
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
FLOW_THRESHOLD_LS = 0.5  # عتبة قابلة للتعديل لاحقًا عبر إعداد، موثقة هنا
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
    if not (vmin <= value <= vmax):
        api_error(422, "VALUE_OUT_OF_RANGE",
                  f"Value {value} out of plausible range [{vmin}, {vmax}] for {parameter}")


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
    """Explainable rule: avg flow below threshold => maintenance inspection."""
    below = value < FLOW_THRESHOLD_LS
    basis = (
        f"indicator={indicator.code}; value={value} {indicator.unit}; "
        f"threshold={FLOW_THRESHOLD_LS} {indicator.unit}; n_validated={n}; "
        f"window={wfrom.isoformat()}..{wto.isoformat()}; "
        f"evidence_ids={evidence_ids}"
    )
    if below:
        ar = (f"متوسط التصريف المقاس ({value} ل/ث) أدنى من عتبة {FLOW_THRESHOLD_LS} ل/ث "
              f"خلال النافذة المحددة. يُقترح تكليف فريق بفحص القنوات والآبار الأم وتنظيفها، "
              f"مع الاستناد إلى الأدلة المرفقة. القرار النهائي للجهة المخوّلة.")
        fr = (f"Le débit moyen mesuré ({value} L/s) est inférieur au seuil de {FLOW_THRESHOLD_LS} L/s "
              f"sur la période. Il est proposé de mandater une équipe pour inspecter et curer "
              f"les galeries et les puits, en s'appuyant sur les pièces jointes. "
              f"La décision finale appartient à l'autorité habilitée.")
        en = (f"Measured average flow ({value} L/s) is below the {FLOW_THRESHOLD_LS} L/s threshold "
              f"for the selected window. Assigning an inspection/cleaning team to galleries and "
              f"mother wells is proposed, based on the attached evidence. "
              f"Final decision rests with the authorized human authority.")
    else:
        ar = (f"متوسط التصريف المقاس ({value} ل/ث) ضمن الحد المقبول (≥ {FLOW_THRESHOLD_LS} ل/ث). "
              f"يُقترح مواصلة المراقبة الدورية وتوثيق القياسات، دون تدخل عاجل.")
        fr = (f"Le débit moyen mesuré ({value} L/s) est dans la limite acceptable (≥ {FLOW_THRESHOLD_LS} L/s). "
              f"Poursuite du suivi périodique et de la documentation des mesures, sans intervention urgente.")
        en = (f"Measured average flow ({value} L/s) is within the acceptable limit (≥ {FLOW_THRESHOLD_LS} L/s). "
              f"Continue periodic monitoring and measurement documentation; no urgent intervention.")
    return basis, ar, fr, en


def ensure_default_indicator(db: Session) -> Indicator:
    ind = db.execute(select(Indicator).where(Indicator.code == INDICATOR_CODE)).scalar_one_or_none()
    if ind is None:
        ind = Indicator(
            code=INDICATOR_CODE,
            name_ar="متوسط تصريف المورد المائي",
            name_fr="Débit moyen de la ressource en eau",
            name_en="Average water resource flow",
            formula="mean(value) des mesures flow_rate (L/s) validées sur une fenêtre glissante",
            unit="L/s",
            source="FOGGARA-DZ operational definition v1 (DEMO)",
        )
        db.add(ind)
        db.flush()
    return ind
