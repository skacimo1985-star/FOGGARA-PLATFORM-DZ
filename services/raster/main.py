"""Restricted Sentinel-2 raster tile service for FOGGARA-DZ.

The service accepts only fixed Earth Search Sentinel-2 L2A scene identifiers and
three reviewed layers. It never accepts arbitrary URLs. Tile access requires a
short-lived HMAC signature issued by the authenticated FOGGARA API.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import re
import time
from urllib.parse import quote

from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from rio_tiler.colormap import cmap
from rio_tiler.errors import RioTilerError, TileOutsideBounds
from rio_tiler.io import STACReader

EARTH_SEARCH_ITEM_ROOT = (
    "https://earth-search.aws.element84.com/v1/collections/"
    "sentinel-2-l2a/items"
)
SCENE_RE = re.compile(r"^[A-Za-z0-9._-]{10,200}$")
LAYERS = {"true-color", "ndvi", "ndwi"}
MAX_TOKEN_TTL_SECONDS = 900


def _allowed_origins() -> list[str]:
    raw = os.environ.get(
        "ALLOWED_ORIGINS",
        "https://foggara-dz.onrender.com,https://foggara-staging.onrender.com",
    )
    return [value.strip().rstrip("/") for value in raw.split(",") if value.strip()]


app = FastAPI(
    title="FOGGARA Raster",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["Accept"],
)


def _secret() -> bytes:
    value = os.environ.get("RASTER_SIGNING_SECRET", "")
    if len(value) < 32:
        raise HTTPException(status_code=503, detail="Raster signing is not configured")
    return value.encode("utf-8")


def _validate_scene_id(scene_id: str) -> str:
    if not SCENE_RE.fullmatch(scene_id):
        raise HTTPException(status_code=422, detail="Invalid Sentinel-2 scene identifier")
    return scene_id


def _validate_tile(z: int, x: int, y: int) -> None:
    if not (0 <= z <= 18):
        raise HTTPException(status_code=422, detail="Invalid tile zoom")
    bound = 1 << z
    if not (0 <= x < bound and 0 <= y < bound):
        raise HTTPException(status_code=422, detail="Invalid tile coordinate")


def _signature(scene_id: str, layer: str, exp: int) -> str:
    payload = f"{scene_id}|{layer}|{exp}".encode("utf-8")
    return hmac.new(_secret(), payload, hashlib.sha256).hexdigest()


def _verify(scene_id: str, layer: str, exp: int, token: str) -> None:
    now = int(time.time())
    if exp < now or exp > now + MAX_TOKEN_TTL_SECONDS:
        raise HTTPException(status_code=403, detail="Raster token expired or invalid")
    expected = _signature(scene_id, layer, exp)
    if not hmac.compare_digest(expected, token):
        raise HTTPException(status_code=403, detail="Invalid raster token")


def _item_url(scene_id: str) -> str:
    return f"{EARTH_SEARCH_ITEM_ROOT}/{quote(scene_id, safe='')}"


def _render_tile(scene_id: str, layer: str, z: int, x: int, y: int) -> bytes:
    item_url = _item_url(scene_id)
    try:
        with STACReader(item_url) as src:
            available = set(src.assets)
            if layer == "true-color":
                if "visual" not in available:
                    raise HTTPException(status_code=404, detail="Visual asset unavailable")
                image = src.tile(
                    x,
                    y,
                    z,
                    assets=[{"name": "visual", "indexes": [1, 2, 3]}],
                    tilesize=256,
                )
                return image.render(img_format="PNG")

            if layer == "ndvi":
                required = {"nir", "red"}
                if not required.issubset(available):
                    raise HTTPException(status_code=404, detail="NDVI assets unavailable")
                image = src.tile(
                    x,
                    y,
                    z,
                    assets=["nir", "red"],
                    expression="(b1-b2)/(b1+b2)",
                    tilesize=256,
                )
                image.rescale(in_range=((-1, 1),))
                return image.render(img_format="PNG", colormap=cmap.get("rdylgn"))

            required = {"green", "nir"}
            if not required.issubset(available):
                raise HTTPException(status_code=404, detail="NDWI assets unavailable")
            image = src.tile(
                x,
                y,
                z,
                assets=["green", "nir"],
                expression="(b1-b2)/(b1+b2)",
                tilesize=256,
            )
            image.rescale(in_range=((-1, 1),))
            return image.render(img_format="PNG", colormap=cmap.get("blues"))
    except HTTPException:
        raise
    except TileOutsideBounds:
        raise HTTPException(status_code=404, detail="Tile outside scene bounds")
    except RioTilerError:
        raise HTTPException(status_code=502, detail="Raster provider read failed")


@app.get("/health")
def health():
    configured = len(os.environ.get("RASTER_SIGNING_SECRET", "")) >= 32
    return {"ok": True, "signing_configured": configured}


@app.get("/tiles/{layer}/{scene_id}/{z}/{x}/{y}.png")
def tile(
    layer: str,
    scene_id: str,
    z: int,
    x: int,
    y: int,
    exp: int = Query(...),
    token: str = Query(..., min_length=64, max_length=64),
):
    if layer not in LAYERS:
        raise HTTPException(status_code=404, detail="Unsupported raster layer")
    scene_id = _validate_scene_id(scene_id)
    _validate_tile(z, x, y)
    _verify(scene_id, layer, exp, token)
    payload = _render_tile(scene_id, layer, z, x, y)
    return Response(
        content=payload,
        media_type="image/png",
        headers={
            "Cache-Control": "public, max-age=300",
            "X-FOGGARA-Evidence": "COMPUTED",
            "X-FOGGARA-Source": "Element84-Earth-Search-Sentinel-2-L2A",
        },
    )
