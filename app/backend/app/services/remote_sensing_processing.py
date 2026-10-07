"""Safe processing-plan contract for Sentinel-2 raster work.

This module resolves only fixed-provider Earth Search STAC Items and only the
public Sentinel-2 COG bucket. It never accepts user-supplied URLs. Heavy raster
IO (GDAL/rasterio), COG writing and tiling live in a separate processor later.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import math
import re
from typing import Mapping
from urllib.parse import quote, unquote, urlsplit

from .remote_sensing_indices import get_index_definition


EARTH_SEARCH_ITEM_ROOT = (
    "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items"
)
SENTINEL_COLLECTION = "sentinel-2-l2a"
TRUSTED_COG_HOST = "sentinel-cogs.s3.us-west-2.amazonaws.com"
TRUSTED_COG_PATH_PREFIX = "/sentinel-s2-l2a-cogs/"
SCENE_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{1,159}$")
SCL_ASSET_ALIASES = ("scl", "SCL")
MASKED_SCL_CLASSES = (0, 1, 3, 8, 9, 10, 11)
PLAN_VERSION = "foggara-raster-plan-v1"

RGB_BAND_ALIASES = {
    "B04": ("red", "B04"),
    "B03": ("green", "B03"),
    "B02": ("blue", "B02"),
}


class ProcessingPlanError(ValueError):
    pass


@dataclass(frozen=True)
class ResolvedAsset:
    band: str
    asset_key: str
    href: str
    media_type: str
    gsd_m: float | None
    scale: float | None
    offset: float | None

    def public_dict(self) -> dict:
        parsed = urlsplit(self.href)
        return {
            "band": self.band,
            "asset_key": self.asset_key,
            "host": parsed.hostname,
            "path": parsed.path,
            "media_type": self.media_type,
            "gsd_m": self.gsd_m,
            "scale": self.scale,
            "offset": self.offset,
        }


def validate_scene_id(scene_id: str) -> str:
    candidate = scene_id.strip()
    if not SCENE_ID_RE.fullmatch(candidate):
        raise ProcessingPlanError("scene_id contains unsupported characters")
    return candidate


def item_url(scene_id: str) -> str:
    safe_id = validate_scene_id(scene_id)
    return f"{EARTH_SEARCH_ITEM_ROOT}/{quote(safe_id, safe='')}"


def _finite_optional(value) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        raise ProcessingPlanError("numeric raster metadata must not be boolean")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ProcessingPlanError("numeric raster metadata must be numeric") from exc
    if not math.isfinite(number):
        raise ProcessingPlanError("numeric raster metadata must be finite")
    return number


def _raster_scale_offset(asset: Mapping) -> tuple[float | None, float | None]:
    bands = asset.get("raster:bands")
    if not isinstance(bands, list) or not bands or not isinstance(bands[0], Mapping):
        return None, None
    metadata = bands[0]
    return _finite_optional(metadata.get("scale")), _finite_optional(metadata.get("offset"))


def _validate_cog_href(href: str) -> str:
    parsed = urlsplit(href)
    if parsed.scheme != "https":
        raise ProcessingPlanError("raster asset must use https")
    if parsed.username or parsed.password:
        raise ProcessingPlanError("raster asset must not contain credentials")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ProcessingPlanError("raster asset uses an invalid port") from exc
    if port not in (None, 443):
        raise ProcessingPlanError("raster asset uses an unsupported port")
    if parsed.hostname != TRUSTED_COG_HOST:
        raise ProcessingPlanError("raster asset host is not trusted")
    decoded_path = unquote(parsed.path)
    if not decoded_path.startswith(TRUSTED_COG_PATH_PREFIX):
        raise ProcessingPlanError("raster asset path is outside the Sentinel-2 COG prefix")
    if any(part in {".", ".."} for part in decoded_path.split("/")):
        raise ProcessingPlanError("raster asset path contains traversal segments")
    if not decoded_path.lower().endswith(".tif"):
        raise ProcessingPlanError("raster asset is not a GeoTIFF")
    if parsed.query or parsed.fragment:
        raise ProcessingPlanError("raster asset URL must be immutable and unsigned")
    return href


def _resolve_asset(
    assets: Mapping,
    *,
    logical_band: str,
    aliases: tuple[str, ...],
) -> ResolvedAsset:
    for key in aliases:
        candidate = assets.get(key)
        if not isinstance(candidate, Mapping):
            continue
        href = candidate.get("href")
        media_type = candidate.get("type")
        if not isinstance(href, str) or not isinstance(media_type, str):
            continue
        normalized_media_type = media_type.lower()
        if not normalized_media_type.startswith("image/tiff"):
            continue
        if "profile=cloud-optimized" not in normalized_media_type:
            continue
        safe_href = _validate_cog_href(href)
        scale, offset = _raster_scale_offset(candidate)
        return ResolvedAsset(
            band=logical_band,
            asset_key=key,
            href=safe_href,
            media_type=media_type,
            gsd_m=_finite_optional(candidate.get("gsd")),
            scale=scale,
            offset=offset,
        )
    raise ProcessingPlanError(
        f"required COG asset for {logical_band} is missing or unsupported"
    )


def build_processing_plan(item: Mapping, index_key: str) -> dict:
    scene_id = validate_scene_id(str(item.get("id") or ""))
    if item.get("collection") != SENTINEL_COLLECTION:
        raise ProcessingPlanError("STAC item is not from the Sentinel-2 L2A collection")

    assets = item.get("assets")
    if not isinstance(assets, Mapping):
        raise ProcessingPlanError("STAC item has no asset map")

    definition = get_index_definition(index_key)
    resolved: list[ResolvedAsset] = []
    for band in definition.required_bands:
        resolved.append(
            _resolve_asset(
                assets,
                logical_band=band,
                aliases=tuple(definition.stac_assets[band]),
            )
        )

    scl = _resolve_asset(
        assets,
        logical_band="SCL",
        aliases=SCL_ASSET_ALIASES,
    )

    public_assets = [asset.public_dict() for asset in resolved]
    public_scl = scl.public_dict()
    fingerprint_input = {
        "scene_id": scene_id,
        "collection": SENTINEL_COLLECTION,
        "index": definition.key,
        "formula_version": definition.formula_version,
        "assets": public_assets,
        "scl": public_scl,
        "masked_scl_classes": list(MASKED_SCL_CLASSES),
        "target_resolution_m": 10,
    }
    fingerprint = hashlib.sha256(
        json.dumps(fingerprint_input, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()

    return {
        "plan_version": PLAN_VERSION,
        "fingerprint_sha256": fingerprint,
        "provider": "Element 84 Earth Search",
        "collection": SENTINEL_COLLECTION,
        "scene_id": scene_id,
        "index": definition.key,
        "formula_version": definition.formula_version,
        "source_item_url": item_url(scene_id),
        "target_resolution_m": 10,
        "required_assets": public_assets,
        "cloud_mask": {
            "asset": public_scl,
            "method": "sentinel-2-scl",
            "masked_classes": list(MASKED_SCL_CLASSES),
            "resampling": "nearest",
        },
        "output_contract": {
            "format": "COG",
            "dtype": "float32",
            "nodata": "nan",
            "statistics": ["min", "max", "mean", "median", "valid_pixel_count"],
        },
        "provenance": {
            "provider_metadata": "OBSERVED",
            "derived_index": "COMPUTED",
            "verified": False,
        },
    }


def build_true_color_plan(item: Mapping) -> dict:
    """Build a fixed-provider Sentinel-2 RGB preview plan."""
    scene_id = validate_scene_id(str(item.get("id") or ""))
    if item.get("collection") != SENTINEL_COLLECTION:
        raise ProcessingPlanError("STAC item is not from the Sentinel-2 L2A collection")
    assets = item.get("assets")
    if not isinstance(assets, Mapping):
        raise ProcessingPlanError("STAC item has no asset map")

    resolved = [
        _resolve_asset(assets, logical_band=band, aliases=aliases)
        for band, aliases in RGB_BAND_ALIASES.items()
    ]
    scl = _resolve_asset(assets, logical_band="SCL", aliases=SCL_ASSET_ALIASES)
    public_assets = [asset.public_dict() for asset in resolved]
    public_scl = scl.public_dict()
    fingerprint_input = {
        "scene_id": scene_id,
        "collection": SENTINEL_COLLECTION,
        "kind": "true_color",
        "assets": public_assets,
        "scl": public_scl,
        "masked_scl_classes": list(MASKED_SCL_CLASSES),
        "target_resolution_m": 10,
    }
    fingerprint = hashlib.sha256(
        json.dumps(fingerprint_input, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return {
        "plan_version": PLAN_VERSION,
        "fingerprint_sha256": fingerprint,
        "provider": "Element 84 Earth Search",
        "collection": SENTINEL_COLLECTION,
        "scene_id": scene_id,
        "kind": "true_color",
        "source_item_url": item_url(scene_id),
        "target_resolution_m": 10,
        "required_assets": public_assets,
        "cloud_mask": {
            "asset": public_scl,
            "method": "sentinel-2-scl",
            "masked_classes": list(MASKED_SCL_CLASSES),
            "resampling": "nearest",
        },
        "provenance": {
            "provider_metadata": "OBSERVED",
            "rgb_visualization": "COMPUTED",
            "verified": False,
        },
    }
