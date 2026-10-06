"""Scientific vegetation/water index definitions for FOGGARA remote sensing.

Pure-Python scalar kernel. Raster workers must call the same formulas so that
API metadata, tests, COG products and map legends share one definition.
"""
from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Mapping


@dataclass(frozen=True)
class IndexDefinition:
    key: str
    label: str
    required_bands: tuple[str, ...]
    stac_assets: Mapping[str, tuple[str, ...]]
    display_range: tuple[float, float]
    colormap_family: str
    formula_version: str = "foggara-rs-v1"


INDEX_DEFINITIONS: dict[str, IndexDefinition] = {
    "ndvi": IndexDefinition(
        key="ndvi",
        label="NDVI",
        required_bands=("B04", "B08"),
        stac_assets={"B04": ("red", "B04"), "B08": ("nir", "B08")},
        display_range=(-0.2, 0.9),
        colormap_family="vegetation",
    ),
    "evi": IndexDefinition(
        key="evi",
        label="EVI",
        required_bands=("B02", "B04", "B08"),
        stac_assets={"B02": ("blue", "B02"), "B04": ("red", "B04"), "B08": ("nir", "B08")},
        display_range=(-0.2, 0.8),
        colormap_family="vegetation",
    ),
    "savi": IndexDefinition(
        key="savi",
        label="SAVI",
        required_bands=("B04", "B08"),
        stac_assets={"B04": ("red", "B04"), "B08": ("nir", "B08")},
        display_range=(-0.2, 0.8),
        colormap_family="vegetation",
    ),
    "ndwi": IndexDefinition(
        key="ndwi",
        label="NDWI",
        required_bands=("B03", "B08"),
        stac_assets={"B03": ("green", "B03"), "B08": ("nir", "B08")},
        display_range=(-1.0, 1.0),
        colormap_family="water",
    ),
}


def get_index_definition(key: str) -> IndexDefinition:
    normalized = key.strip().lower()
    if normalized not in INDEX_DEFINITIONS:
        valid = ", ".join(sorted(INDEX_DEFINITIONS))
        raise ValueError(f"Unknown index '{key}'. Valid: {valid}")
    return INDEX_DEFINITIONS[normalized]


def _finite(value: float) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise ValueError("reflectance values must be finite")
    return number


def _safe_ratio(numerator: float, denominator: float) -> float | None:
    if not math.isfinite(numerator) or not math.isfinite(denominator):
        raise ValueError("index inputs must be finite")
    if abs(denominator) <= 1e-12:
        return None
    return numerator / denominator


def compute_index(
    key: str,
    bands: Mapping[str, float],
    *,
    savi_l: float = 0.5,
) -> float | None:
    """Compute one index from reflectance values.

    Inputs are reflectance values in a common scale. The function intentionally
    does not fabricate values for singular denominators; it returns None so
    raster/statistics layers can preserve nodata explicitly.
    """
    definition = get_index_definition(key)
    missing = [band for band in definition.required_bands if band not in bands]
    if missing:
        raise ValueError(f"Missing required bands: {', '.join(missing)}")

    values = {band: _finite(bands[band]) for band in definition.required_bands}
    normalized = definition.key

    if normalized == "ndvi":
        nir, red = values["B08"], values["B04"]
        return _safe_ratio(nir - red, nir + red)

    if normalized == "evi":
        nir, red, blue = values["B08"], values["B04"], values["B02"]
        ratio = _safe_ratio(nir - red, nir + 6.0 * red - 7.5 * blue + 1.0)
        return None if ratio is None else 2.5 * ratio

    if normalized == "savi":
        l_value = _finite(savi_l)
        if not 0.0 <= l_value <= 1.0:
            raise ValueError("savi_l must be between 0 and 1")
        nir, red = values["B08"], values["B04"]
        ratio = _safe_ratio(nir - red, nir + red + l_value)
        return None if ratio is None else (1.0 + l_value) * ratio

    if normalized == "ndwi":
        green, nir = values["B03"], values["B08"]
        return _safe_ratio(green - nir, green + nir)

    raise AssertionError(f"Unhandled index definition: {normalized}")


def public_index_definitions() -> list[dict]:
    return [
        {
            "key": definition.key,
            "label": definition.label,
            "required_bands": list(definition.required_bands),
            "stac_assets": {band: list(names) for band, names in definition.stac_assets.items()},
            "display_range": list(definition.display_range),
            "colormap_family": definition.colormap_family,
            "formula_version": definition.formula_version,
            "evidence_status": "COMPUTED",
            "source_sensor": "Sentinel-2 L2A",
        }
        for definition in INDEX_DEFINITIONS.values()
    ]
