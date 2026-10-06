"""Bounded live raster statistics for trusted Sentinel-2 COG assets.

This processor executes only plans produced by remote_sensing_processing. It
reads immutable COGs from the fixed Sentinel bucket, aligns required bands to a
10 m grid, applies the Sentinel-2 Scene Classification Layer mask, computes one
FOGGARA index, and returns statistics. It does not persist imagery or products.
"""
from __future__ import annotations

import math
import struct
import threading
import zlib
from typing import Mapping

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.errors import RasterioError
from rasterio.features import geometry_mask
from rasterio.transform import from_bounds
from rasterio.vrt import WarpedVRT
from rasterio.warp import transform_bounds, transform_geom

from .remote_sensing_indices import compute_index, get_index_definition
from .remote_sensing_processing import (
    MASKED_SCL_CLASSES,
    TRUSTED_COG_HOST,
    TRUSTED_COG_PATH_PREFIX,
)

TARGET_RESOLUTION_M = 10.0
MAX_ANALYSIS_PIXELS = 1_000_000
MAX_AXIS_PIXELS = 2_048


class RasterStatisticsError(ValueError):
    pass


class RasterCapacityError(RasterStatisticsError):
    pass


_RASTER_ANALYSIS_SEMAPHORE = threading.BoundedSemaphore(value=1)


def validate_analysis_bbox(values) -> tuple[float, float, float, float]:
    if not isinstance(values, (list, tuple)) or len(values) != 4:
        raise RasterStatisticsError("analysis bbox must contain four coordinates")
    try:
        west, south, east, north = (float(value) for value in values)
    except (TypeError, ValueError) as exc:
        raise RasterStatisticsError("analysis bbox coordinates must be numeric") from exc
    if not all(math.isfinite(value) for value in (west, south, east, north)):
        raise RasterStatisticsError("analysis bbox coordinates must be finite")
    if not (-180 <= west < east <= 180 and -90 <= south < north <= 90):
        raise RasterStatisticsError(
            "analysis bbox must be a non-crossing WGS84 rectangle with increasing coordinates"
        )

    mid_lat = math.radians((south + north) / 2.0)
    width_m = (east - west) * 111_320.0 * max(math.cos(mid_lat), 0.01)
    height_m = (north - south) * 110_574.0
    estimated_width = max(1, math.ceil(width_m / TARGET_RESOLUTION_M))
    estimated_height = max(1, math.ceil(height_m / TARGET_RESOLUTION_M))
    if (
        estimated_width > MAX_AXIS_PIXELS
        or estimated_height > MAX_AXIS_PIXELS
        or estimated_width * estimated_height > MAX_ANALYSIS_PIXELS
    ):
        raise RasterStatisticsError(
            "analysis bbox is too large for synchronous 10 m processing"
        )
    return west, south, east, north


def _asset_href(asset: Mapping) -> str:
    host = asset.get("host")
    path = asset.get("path")
    if host != TRUSTED_COG_HOST:
        raise RasterStatisticsError("processing plan asset host is not trusted")
    if not isinstance(path, str) or not path.startswith(TRUSTED_COG_PATH_PREFIX):
        raise RasterStatisticsError("processing plan asset path is outside the trusted prefix")
    if not path.lower().endswith(".tif"):
        raise RasterStatisticsError("processing plan asset is not a GeoTIFF")
    return f"https://{host}{path}"


def _open_asset(href: str):
    return rasterio.open(href, sharing=False)


def _read_aligned(
    asset: Mapping,
    *,
    target_crs,
    target_transform,
    width: int,
    height: int,
    resampling: Resampling,
) -> tuple[np.ndarray, np.ndarray]:
    href = _asset_href(asset)
    with _open_asset(href) as source:
        if source.crs is None:
            raise RasterStatisticsError("raster asset has no CRS")
        with WarpedVRT(
            source,
            crs=target_crs,
            transform=target_transform,
            width=width,
            height=height,
            resampling=resampling,
        ) as vrt:
            data = vrt.read(1, masked=True)
    values = np.asarray(data.filled(np.nan), dtype=np.float32)
    mask = np.ma.getmaskarray(data) | ~np.isfinite(values)
    return values, np.asarray(mask, dtype=bool)


