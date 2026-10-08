"""Crop-profile and global-project registry for FOGGARA field intelligence.

Crop names are user-declared context unless a separately validated classifier is
connected. The registry changes which signals are highlighted, never the
scientific formulae or evidence status.
"""
from __future__ import annotations


GLOBAL_PROJECTS = [
    {
        "id": "digital-earth-africa-crop-mask",
        "name": "Digital Earth Africa Cropland Extent",
        "license": "Apache-2.0 code / CC BY 4.0 data",
        "role": "cropland extent and Africa EO architecture",
        "status": "reference_architecture",
        "url": "https://github.com/digitalearthafrica/crop-mask",
    },
    {
        "id": "esa-worldcereal",
        "name": "ESA WorldCereal",
        "license": "provider terms / open EO product",
        "role": "10 m global seasonal cropland, crop type and irrigation maps",
        "status": "reference_dataset",
        "url": "https://esa-worldcereal.org/",
    },
    {
        "id": "fao-wapor",
        "name": "FAO WaPOR",
        "license": "FAO open data terms",
        "role": "actual evapotranspiration and water productivity",
        "status": "next_operational_provider",
        "url": "https://www.fao.org/in-action/remote-sensing-for-water-productivity/",
    },
    {
        "id": "isda-soil",
        "name": "iSDAsoil",
        "license": "CC BY 4.0",
        "role": "30 m African soil-property context with prediction uncertainty",
        "status": "operational_context",
        "url": "https://www.isda-africa.com/isdasoil/",
    },
    {
        "id": "dynamic-world",
        "name": "Dynamic World",
        "license": "dataset/provider terms",
        "role": "10 m near-real-time land-cover probabilities",
        "status": "reference_dataset",
        "url": "https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_DYNAMICWORLD_V1",
    },
    {
        "id": "date-palm-wv3",
        "name": "Date Palm Segmentation from WorldView-3",
        "license": "Apache-2.0 code / CC BY 4.0 weights",
        "role": "individual date-palm crown segmentation from very-high-resolution imagery",
        "status": "optional_vhr_module",
        "url": "https://github.com/brakuta/Date-Palm-Tree-Segmentation-from-WorldView3-Satellite-Data",
    },
]


PROFILE_DEFINITIONS = {
    "date_palm": {
        "label": "Date palm",
        "aliases": ["date palm", "palm", "phoenix dactylifera", "نخيل", "نخيل التمر", "palmier dattier", "dattier"],
        "category": "perennial_orchard",
        "priority_indices": ["ndvi", "evi", "ndmi", "lswi", "ndwi", "bsi", "savi"],
        "modules": ["vegetation", "canopy_moisture", "surface_water", "soil_surface", "soil_context", "time_series"],
        "limitations": [
            "Sentinel-2 10 m supports grove-level monitoring, not reliable individual palm counting.",
            "Individual-tree detection requires validated very-high-resolution satellite or aerial imagery.",
            "Red palm weevil or nutrient deficiency cannot be diagnosed from spectral indices alone.",
        ],
    },
    "cereal": {
        "label": "Cereal",
        "aliases": ["wheat", "barley", "oat", "maize", "corn", "blé", "orge", "maïs", "قمح", "شعير", "ذرة"],
        "category": "annual_crop",
        "priority_indices": ["ndvi", "evi", "savi", "ndmi", "lswi", "bsi", "ndwi"],
        "modules": ["vegetation", "phenology", "canopy_moisture", "soil_surface", "soil_context", "time_series"],
        "limitations": ["Crop identity is user-declared unless a validated crop classifier is connected."],
    },
    "vegetable": {
        "label": "Vegetable",
        "aliases": ["potato", "tomato", "onion", "pepper", "carrot", "pomme de terre", "tomate", "oignon", "بطاطا", "طماطم", "بصل"],
        "category": "horticulture",
        "priority_indices": ["ndvi", "evi", "savi", "ndmi", "lswi", "bsi", "ndwi"],
        "modules": ["vegetation", "canopy_moisture", "surface_water", "soil_surface", "soil_context", "time_series"],
        "limitations": ["Crop identity is user-declared unless a validated crop classifier is connected."],
    },
    "orchard": {
        "label": "Orchard",
        "aliases": ["olive", "citrus", "orange", "lemon", "apple", "olivier", "agrumes", "زيتون", "حمضيات", "برتقال", "ليمون", "تفاح"],
        "category": "perennial_orchard",
        "priority_indices": ["ndvi", "evi", "ndmi", "lswi", "savi", "bsi", "ndwi"],
        "modules": ["vegetation", "canopy_moisture", "soil_surface", "soil_context", "time_series"],
        "limitations": ["Tree-level counting requires imagery finer than Sentinel-2 for most orchards."],
    },
    "generic": {
        "label": "Generic crop / land",
        "aliases": [],
        "category": "generic",
        "priority_indices": ["ndvi", "evi", "savi", "ndmi", "lswi", "ndwi", "bsi"],
        "modules": ["vegetation", "canopy_moisture", "surface_water", "soil_surface", "soil_context", "time_series"],
        "limitations": ["Crop identity remains user-declared; this profile performs generic field screening."],
    },
}


def resolve_crop_profile(crop: str | None) -> dict:
    raw = (crop or "").strip()
    normalized = raw.casefold()
    selected_key = "generic"
    for key, profile in PROFILE_DEFINITIONS.items():
        if key == "generic":
            continue
        if normalized and any(alias.casefold() in normalized or normalized in alias.casefold() for alias in profile["aliases"]):
            selected_key = key
            break
    profile = PROFILE_DEFINITIONS[selected_key]
    return {
        "id": selected_key,
        "label": profile["label"],
        "declared_crop": raw or None,
        "crop_identity_status": "USER_DECLARED" if raw else "UNSPECIFIED",
        "category": profile["category"],
        "priority_indices": list(profile["priority_indices"]),
        "modules": list(profile["modules"]),
        "limitations": list(profile["limitations"]),
    }


def public_field_capabilities() -> dict:
    return {
        "workflow": [
            "DRAW_OR_SELECT_AOI",
            "SAVE_FIELD",
            "FETCH_RECENT_SENTINEL",
            "COMPUTE_MULTI_INDEX",
            "SAMPLE_SOIL_CONTEXT",
            "RUN_TIME_SERIES",
            "REVIEW_EVIDENCE_AND_LIMITATIONS",
        ],
        "crop_profiles": [
            {
                "id": key,
                "label": value["label"],
                "category": value["category"],
                "priority_indices": value["priority_indices"],
            }
            for key, value in PROFILE_DEFINITIONS.items()
        ],
        "global_projects": GLOBAL_PROJECTS,
        "evidence_contract": {
            "satellite_source": "OBSERVED",
            "spectral_indices": "COMPUTED",
            "soil_spatial_model": "INFERRED",
            "crop_identity": "USER_DECLARED unless separately classified",
            "agronomic_interpretation": "INFERRED",
            "field_or_lab_validation": "VERIFIED only after independent validation",
        },
    }
