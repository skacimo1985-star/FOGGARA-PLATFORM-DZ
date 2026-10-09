"""Regression tests for the deterministic irrigation calculation.

These tests do not claim that weather, soil, or satellite inputs are live.
"""
import pytest

from app.services.agriculture_operations import irrigation_scenario, vegetation_index


def test_irrigation_volume_and_provenance():
    result = irrigation_scenario(2, 5, 0.8, 3, 0.75, 7)
    assert result["etc_mm"] == 28
    assert result["net_mm"] == 25
    assert result["gross_mm"] == round(25 / 0.75, 4)
    assert result["volume_m3"] == round(25 / 0.75 * 20, 3)
    assert result["evidence_status"] == "COMPUTED"
    assert result["decision_status"] == "PROPOSED"
    assert "HUMAN_REVIEW_REQUIRED" in result["limitations"]


def test_rainfall_cannot_produce_negative_irrigation():
    result = irrigation_scenario(1, 2, 0.7, 100, 0.9, 3)
    assert result["net_mm"] == 0
    assert result["volume_m3"] == 0


@pytest.mark.parametrize("inputs", [
    (0, 5, 1, 0, 0.8, 7),
    (1, 5, 1, 0, 0, 7),
    (1, 5, 1, 0, 1.01, 7),
    (1, float("nan"), 1, 0, 0.8, 7),
    (1, float("inf"), 1, 0, 0.8, 7),
    (1, 5, 1, 0, 0.8, 31),
    (1, 5, 1, 0, 0.8, 1.5),
    (1, None, 1, 0, 0.8, 7),
    (True, 5, 1, 0, 0.8, 7),
])
def test_invalid_irrigation_inputs_rejected(inputs):
    with pytest.raises(ValueError):
        irrigation_scenario(*inputs)


def test_ndvi_math_and_invalid_reflectance():
    assert vegetation_index(0.8, 0.2) == pytest.approx(0.6)
    with pytest.raises(ValueError):
        vegetation_index(0, 0)
    with pytest.raises(ValueError):
        vegetation_index(1.1, 0.2)