def _scaled(values: np.ndarray, asset: Mapping) -> np.ndarray:
    scale = asset.get("scale")
    offset = asset.get("offset")
    scale_value = 1.0 if scale is None else float(scale)
    offset_value = 0.0 if offset is None else float(offset)
    if not math.isfinite(scale_value) or not math.isfinite(offset_value):
        raise RasterStatisticsError("raster scale and offset must be finite")
    return values * np.float32(scale_value) + np.float32(offset_value)


def _ratio_array(numerator: np.ndarray, denominator: np.ndarray) -> np.ndarray:
    result = np.full(numerator.shape, np.nan, dtype=np.float32)
    valid = np.isfinite(numerator) & np.isfinite(denominator) & (np.abs(denominator) > 1e-12)
    np.divide(numerator, denominator, out=result, where=valid)
    return result


def _compute_index_array(index_key: str, bands: Mapping[str, np.ndarray]) -> np.ndarray:
    definition = get_index_definition(index_key)
    if definition.key == "ndvi":
        nir, red = bands["B08"], bands["B04"]
        return _ratio_array(nir - red, nir + red)
    if definition.key == "evi":
        nir, red, blue = bands["B08"], bands["B04"], bands["B02"]
        return np.float32(2.5) * _ratio_array(
            nir - red,
            nir + np.float32(6.0) * red - np.float32(7.5) * blue + np.float32(1.0),
        )
    if definition.key == "savi":
        nir, red = bands["B08"], bands["B04"]
        return np.float32(1.5) * _ratio_array(
            nir - red,
            nir + red + np.float32(0.5),
        )
    if definition.key == "ndwi":
        green, nir = bands["B03"], bands["B08"]
        return _ratio_array(green - nir, green + nir)
    if definition.key in {"ndmi", "lswi"}:
        nir, swir = bands["B08"], bands["B11"]
        return _ratio_array(nir - swir, nir + swir)
    raise RasterStatisticsError(f"unsupported index: {definition.key}")


def _target_grid(
    reference_asset: Mapping,
    bbox: tuple[float, float, float, float],
):
    href = _asset_href(reference_asset)
    with _open_asset(href) as source:
        if source.crs is None or not source.crs.is_projected:
            raise RasterStatisticsError("Sentinel raster must use a projected CRS")
        projected = transform_bounds(
            "EPSG:4326",
            source.crs,
            *bbox,
            densify_pts=21,
        )
        left, bottom, right, top = projected
        if not all(math.isfinite(value) for value in projected) or right <= left or top <= bottom:
            raise RasterStatisticsError("analysis bbox cannot be projected onto the raster grid")
        width = max(1, math.ceil((right - left) / TARGET_RESOLUTION_M))
        height = max(1, math.ceil((top - bottom) / TARGET_RESOLUTION_M))
        if (
            width > MAX_AXIS_PIXELS
            or height > MAX_AXIS_PIXELS
            or width * height > MAX_ANALYSIS_PIXELS
        ):
            raise RasterStatisticsError(
                "projected analysis window exceeds the synchronous pixel budget"
            )
        transform = from_bounds(left, bottom, right, top, width, height)
        return source.crs, transform, width, height


