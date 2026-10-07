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

FAO_IRRIGATION_GUIDELINE = "FAO Irrigation and Drainage Paper 29 Rev. 1"
NRCS_SOIL_SALINITY_GUIDELINE = "USDA NRCS soil salinity classes"

SOIL_GAP_SPEC = (
    ("ph", "pH", "core", "acidity_alkalinity"),
    ("ec", "dS/m", "core", "salinity"),
    ("nitrogen", "mg/kg", "nutrient", "crop_specific_nitrogen_context"),
    ("phosphorus", "mg/kg", "nutrient", "crop_specific_phosphorus_context"),
    ("potassium", "mg/kg", "nutrient", "crop_specific_potassium_context"),
    ("soc", "%", "soil_health", "soil_organic_carbon_context"),
    ("moisture", "% VWC", "water_balance", "soil_water_status"),
)

WATER_GAP_SPEC = (
    ("ph", "pH", "core", "acidity_alkalinity"),
    ("ec", "dS/m", "core", "salinity"),
    ("tds", "mg/L", "core", "dissolved_solids"),
    ("chloride", "mg/L", "extended", "specific_ion_toxicity"),
    ("bicarbonate", "mg/L", "extended", "alkalinity_context"),
)


def soil_data_gaps(values):
    present = {key for key, value in (values or {}).items() if _finite(value)}
    return [
        {"metric": metric, "unit": unit, "priority": priority, "purpose": purpose}
        for metric, unit, priority, purpose in SOIL_GAP_SPEC
        if metric not in present
    ]


def water_data_gaps(values):
    present = {key for key, value in (values or {}).items() if _finite(value)}
    gaps = [
        {"metric": metric, "unit": unit, "priority": priority, "purpose": purpose}
        for metric, unit, priority, purpose in WATER_GAP_SPEC
        if metric not in present
    ]
    has_sar_path = "sar" in present or {"sodium", "calcium", "magnesium"}.issubset(present)
    if not has_sar_path:
        gaps.insert(3, {
            "metric": "sar_or_na_ca_mg",
            "unit": "index or mg/L",
            "priority": "core",
            "purpose": "sodicity_and_infiltration_risk",
            "alternatives": ["sar", "sodium+calcium+magnesium"],
        })
    return gaps


def _soil_salinity_class(ec):
    if ec < 2:
        return "non_saline", "ok"
    if ec < 4:
        return "very_slightly_saline", "watch"
    if ec < 8:
        return "slightly_saline", "attention"
    if ec < 16:
        return "moderately_saline", "attention"
    return "strongly_saline", "attention"


def _restriction(value, no_limit, severe_limit):
    if value < no_limit:
        return "none", "ok"
    if value <= severe_limit:
        return "slight_to_moderate", "watch"
    return "severe", "attention"


def _sar_from_mg_l(values, units):
    required = ("sodium", "calcium", "magnesium")
    if not all(_finite(values.get(key)) for key in required):
        return None
    if not all((units or {}).get(key) == "mg/L" for key in required):
        return None
    na = float(values["sodium"]) / 22.98976928
    ca = float(values["calcium"]) / 20.039
    mg = float(values["magnesium"]) / 12.1525
    denominator = math.sqrt(max((ca + mg) / 2.0, 0.0))
    if denominator <= 0:
        return None
    return na / denominator


def _fao_infiltration_restriction(sar, ec):
    """FAO Table 1 infiltration screen: ECw thresholds vary with SAR."""
    if not (_finite(sar) and _finite(ec)):
        return None
    sar, ec = float(sar), float(ec)
    if sar < 0:
        return None
    if sar <= 3:
        high, low = 0.7, 0.2
    elif sar <= 6:
        high, low = 1.2, 0.3
    elif sar <= 12:
        high, low = 1.9, 0.5
    elif sar <= 20:
        high, low = 2.9, 1.3
    elif sar <= 40:
        high, low = 5.0, 2.9
    else:
        return "outside_guideline_range"
    if ec > high:
        return "none"
    if ec < low:
        return "severe"
    return "slight_to_moderate"


