"""Open iSDAsoil context adapter for Africa.

Uses only fixed public iSDAsoil Cloud Optimized GeoTIFFs from the AWS Registry
of Open Data. Values are model predictions, not field measurements. FOGGARA
therefore reports them as INFERRED provider context and never VERIFIED.

The first operational slice deliberately uses soil physical properties whose
published iSDA products are already in direct physical units:
- clay content (%)
- sand content (%)
- silt content (%)
- bulk density (g/cm3)

Chemical properties such as pH/N/P/K remain separate until their product
transform contracts are explicitly validated or supplied as verified lab data.
"""
from __future__ import annotations

import math
from typing import Mapping

import numpy as np
import rasterio
from rasterio.errors import RasterioError
from rasterio.warp import transform

ISDA_HOST = "isdasoil.s3.amazonaws.com"
ISDA_BASE = f"https://{ISDA_HOST}/soil_data"

PRODUCTS: dict[str, dict] = {
    "clay_content": {
        "url": f"{ISDA_BASE}/clay_content/clay_content.tif",
        "label": "Clay content",
        "unit": "%",
        "resolution_m": 30,
    },
    "sand_content": {
        "url": f"{ISDA_BASE}/sand_content/sand_content.tif",
        "label": "Sand content",
        "unit": "%",
        "resolution_m": 30,
    },
    "silt_content": {
        "url": f"{ISDA_BASE}/silt_content/silt_content.tif",
        "label": "Silt content",
        "unit": "%",
        "resolution_m": 30,
    },
    "bulk_density": {
        "url": f"{ISDA_BASE}/bulk_density/bulk_density.tif",
        "label": "Bulk density",
        "unit": "g/cm3",
        "resolution_m": 30,
    },
}


class SoilContextError(ValueError):
    pass


def _validate_bbox(values) -> tuple[float, float, float, float]:
    if not isinstance(values, (list, tuple)) or len(values) != 4:
        raise SoilContextError("soil context bbox must contain four coordinates")
    try:
        west, south, east, north = (float(value) for value in values)
    except (TypeError, ValueError) as exc:
        raise SoilContextError("soil context bbox must be numeric") from exc
    if not all(math.isfinite(v) for v in (west, south, east, north)):
        raise SoilContextError("soil context bbox must be finite")
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise SoilContextError("soil context bbox is invalid")
    return west, south, east, north


def _sample_points(bbox: tuple[float, float, float, float]) -> list[tuple[float, float]]:
    west, south, east, north = bbox
    cx, cy = (west + east) / 2.0, (south + north) / 2.0
    qx = (east - west) * 0.22
    qy = (north - south) * 0.22
    return [
        (cx, cy),
        (cx - qx, cy - qy),
        (cx + qx, cy - qy),
        (cx - qx, cy + qy),
        (cx + qx, cy + qy),
    ]


def _finite_values(values) -> list[float]:
    result: list[float] = []
    for value in values:
        if np.ma.is_masked(value):
            continue
        number = float(value)
        if math.isfinite(number):
            result.append(number)
    return result


def _sample_product(product: Mapping, points_wgs84: list[tuple[float, float]]) -> dict:
    url = str(product["url"])
    try:
        with rasterio.Env(
            GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR",
            CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif,.TIF",
            GDAL_HTTP_MAX_RETRY="1",
            GDAL_HTTP_RETRY_DELAY="0.2",
            GDAL_HTTP_TIMEOUT="10",
            GDAL_HTTP_CONNECTTIMEOUT="5",
            AWS_NO_SIGN_REQUEST="YES",
        ):
            with rasterio.open(url, sharing=False) as src:
                if src.crs is None:
                    raise SoilContextError("iSDAsoil raster has no CRS")
                xs, ys = transform(
                    "EPSG:4326",
                    src.crs,
                    [p[0] for p in points_wgs84],
                    [p[1] for p in points_wgs84],
                )
                coords = list(zip(xs, ys))
                mean_samples = list(src.sample(coords, indexes=1, masked=True))
                stdev_samples = list(src.sample(coords, indexes=3, masked=True))
                means = _finite_values(sample[0] for sample in mean_samples)
                stdevs = _finite_values(sample[0] for sample in stdev_samples)
    except SoilContextError:
        raise
    except (RasterioError, OSError, ValueError) as exc:
        raise SoilContextError("iSDAsoil public COG could not be sampled") from exc

    if not means:
        return {
            "status": "NO_DATA",
            "mean_0_20": None,
            "spatial_spread": None,
            "prediction_stdev_0_20": None,
            "sample_count": 0,
        }

    return {
        "status": "AVAILABLE",
        "mean_0_20": round(float(np.mean(means)), 4),
        "spatial_spread": round(float(np.std(means)), 4) if len(means) > 1 else 0.0,
        "prediction_stdev_0_20": round(float(np.mean(stdevs)), 4) if stdevs else None,
        "sample_count": len(means),
    }


def sample_soil_context(bbox) -> dict:
    validated = _validate_bbox(bbox)
    points = _sample_points(validated)
    properties = {}
    unavailable = []
    for key, product in PRODUCTS.items():
        try:
            value = _sample_product(product, points)
        except SoilContextError:
            value = {
                "status": "UNAVAILABLE",
                "mean_0_20": None,
                "spatial_spread": None,
                "prediction_stdev_0_20": None,
                "sample_count": 0,
            }
            unavailable.append(key)
        properties[key] = {
            **value,
            "label": product["label"],
            "unit": product["unit"],
            "resolution_m": product["resolution_m"],
            "depth_cm": "0-20",
        }

    available = [key for key, value in properties.items() if value["status"] == "AVAILABLE"]
    return {
        "provider": "iSDAsoil",
        "source": "AWS Registry of Open Data / public iSDAsoil COGs",
        "bbox_wgs84": list(validated),
        "sampling": "AOI centre + four interior points",
        "resolution_m": 30,
        "properties": properties,
        "available_properties": available,
        "unavailable_properties": unavailable,
        "evidence_status": "INFERRED",
        "verified": False,
        "uncertainty": "Provider prediction standard deviation is reported when available.",
        "limitations": [
            "These are spatial model predictions, not laboratory measurements.",
            "Chemical properties pH/N/P/K are intentionally not inferred by this adapter.",
            "Use verified local soil samples for agronomic prescriptions and VERIFIED evidence.",
        ],
        "attribution": "iSDAsoil / CC BY 4.0",
    }