def _compute_index_statistics_unlocked(
    plan: Mapping,
    bbox,
    geometry_wgs84: Mapping | None = None,
) -> dict:
    analysis_bbox = validate_analysis_bbox(bbox)
    assets = plan.get("required_assets")
    cloud_mask = plan.get("cloud_mask")
    if not isinstance(assets, list) or not assets or not isinstance(cloud_mask, Mapping):
        raise RasterStatisticsError("processing plan is incomplete")
    scl_asset = cloud_mask.get("asset")
    if not isinstance(scl_asset, Mapping):
        raise RasterStatisticsError("processing plan has no SCL asset")

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
            target_crs, target_transform, width, height = _target_grid(assets[0], analysis_bbox)

            band_arrays: dict[str, np.ndarray] = {}
            source_invalid = np.zeros((height, width), dtype=bool)
            for asset in assets:
                if not isinstance(asset, Mapping) or not isinstance(asset.get("band"), str):
                    raise RasterStatisticsError("processing plan contains an invalid band asset")
                values, invalid = _read_aligned(
                    asset,
                    target_crs=target_crs,
                    target_transform=target_transform,
                    width=width,
                    height=height,
                    resampling=Resampling.bilinear,
                )
                scaled = _scaled(values, asset)
                source_invalid |= invalid | ~np.isfinite(scaled)
                band_arrays[str(asset["band"])] = scaled

            scl_values, scl_invalid = _read_aligned(
                scl_asset,
                target_crs=target_crs,
                target_transform=target_transform,
                width=width,
                height=height,
                resampling=Resampling.nearest,
            )
    except RasterStatisticsError:
        raise
    except (RasterioError, OSError, ValueError) as exc:
        raise RasterStatisticsError("trusted Sentinel raster could not be read") from exc

    safe_scl = np.where(np.isfinite(scl_values), np.rint(scl_values), -32768.0)
    rounded_scl = safe_scl.astype(np.int16, copy=False)
    cloud_invalid = np.isin(rounded_scl, np.asarray(MASKED_SCL_CLASSES, dtype=np.int16))

    analysis_mask = np.ones((height, width), dtype=bool)
    if geometry_wgs84 is not None:
        if not isinstance(geometry_wgs84, Mapping) or geometry_wgs84.get("type") != "Polygon":
            raise RasterStatisticsError("analysis geometry must be a GeoJSON Polygon")
        try:
            projected_geometry = transform_geom("EPSG:4326", target_crs, geometry_wgs84, precision=9)
            analysis_mask = geometry_mask(
                [projected_geometry],
                out_shape=(height, width),
                transform=target_transform,
                invert=True,
                all_touched=False,
            )
        except (RasterioError, ValueError, TypeError) as exc:
            raise RasterStatisticsError("parcel polygon could not be projected onto the raster grid") from exc
        if not np.any(analysis_mask):
            raise RasterStatisticsError("parcel polygon does not cover any analysis pixels")

    combined_invalid = source_invalid | scl_invalid | cloud_invalid
    index_values = _compute_index_array(str(plan.get("index") or ""), band_arrays)
    formula_invalid = ~np.isfinite(index_values)
    valid_mask = analysis_mask & ~(combined_invalid | formula_invalid)
    valid_values = index_values[valid_mask]

    total_pixels = int(np.count_nonzero(analysis_mask))
    valid_pixels = int(valid_values.size)
    cloud_pixels = int(np.count_nonzero(cloud_invalid & analysis_mask))
    source_nodata_pixels = int(np.count_nonzero((source_invalid | scl_invalid) & analysis_mask))
    formula_nodata_pixels = int(np.count_nonzero(analysis_mask & (~combined_invalid) & formula_invalid))
    outside_geometry_pixels = int(width * height - total_pixels)

    statistics = {
        "min": None,
        "max": None,
        "mean": None,
        "median": None,
    }
    if valid_pixels:
        statistics = {
            "min": float(np.min(valid_values)),
            "max": float(np.max(valid_values)),
            "mean": float(np.mean(valid_values, dtype=np.float64)),
            "median": float(np.median(valid_values)),
        }

        # Cross-check one valid sample against the scalar scientific kernel.
        first_y, first_x = np.argwhere(valid_mask)[0]
        scalar_bands = {
            band: float(values[first_y, first_x])
            for band, values in band_arrays.items()
        }
        scalar = compute_index(str(plan["index"]), scalar_bands)
        if scalar is None or not math.isclose(
            float(index_values[first_y, first_x]),
            float(scalar),
            rel_tol=1e-5,
            abs_tol=1e-6,
        ):
            raise RasterStatisticsError("vectorized index result diverges from scientific kernel")

    return {
        "scene_id": plan.get("scene_id"),
        "index": plan.get("index"),
        "formula_version": plan.get("formula_version"),
        "processing_plan_fingerprint": plan.get("fingerprint_sha256"),
        "analysis_bbox_wgs84": list(analysis_bbox),
        "grid": {
            "crs": str(target_crs),
            "width": width,
            "height": height,
            "resolution_m": TARGET_RESOLUTION_M,
        },
        "mask": {
            "method": cloud_mask.get("method"),
            "masked_scl_classes": list(cloud_mask.get("masked_classes") or []),
            "cloud_masked_pixel_count": cloud_pixels,
            "source_nodata_pixel_count": source_nodata_pixels,
            "formula_nodata_pixel_count": formula_nodata_pixels,
            "geometry_mask_applied": geometry_wgs84 is not None,
            "outside_geometry_pixel_count": outside_geometry_pixels,
        },
        "pixels": {
            "total": total_pixels,
            "valid": valid_pixels,
            "masked": total_pixels - valid_pixels,
            "valid_fraction": (valid_pixels / total_pixels) if total_pixels else 0.0,
        },
        "statistics": statistics,
        "provenance": {
            "provider_metadata": "OBSERVED",
            "derived_index": "COMPUTED",
            "verified": False,
            "persisted": False,
        },
    }



