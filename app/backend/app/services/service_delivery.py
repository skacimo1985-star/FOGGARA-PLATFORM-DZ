"""Deterministic decision-support services used by the FOGGARA service delivery API.

These functions summarize user-supplied/recorded measurements. They never fabricate
laboratory, satellite, sensor, or weather observations.
"""
import math


def _finite(value):
    return value is not None and math.isfinite(float(value))


SOIL_SCREEN_METRICS = {
    "ph", "ec", "moisture", "soc", "nitrogen", "phosphorus", "potassium",
    "organic_matter", "temperature",
}


def soil_assessment_values(values, *, evidence_status="COMPUTED"):
    """Conservative agronomic screening over explicitly supplied soil values."""
    latest = {
        metric: float(value)
        for metric, value in values.items()
        if metric in SOIL_SCREEN_METRICS and _finite(value)
    }
    findings, actions = [], []
    ph = latest.get("ph")
    if _finite(ph):
        if ph < 5.5:
            findings.append({"metric": "ph", "level": "attention", "message": "acidic"})
            actions.append("Confirm pH with a representative laboratory sample before amendment.")
        elif ph > 8.0:
            findings.append({"metric": "ph", "level": "attention", "message": "alkaline"})
            actions.append("Review alkalinity, bicarbonate and crop tolerance before amendment.")
        else:
            findings.append({"metric": "ph", "level": "ok", "message": "within_general_screening_range"})
    ec = latest.get("ec")
    if _finite(ec):
        if ec > 4:
            findings.append({"metric": "ec", "level": "attention", "message": "salinity_risk"})
            actions.append("Review crop salt tolerance, irrigation-water EC and drainage.")
        else:
            findings.append({"metric": "ec", "level": "ok", "message": "below_general_salinity_screen"})
    return {
        "service": "soil_screening", "evidence_status": evidence_status,
        "decision_status": "PROPOSED", "inputs": latest, "findings": findings,
        "actions": actions, "coverage": sorted(latest),
        "limitations": ["SCREENING_NOT_LAB_CERTIFICATE", "CROP_SPECIFIC_THRESHOLDS_NOT_APPLIED", "HUMAN_REVIEW_REQUIRED"],
    }


def soil_assessment(observations):
    """Return screening from the latest recorded agriculture observations."""
    latest = {}
    for row in observations:
        metric = row.metric
        if metric in SOIL_SCREEN_METRICS and metric not in latest:
            latest[metric] = float(row.value)
    return soil_assessment_values(latest)


def irrigation_water_assessment(measurements):
    """Screen recorded irrigation-water measurements without claiming laboratory certification."""
    latest = {}
    for metric, value in measurements.items():
        if _finite(value):
            latest[metric] = float(value)
    findings, actions = [], []
    ec = latest.get("ec")
    ph = latest.get("ph")
    if ec is not None:
        if ec > 3:
            findings.append({"metric": "ec", "level": "attention", "message": "high_salinity_screen"})
            actions.append("Assess crop tolerance, leaching requirement and drainage with a qualified agronomist.")
        elif ec > 0.7:
            findings.append({"metric": "ec", "level": "watch", "message": "moderate_salinity_screen"})
        else:
            findings.append({"metric": "ec", "level": "ok", "message": "low_salinity_screen"})
    if ph is not None:
        findings.append({"metric": "ph", "level": "watch" if ph < 6.5 or ph > 8.4 else "ok",
                         "message": "outside_common_irrigation_range" if ph < 6.5 or ph > 8.4 else "within_common_irrigation_range"})
    return {
        "service": "irrigation_water_screening", "evidence_status": "COMPUTED",
        "decision_status": "PROPOSED", "inputs": latest, "findings": findings,
        "actions": actions, "coverage": sorted(latest),
        "limitations": ["SCREENING_NOT_POTABILITY_OR_LAB_CERTIFICATE", "SAR_AND_SPECIFIC_IONS_NOT_EVALUATED", "HUMAN_REVIEW_REQUIRED"],
    }
