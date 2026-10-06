"""Vectorized Sentinel-2 index computation and SCL masking.

This module contains no network or persistence code. The caller must provide
already trusted/local raster inputs derived from FOGGARA's processing contract.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
from pathlib import Path
from typing import Mapping

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.warp import reproject
from rio_cogeo.cogeo import cog_translate, cog_validate
from rio_cogeo.profiles import cog_profiles


MASKED_SCL_CLASSES = frozenset({0, 1, 3, 8, 9, 10, 11})
SUPPORTED_INDICES = frozenset({"ndvi", "evi", "savi", "ndwi"})
PROCESSOR_VERSION = "foggara-raster-core-v1"


@dataclass(frozen=True)
class BandCalibration:
    scale: float = 1.0
    offset: float = 0.0


class RasterProcessingError(ValueError):
    pass


def _finite_scalar(value: float, name: str) -> float:
    number = float(value)
    if not math.isfinite(number):
        raise RasterProcessingError(f"{name} must be finite")
    return number


def calibrate_reflectance(
    values: np.ndarray,
    calibration: BandCalibration,
) -> np.ndarray:
    scale = _finite_scalar(calibration.scale, "scale")
    offset = _finite_scalar(calibration.offset, "offset")
    array = np.asarray(values, dtype=np.float32)
    return array * np.float32(scale) + np.float32(offset)


def compute_index_array(
    index: str,
    bands: Mapping[str, np.ndarray],
    *,
    savi_l: float = 0.5,
) -> np.ndarray:
    key = index.strip().lower()
    if key not in SUPPORTED_INDICES:
        raise RasterProcessingError(f"unsupported index: {index}")

    required = {
        "ndvi": ("B04", "B08"),
        "evi": ("B02", "B04", "B08"),
        "savi": ("B04", "B08"),
        "ndwi": ("B03", "B08"),
    }[key]
    missing = [band for band in required if band not in bands]
    if missing:
        raise RasterProcessingError(f"missing bands: {', '.join(missing)}")

    arrays = {band: np.asarray(bands[band], dtype=np.float32) for band in required}
    shapes = {array.shape for array in arrays.values()}
    if len(shapes) != 1:
        raise RasterProcessingError("all spectral bands must share one grid")

    if key == "ndvi":
        numerator = arrays["B08"] - arrays["B04"]
        denominator = arrays["B08"] + arrays["B04"]
        factor = 1.0
    elif key == "evi":
        numerator = arrays["B08"] - arrays["B04"]
        denominator = arrays["B08"] + 6.0 * arrays["B04"] - 7.5 * arrays["B02"] + 1.0
        factor = 2.5
    elif key == "savi":
        l_value = _finite_scalar(savi_l, "savi_l")
        if not 0.0 <= l_value <= 1.0:
            raise RasterProcessingError("savi_l must be between 0 and 1")
        numerator = arrays["B08"] - arrays["B04"]
        denominator = arrays["B08"] + arrays["B04"] + l_value
        factor = 1.0 + l_value
    else:
        numerator = arrays["B03"] - arrays["B08"]
        denominator = arrays["B03"] + arrays["B08"]
        factor = 1.0

    result = np.full(numerator.shape, np.nan, dtype=np.float32)
    finite = np.isfinite(numerator) & np.isfinite(denominator)
    valid = finite & (np.abs(denominator) > np.float32(1e-12))
    np.divide(
        np.float32(factor) * numerator,
        denominator,
        out=result,
        where=valid,
    )
    return result


def apply_scl_mask(values: np.ndarray, scl: np.ndarray) -> np.ndarray:
    result = np.asarray(values, dtype=np.float32).copy()
    scl_array = np.asarray(scl)
    if result.shape != scl_array.shape:
        raise RasterProcessingError("SCL grid must match the index grid")
    invalid = ~np.isfinite(result) | np.isin(scl_array, tuple(MASKED_SCL_CLASSES))
    result[invalid] = np.nan
    return result


def resample_scl_to_grid(
    scl: np.ndarray,
    *,
    src_transform,
    src_crs,
    dst_shape: tuple[int, int],
    dst_transform,
    dst_crs,
) -> np.ndarray:
    destination = np.zeros(dst_shape, dtype=np.uint8)
    reproject(
        source=np.asarray(scl, dtype=np.uint8),
        destination=destination,
        src_transform=src_transform,
        src_crs=src_crs,
        dst_transform=dst_transform,
        dst_crs=dst_crs,
        resampling=Resampling.nearest,
        src_nodata=0,
        dst_nodata=0,
    )
    return destination


def finite_statistics(values: np.ndarray) -> dict:
    array = np.asarray(values, dtype=np.float32)
    finite = array[np.isfinite(array)]
    if finite.size == 0:
        return {
            "min": None,
            "max": None,
            "mean": None,
            "median": None,
            "valid_pixel_count": 0,
        }
    return {
        "min": float(np.min(finite)),
        "max": float(np.max(finite)),
        "mean": float(np.mean(finite)),
        "median": float(np.median(finite)),
        "valid_pixel_count": int(finite.size),
    }


def write_cog(
    values: np.ndarray,
    *,
    transform,
    crs,
    output_path: str | Path,
) -> dict:
    output = Path(output_path)
    if output.suffix.lower() not in {".tif", ".tiff"}:
        raise RasterProcessingError("COG output must use a .tif or .tiff suffix")
    output.parent.mkdir(parents=True, exist_ok=True)

    array = np.asarray(values, dtype=np.float32)
    if array.ndim != 2:
        raise RasterProcessingError("COG output expects one 2D index band")

    temp = output.with_suffix(output.suffix + ".partial")
    profile = {
        "driver": "GTiff",
        "height": array.shape[0],
        "width": array.shape[1],
        "count": 1,
        "dtype": "float32",
        "crs": crs,
        "transform": transform,
        "nodata": np.nan,
        "tiled": True,
        "blockxsize": min(256, array.shape[1]),
        "blockysize": min(256, array.shape[0]),
        "compress": "DEFLATE",
    }

    try:
        with rasterio.open(temp, "w", **profile) as dataset:
            dataset.write(array, 1)

        cog_profile = cog_profiles.get("deflate").copy()
        cog_profile.update({"blocksize": 256})
        cog_translate(
            str(temp),
            str(output),
            cog_profile,
            in_memory=False,
            quiet=True,
        )
        valid, errors, warnings = cog_validate(str(output), strict=True)
        if not valid:
            raise RasterProcessingError(
                "COG validation failed: " + "; ".join([*errors, *warnings])
            )
    finally:
        temp.unlink(missing_ok=True)

    sha256 = hashlib.sha256(output.read_bytes()).hexdigest()
    return {
        "path": str(output),
        "sha256": sha256,
        "bytes": output.stat().st_size,
        "format": "COG",
        "dtype": "float32",
    }


def provenance_document(
    *,
    scene_id: str,
    index: str,
    formula_version: str,
    processing_plan_fingerprint: str,
    output: Mapping,
    statistics: Mapping,
) -> dict:
    document = {
        "processor_version": PROCESSOR_VERSION,
        "scene_id": scene_id,
        "index": index,
        "formula_version": formula_version,
        "processing_plan_fingerprint": processing_plan_fingerprint,
        "output": dict(output),
        "statistics": dict(statistics),
        "evidence_status": "COMPUTED",
        "verified": False,
        "scl_masked_classes": sorted(MASKED_SCL_CLASSES),
    }
    canonical = json.dumps(document, sort_keys=True, separators=(",", ":")).encode()
    document["provenance_sha256"] = hashlib.sha256(canonical).hexdigest()
    return document