def compute_index_statistics(plan: Mapping, bbox, geometry_wgs84: Mapping | None = None) -> dict:
    """Run one bounded synchronous raster analysis per API instance.

    Heavy raster IO is intentionally fail-fast under contention so authenticated
    callers cannot queue unbounded GDAL work on the web process.
    """
    if not _RASTER_ANALYSIS_SEMAPHORE.acquire(blocking=False):
        raise RasterCapacityError("raster analysis capacity is busy")
    try:
        return _compute_index_statistics_unlocked(plan, bbox, geometry_wgs84=geometry_wgs84)
    finally:
        _RASTER_ANALYSIS_SEMAPHORE.release()



def _png_chunk(kind: bytes, payload: bytes) -> bytes:
    checksum = zlib.crc32(kind)
    checksum = zlib.crc32(payload, checksum) & 0xFFFFFFFF
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", checksum)


def _encode_rgba_png(rgba: np.ndarray) -> bytes:
    if rgba.ndim != 3 or rgba.shape[2] != 4 or rgba.dtype != np.uint8:
        raise RasterStatisticsError("preview image must be uint8 RGBA")
    height, width, _channels = rgba.shape
    if width <= 0 or height <= 0:
        raise RasterStatisticsError("preview image dimensions are invalid")
    scanlines = b"".join(b"\x00" + rgba[row].tobytes() for row in range(height))
    header = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", header)
        + _png_chunk(b"IDAT", zlib.compress(scanlines, level=6))
        + _png_chunk(b"IEND", b"")
    )


def _colorize_index(index_key: str, values: np.ndarray, valid_mask: np.ndarray) -> np.ndarray:
    definition = get_index_definition(index_key)
    low, high = definition.display_range
    span = max(float(high - low), 1e-9)
    normalized = np.clip((values.astype(np.float32) - np.float32(low)) / np.float32(span), 0.0, 1.0)
    normalized = np.where(valid_mask, normalized, 0.0)

    rgba = np.zeros((*values.shape, 4), dtype=np.uint8)
    if definition.colormap_family == "water":
        rgba[..., 0] = np.where(valid_mask, (20 + 20 * normalized).astype(np.uint8), 0)
        rgba[..., 1] = np.where(valid_mask, (90 + 120 * normalized).astype(np.uint8), 0)
        rgba[..., 2] = np.where(valid_mask, (150 + 105 * normalized).astype(np.uint8), 0)
    else:
        rgba[..., 0] = np.where(valid_mask, (220 - 180 * normalized).astype(np.uint8), 0)
        rgba[..., 1] = np.where(valid_mask, (80 + 160 * normalized).astype(np.uint8), 0)
        rgba[..., 2] = np.where(valid_mask, (45 + 35 * (1.0 - normalized)).astype(np.uint8), 0)
    rgba[..., 3] = np.where(valid_mask, 205, 0).astype(np.uint8)
    return rgba


