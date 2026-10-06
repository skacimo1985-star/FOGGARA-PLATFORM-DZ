"""Standards-based STAC search adapter for FOGGARA.

Uses the Apache-2.0 pystac-client project for STAC API discovery/search while
keeping FOGGARA's provider allow-list and raster asset validation elsewhere.
No user-supplied catalogue URL is accepted here.
"""
from __future__ import annotations

from dataclasses import dataclass

from pystac_client import Client
from pystac_client.exceptions import APIError
from requests import RequestException


EARTH_SEARCH_ROOT = "https://earth-search.aws.element84.com/v1"
SENTINEL_COLLECTION = "sentinel-2-l2a"
USER_AGENT = "FOGGARA-DZ/remote-sensing"


class StacSearchError(RuntimeError):
    """Raised when the fixed upstream STAC service cannot be queried safely."""


@dataclass(frozen=True)
class StacSearchRequest:
    bbox: list[float]
    datetime_range: str
    cloud_cover_lte: float
    limit: int


def search_sentinel_items(request: StacSearchRequest) -> list[dict]:
    """Return raw Sentinel-2 L2A STAC Items from the fixed Earth Search API."""
    try:
        client = Client.open(
            EARTH_SEARCH_ROOT,
            headers={"User-Agent": USER_AGENT},
            timeout=(5.0, 12.0),
        )
        search = client.search(
            method="POST",
            max_items=request.limit,
            limit=request.limit,
            collections=[SENTINEL_COLLECTION],
            bbox=request.bbox,
            datetime=request.datetime_range,
            query={"eo:cloud_cover": {"lte": request.cloud_cover_lte}},
            sortby=[{"field": "properties.datetime", "direction": "desc"}],
        )
        return list(search.items_as_dicts())
    except (APIError, RequestException, NotImplementedError, ValueError) as exc:
        raise StacSearchError("fixed STAC provider search failed") from exc
