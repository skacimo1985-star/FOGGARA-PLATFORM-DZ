import pytest

from app.services.service_delivery import irrigation_water_assessment, soil_assessment_values


def finding(result, metric):
    return next(row for row in result["findings"] if row["metric"] == metric)


def test_water_screen_uses_fao_salinity_tds_and_ph_thresholds():
    result = irrigation_water_assessment({
        "ec": 3.2,
        "tds": 2100,
        "ph": 8.6,
    })
    assert finding(result, "ec")["restriction"] == "severe"
    assert finding(result, "tds")["restriction"] == "severe"
    assert finding(result, "ph")["level"] == "watch"
    assert result["references"][0]["code"] == "FAO-29-REV1"
    assert "FAO_GENERAL_GUIDELINES_REQUIRE_CROP_SOIL_CLIMATE_MANAGEMENT_CONTEXT" in result["limitations"]


def test_water_screen_derives_sar_from_verified_ion_units_and_combines_with_ec():
    result = irrigation_water_assessment({
        "ec": 0.5,
        "sodium": 22.989769,
        "calcium": 20.039,
        "magnesium": 12.1525,
        "chloride": 200.0,
    })
    derived = result["derived_metrics"]["sar"]
    assert derived["value"] == pytest.approx(1.0, abs=1e-5)
    assert derived["evidence_status"] == "COMPUTED"
    assert finding(result, "sar")["restriction"] == "none"
    assert finding(result, "sar_ec")["restriction"] == "slight_to_moderate"
    assert finding(result, "chloride")["restriction"] == "slight_to_moderate"


def test_water_screen_does_not_extrapolate_fao_infiltration_table_above_sar_40():
    result = irrigation_water_assessment({"ec": 1.0, "sar": 45.0})
    assert "SAR_OUTSIDE_FAO_INFILTRATION_TABLE_RANGE" in result["limitations"]
    assert not any(row["metric"] == "sar_ec" for row in result["findings"])


def test_soil_usda_salinity_class_requires_saturated_paste_ece_method():
    result = soil_assessment_values(
        {"ec": 9.0, "ph": 7.2},
        evidence_status="COMPUTED_FROM_VERIFIED_MEASUREMENTS",
        methods={"ec": "saturated paste ECe"},
    )
    ec = finding(result, "ec")
    assert ec["message"] == "usda_ece_salinity_class"
    assert ec["classification"] == "moderately_saline"
    assert ec["basis"] == "saturated_paste_ECe_dS_m"
    assert result["references"][0]["code"] == "USDA-NRCS-FIELD-BOOK-V4-2024"
    assert "SOIL_EC_METHOD_REQUIRED_FOR_USDA_ECE_CLASSIFICATION" not in result["limitations"]


def test_soil_ec_unknown_method_is_not_silently_labelled_ece():
    result = soil_assessment_values(
        {"ec": 9.0},
        methods={"ec": "portable conductivity probe"},
    )
    ec = finding(result, "ec")
    assert ec["message"] == "salinity_risk"
    assert "classification" not in ec
    assert "SOIL_EC_METHOD_REQUIRED_FOR_USDA_ECE_CLASSIFICATION" in result["limitations"]


def test_npk_and_moisture_remain_context_dependent():
    result = soil_assessment_values({
        "nitrogen": 45,
        "phosphorus": 18,
        "potassium": 210,
        "moisture": 22,
    })
    assert "NPK_THRESHOLDS_REQUIRE_CROP_AND_EXTRACTION_METHOD" in result["limitations"]
    assert "SOIL_MOISTURE_REQUIRES_TEXTURE_FIELD_CAPACITY_WILTING_POINT" in result["limitations"]