def _render_index_preview_png_unlocked(plan: Mapping, bbox) -> tuple[bytes, dict]:
    analysis_bbox = validate_analysis_bbox(bbox)
    assets = plan.get("required_assets")
    cloud_mask = plan.get("cloud_mask")
    if not isinstance(assets, list) or not assets or not isinstance(cloud_mask, Mapping):
        raise RasterStatisticsError("processing plan is incomplete")
    scl_asset = cloud_mask.get("asset")
    if not isinstance(scl_asset, Mapping):
        raise RasterStatisticsError("processing plan has no SCL asset")

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
            target_crs, target_transform, width, height = _target_grid(assets[0], analysis_bbox)

            band_arrays: dict[str, np.ndarray] = {}
            source_invalid = np.zeros((height, width), dtype=bool)
            for asset in assets:
                if not isinstance(asset, Mapping) or not isinstance(asset.get("band"), str):
                    raise RasterStatisticsError("processing plan contains an invalid band asset")
                values, invalid = _read_aligned(
                    asset,
                    target_crs=target_crs,
                    target_transform=target_transform,
                    width=width,
                    height=height,
                    resampling=Resampling.bilinear,
                )
                scaled = _scaled(values, asset)
                source_invalid |= invalid | ~np.isfinite(scaled)
                band_arrays[str(asset["band"])] = scaled

            scl_values, scl_invalid = _read_aligned(
                scl_asset,
                target_crs=target_crs,
                target_transform=target_transform,
                width=width,
                height=height,
                resampling=Resampling.nearest,
            )
    except RasterStatisticsError:
        raise
    except (RasterioError, OSError, ValueError) as exc:
        raise RasterStatisticsError("trusted Sentinel raster could not be read") from exc

    safe_scl = np.where(np.isfinite(scl_values), np.rint(scl_values), -32768.0)
    rounded_scl = safe_scl.astype(np.int16, copy=False)
    cloud_invalid = np.isin(rounded_scl, np.asarray(MASKED_SCL_CLASSES, dtype=np.int16))
    combined_invalid = source_invalid | scl_invalid | cloud_invalid

    index_values = _compute_index_array(str(plan.get("index") or ""), band_arrays)
    valid_mask = ~(combined_invalid | ~np.isfinite(index_values))
    rgba = _colorize_index(str(plan.get("index") or ""), index_values, valid_mask)
    png = _encode_rgba_png(rgba)
    metadata = {
        "scene_id": plan.get("scene_id"),
        "index": plan.get("index"),
        "formula_version": plan.get("formula_version"),
        "analysis_bbox_wgs84": list(analysis_bbox),
        "width": width,
        "height": height,
        "valid_fraction": float(np.count_nonzero(valid_mask) / max(width * height, 1)),
        "derived_index": "COMPUTED",
        "verified": False,
        "persisted": False,
    }
    return png, metadata


def render_index_preview_png(plan: Mapping, bbox) -> tuple[bytes, dict]:
    if not _RASTER_ANALYSIS_SEMAPHORE.acquire(blocking=False):
        raise RasterCapacityError("raster analysis capacity is busy")
    try:
        return _render_index_preview_png_unlocked(plan, bbox)
    finally:
        _RASTER_ANALYSIS_SEMAPHORE.release()
