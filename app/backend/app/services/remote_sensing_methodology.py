"""Scientific and interoperability metadata for FOGGARA Earth-observation studies.

The registry separates:
- authoritative/provider specifications,
- international quality/interoperability frameworks,
- peer-reviewed spectral-index references,
- FOGGARA's own operational quality indicator.

No entry in this module upgrades a result to VERIFIED. Verification still requires
independent field/laboratory evidence and an authorized reviewer.
"""
from __future__ import annotations

from datetime import datetime, timezone
import math


STANDARDS_AND_GUIDANCE = [
    {
        "id": "qa4eo",
        "name": "QA4EO Best Practice Framework",
        "organization": "CEOS / GEO",
        "role": "traceability_quality_indicator_uncertainty",
        "url": "https://qa4eo.org/",
        "claim": "guidance",
    },
    {
        "id": "stac",
        "name": "SpatioTemporal Asset Catalog",
        "organization": "STAC community",
        "role": "interoperable_scene_metadata",
        "url": "https://stacspec.org/",
        "claim": "implemented_provider_contract",
    },
    {
        "id": "copernicus-s2-l2a",
        "name": "Sentinel-2 Level-2A Surface Reflectance",
        "organization": "Copernicus / ESA",
        "role": "surface_reflectance_and_scene_classification",
        "url": "https://documentation.dataspace.copernicus.eu/APIs/SentinelHub/Data/S2L2A.html",
        "claim": "source_product_specification",
    },
    {
        "id": "ogc-api-tiles",
        "name": "OGC API - Tiles Part 1: Core",
        "organization": "Open Geospatial Consortium",
        "role": "future_interoperable_raster_tile_delivery",
        "url": "https://www.ogc.org/standards/ogcapi-tiles/",
        "claim": "architecture_target_not_certified",
    },
    {
        "id": "fao56",
        "name": "FAO Irrigation and Drainage Paper 56",
        "organization": "FAO",
        "role": "reference_evapotranspiration_and_crop_water_requirements",
        "url": "https://www.fao.org/land-water/land/land-governance-and-planning/land-resources-planning-toolbox/detail/crop-evapotranspiration-%28crop-et0%29/en",
        "claim": "methodology_target_for_irrigation_module",
    },
]


OPEN_SOURCE_METHOD_REFERENCES = [
    {
        "name": "Awesome Spectral Indices",
        "license": "MIT",
        "role": "cross-check formulas and primary literature references",
        "url": "https://github.com/awesome-spectral-indices/awesome-spectral-indices",
    },
    {
        "name": "openEO Processes",
        "license": "Apache-2.0",
        "role": "interoperable process semantics and common band naming",
        "url": "https://github.com/Open-EO/openeo-processes",
    },
    {
        "name": "TiTiler",
        "license": "MIT",
        "role": "future COG/STAC dynamic tile service architecture",
        "url": "https://github.com/developmentseed/titiler",
    },
    {
        "name": "eo-learn",
        "license": "MIT",
        "role": "reference architecture for reproducible multi-temporal EO workflows",
        "url": "https://github.com/sentinel-hub/eo-learn",
    },
]


STUDY_RECIPES = [
    {
        "id": "vegetation_condition",
        "name": "Vegetation condition",
        "indices": ["ndvi", "evi", "savi"],
        "purpose": "Track canopy greenness/condition through time without diagnosing a specific disease or nutrient deficiency.",
        "minimum_evidence": ["Sentinel-2 L2A", "SCL mask", "multi-date comparison"],
        "field_validation": "Recommended for agronomic diagnosis.",
    },
    {
        "id": "water_moisture_screening",
        "name": "Water and canopy moisture screening",
        "indices": ["ndwi", "ndmi", "lswi"],
        "purpose": "Screen surface water and vegetation/land-surface moisture signals; not a direct soil-moisture measurement.",
        "minimum_evidence": ["Sentinel-2 L2A", "SCL mask", "multi-date comparison"],
        "field_validation": "Required before irrigation decisions that depend on absolute soil moisture.",
    },
    {
        "id": "soil_exposure",
        "name": "Bare-soil / cover screening",
        "indices": ["bsi", "ndvi", "savi"],
        "purpose": "Screen exposed soil and sparse vegetation conditions.",
        "minimum_evidence": ["Sentinel-2 L2A", "SCL mask"],
        "field_validation": "Recommended for soil-condition interpretation.",
    },
]