def soil_assessment_values(values, *, evidence_status="COMPUTED"):
    """Conservative agronomic screening over explicitly supplied soil values."""
    latest = {
        metric: float(value)
        for metric, value in values.items()
        if metric in SOIL_SCREEN_METRICS and _finite(value)
    }
    findings, actions, derived = [], [], {}
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
        salinity_class, level = _soil_salinity_class(float(ec))
        derived["salinity_class"] = salinity_class
        findings.append({"metric": "ec", "level": level, "message": f"soil_salinity_{salinity_class}"})
        if float(ec) >= 2:
            # Backward-compatible generic flag retained for existing clients while
            # the detailed NRCS-style salinity class remains the primary finding.
            findings.append({"metric": "ec", "level": level, "message": "salinity_risk"})
            actions.append("Confirm EC method, crop salt tolerance, irrigation-water salinity and drainage before intervention.")

    for metric in ("nitrogen", "phosphorus", "potassium"):
        if metric in latest:
            findings.append({
                "metric": metric,
                "level": "info",
                "message": "recorded_crop_and_lab_method_specific_interpretation_required",
            })
    for metric in ("soc", "organic_matter"):
        if metric in latest:
            findings.append({
                "metric": metric,
                "level": "info",
                "message": "recorded_site_specific_interpretation_required",
            })
    if "moisture" in latest:
        findings.append({
            "metric": "moisture",
            "level": "info",
            "message": "field_capacity_and_wilting_point_required_for_depletion_assessment",
        })

    limitations = [
        "SCREENING_NOT_LAB_CERTIFICATE",
        "CROP_SPECIFIC_THRESHOLDS_NOT_APPLIED",
        "HUMAN_REVIEW_REQUIRED",
    ]
    if "ec" in latest:
        limitations.append("EC_SALINITY_CLASS_REQUIRES_COMPATIBLE_ECE_METHOD_AND_25C_CONTEXT")
    if any(metric in latest for metric in ("nitrogen", "phosphorus", "potassium")):
        limitations.append("NPK_INTERPRETATION_REQUIRES_CROP_STAGE_AND_LAB_EXTRACTION_METHOD")

    return {
        "service": "soil_screening",
        "evidence_status": evidence_status,
        "decision_status": "PROPOSED",
        "inputs": latest,
        "derived": derived,
        "findings": findings,
        "actions": list(dict.fromkeys(actions)),
        "coverage": sorted(latest),
        "data_gaps": soil_data_gaps(latest),
        "guidelines": [NRCS_SOIL_SALINITY_GUIDELINE],
        "limitations": limitations,
    }


def soil_assessment(observations):
    """Return screening from the latest recorded agriculture observations."""
    latest = {}
    for row in observations:
        metric = row.metric
        if metric in SOIL_SCREEN_METRICS and metric not in latest:
            latest[metric] = float(row.value)
    return soil_assessment_values(latest)


