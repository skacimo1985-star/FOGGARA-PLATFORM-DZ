"""Deterministic evidence-backed agronomic screening for FOGGARA.

These functions only interpret explicitly recorded values. They never fabricate
laboratory, satellite, sensor or weather observations, and they never replace
crop-specific agronomic review.
"""
import math


FAO_WATER_REFERENCE = {
    "code": "FAO-29-REV1",
    "title": "Water Quality for Agriculture",
    "url": "https://www.fao.org/4/T0234e/T0234E01.htm",
}

USDA_SOIL_REFERENCE = {
    "code": "USDA-NRCS-FIELD-BOOK-V4-2024",
    "title": "Field Book for Describing and Sampling Soils, Version 4.0",
    "url": "https://www.nrcs.usda.gov/sites/default/files/2025-05/Field-Book-for-Describing-and-Sampling-Soils-Ver4.pdf",
}


def _finite(value):
    return value is not None and math.isfinite(float(value))


def _append_unique(values, item):
    if item not in values:
        values.append(item)


def _restriction_level(restriction: str) -> str:
    return {
        "none": "ok",
        "slight_to_moderate": "watch",
        "severe": "attention",
    }.get(restriction, "watch")


SOIL_SCREEN_METRICS = {
    "ph", "ec", "moisture", "soc", "nitrogen", "phosphorus", "potassium",
    "organic_matter", "temperature",
}


def _is_ece_method(method: str | None) -> bool:
    if not method:
        return False
    normalized = method.strip().lower().replace("_", " ").replace("-", " ")
    tokens = (
        "saturated paste",
        "saturation extract",
        "saturated extract",
        "paste extract",
        "ece",
        "pate saturee",
        "pâte saturée",
    )
    return any(token in normalized for token in tokens)


def _usda_ece_class(ec: float) -> tuple[str, str]:
    if ec < 2:
        return "nonsaline", "ok"
    if ec < 4:
        return "very_slightly_saline", "watch"
    if ec < 8:
        return "slightly_saline", "watch"
    if ec < 16:
        return "moderately_saline", "attention"
    return "strongly_saline", "attention"