INDEX_LITERATURE = {
    "ndvi": {
        "formula": "(NIR - RED) / (NIR + RED)",
        "domain": "vegetation",
        "reference": "https://ntrs.nasa.gov/citations/19740022614",
    },
    "evi": {
        "formula": "2.5 * (NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1)",
        "domain": "vegetation",
        "reference": "https://doi.org/10.1016/S0034-4257(96)00112-5",
    },
    "savi": {
        "formula": "(1 + L) * (NIR - RED) / (NIR + RED + L), L=0.5",
        "domain": "vegetation",
        "reference": "https://doi.org/10.1016/0034-4257(88)90106-X",
    },
    "ndwi": {
        "formula": "(GREEN - NIR) / (GREEN + NIR)",
        "domain": "water",
        "reference": "https://doi.org/10.1080/01431169608948714",
    },
    "ndmi": {
        "formula": "(NIR - SWIR1) / (NIR + SWIR1)",
        "domain": "vegetation_moisture",
        "reference": "https://doi.org/10.1016/S0034-4257(01)00318-2",
    },
    "lswi": {
        "formula": "(NIR - SWIR1) / (NIR + SWIR1)",
        "domain": "land_surface_water",
        "reference": "https://doi.org/10.1016/j.rse.2003.11.008",
    },
    "bsi": {
        "formula": "((SWIR1 + RED) - (NIR + BLUE)) / ((SWIR1 + RED) + (NIR + BLUE))",
        "domain": "bare_soil_screening",
        "reference": "FOGGARA formula registry; literature cross-check required for interpretation",
    },
}


def operational_quality_indicator(valid_fraction: float, provider_cloud_cover_pct: float | None) -> dict:
    """Return a transparent FOGGARA usability indicator.

    This is NOT a QA4EO certification or measurement uncertainty. It is an
    operational screening score based only on usable-pixel fraction and scene-
    level provider cloud metadata, with its basis returned alongside the score.
    """
    valid = min(1.0, max(0.0, float(valid_fraction)))
    cloud = 0.0 if provider_cloud_cover_pct is None else min(100.0, max(0.0, float(provider_cloud_cover_pct)))
    clear_fraction = 1.0 - cloud / 100.0
    score = round(100.0 * (0.8 * valid + 0.2 * clear_fraction), 1)
    if score >= 85:
        grade, usability = "A", "strong"
    elif score >= 70:
        grade, usability = "B", "usable"
    elif score >= 50:
        grade, usability = "C", "limited"
    else:
        grade, usability = "D", "poor"
    return {
        "score": score,
        "grade": grade,
        "usability": usability,
        "basis": {
            "valid_pixel_fraction": round(valid, 6),
            "provider_cloud_cover_pct": None if provider_cloud_cover_pct is None else round(cloud, 3),
            "weights": {"valid_pixels": 0.8, "scene_cloud_metadata": 0.2},
        },
        "standard_claim": False,
        "note": "FOGGARA operational screening indicator; not a formal uncertainty estimate or QA4EO certification.",
    }


def acquisition_age_hours(acquired_at: str | None) -> float | None:
    if not acquired_at:
        return None
    try:
        parsed = datetime.fromisoformat(acquired_at.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        hours = (datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)).total_seconds() / 3600.0
        if not math.isfinite(hours):
            return None
        return round(max(0.0, hours), 1)
    except ValueError:
        return None


def public_methodology() -> dict:
    return {
        "quality_framework": "QA4EO-inspired traceability; no certification claimed",
        "evidence_chain": {
            "provider_metadata": "OBSERVED",
            "surface_reflectance_raster": "OBSERVED",
            "spectral_index": "COMPUTED",
            "multi_temporal_interpretation": "INFERRED",
            "field_confirmed_result": "VERIFIED only after independent validation",
        },
        "standards_and_guidance": STANDARDS_AND_GUIDANCE,
        "open_source_method_references": OPEN_SOURCE_METHOD_REFERENCES,
        "study_recipes": STUDY_RECIPES,
        "index_literature": INDEX_LITERATURE,
    }
