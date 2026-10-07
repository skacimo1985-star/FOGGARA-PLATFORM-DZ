import math

import pytest

from app.services.remote_sensing_indices import compute_index, get_index_definition
from tests.conftest import login


def test_index_definitions_use_expected_sentinel2_bands():
    assert get_index_definition("ndvi").required_bands == ("B04", "B08")
    assert get_index_definition("evi").required_bands == ("B02", "B04", "B08")
    assert get_index_definition("savi").required_bands == ("B04", "B08")
    assert get_index_definition("ndwi").required_bands == ("B03", "B08")
    assert get_index_definition("ndmi").required_bands == ("B08", "B11")
    assert get_index_definition("lswi").required_bands == ("B08", "B11")
    assert get_index_definition("bsi").required_bands == ("B02", "B04", "B08", "B11")


def test_compute_indices_against_hand_calculation():
    bands = {"B02": 0.10, "B03": 0.20, "B04": 0.30, "B08": 0.70, "B11": 0.40}

    ndvi = compute_index("ndvi", bands)
    assert ndvi == pytest.approx((0.70 - 0.30) / (0.70 + 0.30))

    evi = compute_index("evi", bands)
    expected_evi = 2.5 * (0.70 - 0.30) / (0.70 + 6 * 0.30 - 7.5 * 0.10 + 1)
    assert evi == pytest.approx(expected_evi)

    savi = compute_index("savi", bands, savi_l=0.5)
    expected_savi = 1.5 * (0.70 - 0.30) / (0.70 + 0.30 + 0.5)
    assert savi == pytest.approx(expected_savi)

    ndwi = compute_index("ndwi", bands)
    assert ndwi == pytest.approx((0.20 - 0.70) / (0.20 + 0.70))

    ndmi = compute_index("ndmi", bands)
    lswi = compute_index("lswi", bands)
    expected_moisture = (0.70 - 0.40) / (0.70 + 0.40)
    assert ndmi == pytest.approx(expected_moisture)
    assert lswi == pytest.approx(expected_moisture)

    bsi = compute_index("bsi", bands)
    expected_bsi = ((0.40 + 0.30) - (0.70 + 0.10)) / ((0.40 + 0.30) + (0.70 + 0.10))
    assert bsi == pytest.approx(expected_bsi)


def test_singular_denominator_preserves_nodata():
    assert compute_index("ndvi", {"B04": 0.0, "B08": 0.0}) is None
    assert compute_index("ndwi", {"B03": 0.0, "B08": 0.0}) is None


def test_missing_or_nonfinite_inputs_fail_closed():
    with pytest.raises(ValueError, match="Missing required bands"):
        compute_index("ndvi", {"B04": 0.2})

    with pytest.raises(ValueError, match="finite"):
        compute_index("ndvi", {"B04": math.nan, "B08": 0.4})

    with pytest.raises(ValueError, match="finite"):
        compute_index("evi", {"B02": 0.1, "B04": 0.2, "B08": math.inf})


def test_savi_l_is_bounded():
    bands = {"B04": 0.2, "B08": 0.6}
    with pytest.raises(ValueError, match="between 0 and 1"):
        compute_index("savi", bands, savi_l=-0.1)
    with pytest.raises(ValueError, match="between 0 and 1"):
        compute_index("savi", bands, savi_l=1.1)


def test_index_definition_endpoint_requires_auth(client):
    response = client.get("/api/remote-sensing/indices/definitions")
    assert response.status_code == 401


def test_index_definition_endpoint_exposes_computed_not_verified_metadata(client, world):
    headers = login(client, "o1m@t.dz")
    response = client.get("/api/remote-sensing/indices/definitions", headers=headers)
    assert response.status_code == 200, response.text

    body = response.json()
    assert body["sensor"] == "Sentinel-2 L2A"
    assert body["computed"] is True
    assert body["verified"] is False

    by_key = {row["key"]: row for row in body["indices"]}
    assert set(by_key) == {"ndvi", "evi", "savi", "ndwi", "ndmi", "lswi", "bsi"}
    assert by_key["ndvi"]["required_bands"] == ["B04", "B08"]
    assert by_key["ndvi"]["evidence_status"] == "COMPUTED"
    assert by_key["ndwi"]["colormap_family"] == "water"
    assert by_key["lswi"]["required_bands"] == ["B08", "B11"]
    assert by_key["bsi"]["colormap_family"] == "soil"
    assert all(row["formula_version"] == "foggara-rs-v1" for row in body["indices"])
