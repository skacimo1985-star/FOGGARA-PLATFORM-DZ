"""Safe, deterministic FOGGARA hackathon WEFEH recommendation prototype.

No network or field actuator access. All readings below are synthetic.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class Readings:
    soil_moisture_pct: float
    water_reserve_pct: float
    solar_available_kw: float
    pump_demand_kw: float


def recommend(readings: Readings) -> dict[str, Any]:
    values = asdict(readings)
    for key, value in values.items():
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"{key} must be numeric")
        if value != value or abs(value) == float("inf"):
            raise ValueError(f"{key} must be finite")
        if value < 0:
            raise ValueError(f"{key} cannot be negative")
    if readings.soil_moisture_pct > 100 or readings.water_reserve_pct > 100:
        raise ValueError("percentage readings must not exceed 100")

    risks = []
    if readings.water_reserve_pct < 20:
        risks.append("LOW_WATER_RESERVE")
    if readings.pump_demand_kw > readings.solar_available_kw:
        risks.append("SOLAR_POWER_DEFICIT")
    if readings.soil_moisture_pct < 30:
        risks.append("LOW_SOIL_MOISTURE")

    if readings.water_reserve_pct < 20:
        proposal = "Check water availability before considering irrigation."
    elif readings.soil_moisture_pct < 30:
        proposal = "Review irrigation need and pump power before scheduling."
    else:
        proposal = "Continue monitoring. No immediate irrigation proposal."

    return {
        "input_kind": "SYNTHETIC_DEMO",
        "data_provenance": "caller_supplied_unverified",
        "recommendation_kind": "PROPOSED",
        "domain": ["water", "energy"],
        "proposal": proposal,
        "risk_flags": risks,
        "requires_human_approval": True,
        "actuation_permitted": False,
        "operational_command": None,
        "confidence": None,
        "uncertainty_note": "Rule-based synthetic demonstration, not a calibrated agronomic recommendation.",
        "inputs": values,
        "model_provider": None,
    }


if __name__ == "__main__":
    example = Readings(
        soil_moisture_pct=24.0,
        water_reserve_pct=45.0,
        solar_available_kw=2.0,
        pump_demand_kw=3.0,
    )
    print(json.dumps(recommend(example), indent=2))
