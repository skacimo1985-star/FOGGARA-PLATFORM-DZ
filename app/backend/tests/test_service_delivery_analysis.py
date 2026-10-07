import pytest

from app.services.service_delivery import (
    irrigation_water_assessment,
    soil_assessment_values,
)


def test_soil_screening_exposes_nrcs_style_salinity_class_without_overclaiming_npk():
    result = soil_assessment_values({
        "ph": 7.4,
        "ec": 5.2,
        "nitrogen": 42,
        "phosphorus": 18,
        "potassium": 220,
        "soc": 2.3,
    })
    assert result["derived"]["salinity_class"] == "slightly_saline"
    assert any(item["metric"] == "ec" and item["level"] == "attention" for item in result["findings"])
    assert any(
        item["metric"] == "nitrogen"
        and item["message"] == "recorded_crop_and_lab_method_specific_interpretation_required"
        for item in result["findings"]
    )
    assert "NPK_INTERPRETATION_REQUIRES_CROP_STAGE_AND_LAB_EXTRACTION_METHOD" in result["limitations"]
    assert "USDA NRCS soil salinity classes" in result["guidelines"]


def test_irrigation_water_uses_fao_ec_and_tds_restriction_classes():
    result = irrigation_water_assessment(
        {"ph": 7.2, "ec": 1.4, "tds": 900},
        units={"ph": "pH", "ec": "dS/m", "tds": "mg/L"},
    )
    assert result["derived"]["salinity_restriction_ec"] == "slight_to_moderate"
    assert result["derived"]["salinity_restriction_tds"] == "slight_to_moderate"
    assert any(item["metric"] == "ph" and item["level"] == "ok" for item in result["findings"])
    assert "FAO Irrigation and Drainage Paper 29 Rev. 1" in result["guidelines"]


def test_irrigation_water_computes_sar_from_verified_mg_l_ions_and_combines_it_with_ec():
    result = irrigation_water_assessment(
        {
            "ec": 0.4,
            "sodium": 229.8976928,
            "calcium": 80.156,
            "magnesium": 48.61,
        },
        units={
            "ec": "dS/m",
            "sodium": "mg/L",
            "calcium": "mg/L",
            "magnesium": "mg/L",
        },
    )
    assert result["derived"]["sar"] == pytest.approx(5.0, abs=0.02)
    assert result["derived"]["sar_source"] == "computed_from_sodium_calcium_magnesium_mg_l"
    assert result["derived"]["infiltration_restriction"] == "slight_to_moderate"
    assert result["derived"]["surface_irrigation_sodium_restriction"] == "slight_to_moderate"


def test_irrigation_water_does_not_compute_sar_from_ions_with_unknown_units():
    result = irrigation_water_assessment({
        "ec": 0.4,
        "sodium": 229.9,
        "calcium": 80.2,
        "magnesium": 48.6,
    })
    assert "sar" not in result["derived"]
    assert "SAR_COMPUTATION_REQUIRES_NA_CA_MG_IN_MG_L" in result["limitations"]


def test_irrigation_water_direct_sar_can_flag_severe_infiltration_risk():
    result = irrigation_water_assessment(
        {"ec": 0.4, "sar": 10.0},
        units={"ec": "dS/m", "sar": "index"},
    )
    assert result["derived"]["infiltration_restriction"] == "severe"
    assert result["derived"]["surface_irrigation_sodium_restriction"] == "severe"
    assert any(
        item["metric"] == "sar_ec" and item["level"] == "attention"
        for item in result["findings"]
    )