def soil_assessment_values(values, *, evidence_status="COMPUTED", methods=None):
    """Conservative soil screening over explicitly supplied values.

    USDA salinity classes are only applied when the EC method is identified as
    saturated-paste ECe. Other EC methods remain useful observations but are not
    silently converted to ECe classes.
    """
    latest = {
        metric: float(value)
        for metric, value in values.items()
        if metric in SOIL_SCREEN_METRICS and _finite(value)
    }
    method_map = {
        str(metric): str(method)
        for metric, method in (methods or {}).items()
        if method is not None
    }
    findings, actions = [], []
    limitations = [
        "SCREENING_NOT_LAB_CERTIFICATE",
        "CROP_SPECIFIC_THRESHOLDS_NOT_APPLIED",
        "HUMAN_REVIEW_REQUIRED",
    ]
    references = []

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
        ec_method = method_map.get("ec")
        if _is_ece_method(ec_method):
            salinity_class, level = _usda_ece_class(ec)
            findings.append({
                "metric": "ec",
                "level": level,
                "message": "usda_ece_salinity_class",
                "classification": salinity_class,
                "basis": "saturated_paste_ECe_dS_m",
                "reference": USDA_SOIL_REFERENCE["code"],
            })
            references.append(USDA_SOIL_REFERENCE)
            if ec >= 4:
                actions.append("Review crop salt tolerance, irrigation-water salinity and drainage.")
        else:
            # Preserve a conservative general flag without mislabelling the
            # measurement as saturated-paste ECe.
            if ec > 4:
                findings.append({"metric": "ec", "level": "attention", "message": "salinity_risk"})
                actions.append("Review the EC extraction method, crop salt tolerance, irrigation-water EC and drainage.")
            else:
                findings.append({"metric": "ec", "level": "ok", "message": "below_general_salinity_screen"})
            _append_unique(limitations, "SOIL_EC_METHOD_REQUIRED_FOR_USDA_ECE_CLASSIFICATION")

    if any(metric in latest for metric in ("nitrogen", "phosphorus", "potassium")):
        _append_unique(limitations, "NPK_THRESHOLDS_REQUIRE_CROP_AND_EXTRACTION_METHOD")
    if "moisture" in latest:
        _append_unique(limitations, "SOIL_MOISTURE_REQUIRES_TEXTURE_FIELD_CAPACITY_WILTING_POINT")
    if "soc" in latest or "organic_matter" in latest:
        _append_unique(limitations, "SOC_OM_INTERPRETATION_REQUIRES_SOIL_CONTEXT")

    return {
        "service": "soil_screening",
        "evidence_status": evidence_status,
        "decision_status": "PROPOSED",
        "inputs": latest,
        "methods": method_map,
        "findings": findings,
        "actions": actions,
        "coverage": sorted(latest),
        "references": references,
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


def _fao_salinity_restriction(ec: float) -> str:
    if ec < 0.7:
        return "none"
    if ec <= 3.0:
        return "slight_to_moderate"
    return "severe"


def _fao_tds_restriction(tds: float) -> str:
    if tds < 450:
        return "none"
    if tds <= 2000:
        return "slight_to_moderate"
    return "severe"


def _derived_sar(latest):
    required = ("sodium", "calcium", "magnesium")
    if not all(metric in latest for metric in required):
        return None
    # Convert mg/L to milliequivalents/L using ionic equivalent weights.
    na = latest["sodium"] / 22.989769
    ca = latest["calcium"] / 20.039
    mg = latest["magnesium"] / 12.1525
    denominator = math.sqrt(max((ca + mg) / 2.0, 0.0))
    if denominator <= 1e-12:
        return None
    value = na / denominator
    return value if math.isfinite(value) else None


def _fao_infiltration_restriction(sar: float, ec: float) -> str | None:
    # FAO 29 Rev.1 table: increasing salinity counteracts the infiltration
    # hazard associated with sodium. Do not extrapolate beyond SAR 40.
    if sar < 0 or sar > 40:
        return None
    if sar < 3:
        none_above, severe_below = 0.7, 0.2
    elif sar < 6:
        none_above, severe_below = 1.2, 0.3
    elif sar < 12:
        none_above, severe_below = 1.9, 0.5
    elif sar < 20:
        none_above, severe_below = 2.9, 1.3
    else:
        none_above, severe_below = 5.0, 2.9

    if ec > none_above:
        return "none"
    if ec < severe_below:
        return "severe"
    return "slight_to_moderate"


def irrigation_water_assessment(measurements):
    """Screen verified irrigation-water measurements using FAO 29 Rev.1.

    Expected units are enforced by FOGGARA's measurement catalogue:
    EC dS/m; TDS/Na/Ca/Mg/Cl/HCO3 mg/L; SAR index.
    """
    latest = {
        str(metric): float(value)
        for metric, value in measurements.items()
        if _finite(value)
    }
    findings, actions = [], []
    limitations = [
        "SCREENING_NOT_POTABILITY_OR_LAB_CERTIFICATE",
        "FAO_GENERAL_GUIDELINES_REQUIRE_CROP_SOIL_CLIMATE_MANAGEMENT_CONTEXT",
        "HUMAN_REVIEW_REQUIRED",
    ]
    references = [FAO_WATER_REFERENCE]
    derived_metrics = {}

    ec = latest.get("ec")
    tds = latest.get("tds")
    ph = latest.get("ph")

    if ec is not None:
        restriction = _fao_salinity_restriction(ec)
        findings.append({
            "metric": "ec",
            "level": _restriction_level(restriction),
            "message": "fao_salinity_restriction",
            "restriction": restriction,
            "basis": "ECw_dS_m",
            "reference": FAO_WATER_REFERENCE["code"],
        })
        if restriction == "severe":
            actions.append("Review crop salt tolerance, leaching requirement, drainage and blending options before irrigation.")
        elif restriction == "slight_to_moderate":
            actions.append("Review crop salt tolerance and seasonal salt balance before irrigation.")

    if tds is not None:
        restriction = _fao_tds_restriction(tds)
        findings.append({
            "metric": "tds",
            "level": _restriction_level(restriction),
            "message": "fao_tds_salinity_restriction",
            "restriction": restriction,
            "basis": "TDS_mg_L",
            "reference": FAO_WATER_REFERENCE["code"],
        })

    sar = latest.get("sar")
    if sar is None:
        computed_sar = _derived_sar(latest)
        if computed_sar is not None:
            sar = computed_sar
            derived_metrics["sar"] = {
                "value": round(computed_sar, 6),
                "unit": "index",
                "evidence_status": "COMPUTED",
                "basis": ["sodium_mg_L", "calcium_mg_L", "magnesium_mg_L"],
                "formula": "SAR=Na_meq_L/sqrt((Ca_meq_L+Mg_meq_L)/2)",
            }

    if sar is not None:
        sodium_restriction = "none" if sar < 3 else "slight_to_moderate" if sar <= 9 else "severe"
        findings.append({
            "metric": "sar",
            "level": _restriction_level(sodium_restriction),
            "message": "fao_surface_irrigation_sodium_restriction",
            "restriction": sodium_restriction,
            "basis": "SAR",
            "reference": FAO_WATER_REFERENCE["code"],
        })
        if ec is not None:
            infiltration = _fao_infiltration_restriction(sar, ec)
            if infiltration is None:
                _append_unique(limitations, "SAR_OUTSIDE_FAO_INFILTRATION_TABLE_RANGE")
            else:
                findings.append({
                    "metric": "sar_ec",
                    "level": _restriction_level(infiltration),
                    "message": "fao_infiltration_restriction",
                    "restriction": infiltration,
                    "basis": "SAR_plus_ECw",
                    "reference": FAO_WATER_REFERENCE["code"],
                })
                if infiltration == "severe":
                    actions.append("Review infiltration risk and soil structural response before irrigation.")
        else:
            _append_unique(limitations, "EC_REQUIRED_FOR_SAR_INFILTRATION_SCREEN")
    else:
        _append_unique(limitations, "SAR_OR_VERIFIED_NA_CA_MG_REQUIRED_FOR_INFILTRATION_SCREEN")

    chloride = latest.get("chloride")
    if chloride is not None:
        chloride_meq_l = chloride / 35.453
        restriction = "none" if chloride_meq_l < 4 else "slight_to_moderate" if chloride_meq_l <= 10 else "severe"
        findings.append({
            "metric": "chloride",
            "level": _restriction_level(restriction),
            "message": "fao_surface_irrigation_chloride_restriction",
            "restriction": restriction,
            "basis": "chloride_meq_L",
            "computed_meq_l": round(chloride_meq_l, 6),
            "reference": FAO_WATER_REFERENCE["code"],
        })
        if restriction == "severe":
            actions.append("Review chloride-sensitive crops and irrigation management before use.")

    bicarbonate = latest.get("bicarbonate")
    if bicarbonate is not None:
        hco3_meq_l = bicarbonate / 61.0168
        restriction = "none" if hco3_meq_l < 1.5 else "slight_to_moderate" if hco3_meq_l <= 8.5 else "severe"
        findings.append({
            "metric": "bicarbonate",
            "level": _restriction_level(restriction),
            "message": "fao_overhead_sprinkler_bicarbonate_restriction",
            "restriction": restriction,
            "basis": "bicarbonate_meq_L",
            "computed_meq_l": round(hco3_meq_l, 6),
            "reference": FAO_WATER_REFERENCE["code"],
        })
        _append_unique(limitations, "IRRIGATION_METHOD_REQUIRED_FOR_BICARBONATE_RELEVANCE")

    if ph is not None:
        findings.append({
            "metric": "ph",
            "level": "watch" if ph < 6.5 or ph > 8.4 else "ok",
            "message": "outside_common_irrigation_range" if ph < 6.5 or ph > 8.4 else "within_common_irrigation_range",
            "basis": "FAO_common_range_6.5_8.4",
            "reference": FAO_WATER_REFERENCE["code"],
        })

    return {
        "service": "irrigation_water_screening",
        "evidence_status": "COMPUTED",
        "decision_status": "PROPOSED",
        "inputs": latest,
        "derived_metrics": derived_metrics,
        "findings": findings,
        "actions": list(dict.fromkeys(actions)),
        "coverage": sorted(latest),
        "references": references,
        "limitations": limitations,
    }
