"""المحاكي الحتمي (Phase 03 §11/§12) — نفس المدخلات تنتج نفس المخرجات دائمًا.

الحتمية مضمونة عبر SHA-256 على (seed, sensor_id, scenario, step) —
لا عشوائية كونية ولا ساعة نظام داخل التوليد. هذه سيناريوهات محاكاة
حتمية وليست نماذج معايرة للواقع (§12).
"""
import hashlib
from datetime import datetime, timedelta, timezone

from ..models import Sensor

# قيم قاعدية لكل نوع مستشعر عند غياب إعدادات المستشعر
_BASE_VALUES = {
    "water_level": 5.0, "flow_rate": 12.0, "pressure": 3.0, "temperature": 25.0,
    "pump_state": 1.0, "valve_state": 1.0, "energy": 11.0, "voltage": 400.0,
    "current": 20.0, "frequency": 50.0,
}


def _noise(seed: int, sensor_id: int, scenario: str, step: int) -> float:
    """ضجيج حتمي في [0, 1) — نفس الرباعية تعطي نفس القيمة دائمًا."""
    h = hashlib.sha256(f"{seed}:{sensor_id}:{scenario}:{step}".encode()).digest()
    return int.from_bytes(h[:8], "big") / float(2 ** 64)


def _base(sensor: Sensor) -> float:
    cfg_base = (sensor.configuration or {}).get("base_value")
    if isinstance(cfg_base, (int, float)):
        return float(cfg_base)
    return _BASE_VALUES.get(sensor.sensor_type, 1.0)


def simulate_sensor(sensor: Sensor, scenario: str, start_time: datetime,
                    steps: int, step_seconds: int, seed: int) -> list[dict]:
    """توليد قراءات حتمية لمستشعر واحد — يعيد قوائم خام (لا يلمس قاعدة البيانات)."""
    base = _base(sensor)
    out = []
    for i in range(steps):
        n = _noise(seed, sensor.id, scenario, i)
        ts = start_time + timedelta(seconds=i * step_seconds)
        value: float | None
        quality = "VALID"

        if scenario == "NORMAL":
            value = base * (1 + 0.05 * (n - 0.5))
            if sensor.sensor_type in ("pump_state", "valve_state"):
                value = 1.0 if (i // 4) % 2 == 0 else 0.0  # جدول حتمي
        elif scenario == "HIGH_DEMAND":
            ramp = 1 + 0.5 * (i / max(steps - 1, 1))
            value = base * ramp * (1 + 0.03 * (n - 0.5)) if sensor.sensor_type in (
                "flow_rate", "energy", "current") else base * (1 - 0.2 * i / max(steps - 1, 1))
        elif scenario == "LOW_WATER":
            if sensor.sensor_type == "water_level":
                value = base * (1 - 0.7 * i / max(steps - 1, 1))  # هبوط تدريجي حتمي
            else:
                value = base * (1 + 0.05 * (n - 0.5))
        elif scenario == "PRESSURE_ANOMALY":
            if sensor.sensor_type == "pressure" and steps // 3 <= i < 2 * steps // 3:
                value = base * 1.8  # خارج المجال التشغيلي المتوقع
                quality = "SUSPECT"
            else:
                value = base * (1 + 0.05 * (n - 0.5))
        elif scenario == "SENSOR_FAILURE":
            if i % 3 == 2:
                value = None
                quality = "MISSING"
            elif i % 5 == 4:
                value = base * 10  # قيمة مستحيلة — تُوسم INVALID
                quality = "INVALID"
            else:
                value = base * (1 + 0.05 * (n - 0.5))
        elif scenario == "ENERGY_ANOMALY":
            if sensor.sensor_type in ("energy", "current", "voltage"):
                value = base * (1 + i / max(steps - 1, 1))  # حتى ضعف الطبيعي
                if sensor.max_value is not None and value > float(sensor.max_value):
                    quality = "SUSPECT"
            else:
                value = base * (1 + 0.05 * (n - 0.5))
        else:
            raise ValueError(f"Unknown scenario: {scenario}")

        out.append({"observed_at": ts, "value": (round(value, 4) if value is not None else None),
                    "quality": quality})
    return out