def irrigation_water_assessment(measurements, *, units=None):
    """Screen irrigation water using FAO field-guideline logic without claiming certification."""
    latest = {
        metric: float(value)
        for metric, value in measurements.items()
        if _finite(value)
    }
    units = units or {}
    findings, actions, derived = [], [], {}

    ec = latest.get("ec")
    ph = latest.get("ph")
    tds = latest.get("tds")

    if ec is not None:
        restriction, level = _restriction(float(ec), 0.7, 3.0)
        derived["salinity_restriction_ec"] = restriction
        findings.append({"metric": "ec", "level": level, "message": f"fao_salinity_{restriction}"})
        if restriction != "none":
            actions.append("Review crop salt tolerance, leaching requirement and drainage.")

    if tds is not None:
        restriction, level = _restriction(float(tds), 450.0, 2000.0)
        derived["salinity_restriction_tds"] = restriction
        findings.append({"metric": "tds", "level": level, "message": f"fao_tds_{restriction}"})

    if ph is not None:
        findings.append({
            "metric": "ph",
            "level": "watch" if ph < 6.5 or ph > 8.4 else "ok",
            "message": "outside_common_irrigation_range" if ph < 6.5 or ph > 8.4 else "within_common_irrigation_range",
        })
        if ph < 6.5 or ph > 8.4:
            actions.append("Review alkalinity/acidity and irrigation-equipment compatibility.")

    sar = latest.get("sar")
    sar_source = "measured" if _finite(sar) else None
    if sar_source is None:
        sar = _sar_from_mg_l(latest, units)
        if sar is not None:
            derived["sar"] = round(float(sar), 4)
            sar_source = "computed_from_sodium_calcium_magnesium_mg_l"
    if _finite(sar):
        sar = float(sar)
        derived["sar_source"] = sar_source
        sodium_restriction, sodium_level = _restriction(sar, 3.0, 9.0)
        derived["surface_irrigation_sodium_restriction"] = sodium_restriction
        findings.append({
            "metric": "sar",
            "level": sodium_level,
            "message": f"fao_surface_irrigation_sodium_{sodium_restriction}",
        })
        infiltration = _fao_infiltration_restriction(sar, ec)
        if infiltration:
            derived["infiltration_restriction"] = infiltration
            infiltration_level = {
                "none": "ok",
                "slight_to_moderate": "watch",
                "severe": "attention",
                "outside_guideline_range": "attention",
            }[infiltration]
            findings.append({
                "metric": "sar_ec",
                "level": infiltration_level,
                "message": f"fao_infiltration_{infiltration}",
            })
            if infiltration != "none":
                actions.append("Review infiltration risk using soil texture, structure, calcium status and field performance.")

    chloride = latest.get("chloride")
    if _finite(chloride) and units.get("chloride") == "mg/L":
        chloride_meq_l = float(chloride) / 35.453
        derived["chloride_meq_l"] = round(chloride_meq_l, 4)
        restriction, level = _restriction(chloride_meq_l, 4.0, 10.0)
        derived["surface_irrigation_chloride_restriction"] = restriction
        findings.append({"metric": "chloride", "level": level, "message": f"fao_surface_irrigation_chloride_{restriction}"})

    bicarbonate = latest.get("bicarbonate")
    if _finite(bicarbonate) and units.get("bicarbonate") == "mg/L":
        derived["bicarbonate_meq_l"] = round(float(bicarbonate) / 61.0168, 4)

    if "turbidity" in latest:
        findings.append({
            "metric": "turbidity",
            "level": "info",
            "message": "recorded_clogging_assessment_requires_emitter_and_filtration_context",
        })
    if "dissolved_oxygen" in latest:
        findings.append({
            "metric": "dissolved_oxygen",
            "level": "info",
            "message": "recorded_not_used_for_fao_irrigation_salinity_classification",
        })

    limitations = [
        "SCREENING_NOT_POTABILITY_OR_LAB_CERTIFICATE",
        "CROP_AND_IRRIGATION_METHOD_CONTEXT_REQUIRED",
        "HUMAN_REVIEW_REQUIRED",
    ]
    if not _finite(sar) and not all(key in latest for key in ("sodium", "calcium", "magnesium")):
        limitations.append("SAR_OR_NA_CA_MG_REQUIRED_FOR_INFILTRATION_SCREEN")
    if all(key in latest for key in ("sodium", "calcium", "magnesium")) and sar_source is None:
        limitations.append("SAR_COMPUTATION_REQUIRES_NA_CA_MG_IN_MG_L")

    return {
        "service": "irrigation_water_screening",
        "evidence_status": "COMPUTED",
        "decision_status": "PROPOSED",
        "inputs": latest,
        "derived": derived,
        "findings": findings,
        "actions": list(dict.fromkeys(actions)),
        "coverage": sorted(latest),
        "data_gaps": water_data_gaps(latest),
        "guidelines": [FAO_IRRIGATION_GUIDELINE],
        "limitations": limitations,
    }

