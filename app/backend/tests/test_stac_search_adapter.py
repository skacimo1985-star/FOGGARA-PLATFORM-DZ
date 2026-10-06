from app.services import stac_search


class FakeSearch:
    def __init__(self, items):
        self._items = items

    def items_as_dicts(self):
        yield from self._items


class FakeClient:
    def __init__(self):
        self.calls = []

    def search(self, **kwargs):
        self.calls.append(kwargs)
        return FakeSearch([{"id": "S2A_TEST", "collection": "sentinel-2-l2a"}])


def test_pystac_adapter_uses_fixed_provider_and_bounded_search(monkeypatch):
    fake = FakeClient()
    opened = {}

    def fake_open(url, **kwargs):
        opened["url"] = url
        opened["kwargs"] = kwargs
        return fake

    monkeypatch.setattr(stac_search.Client, "open", fake_open)
    request = stac_search.StacSearchRequest(
        bbox=[2.0, 33.0, 2.2, 33.2],
        datetime_range="2026-10-01T00:00:00Z/2026-10-06T23:59:59Z",
        cloud_cover_lte=20.0,
        limit=5,
    )
    items = stac_search.search_sentinel_items(request)

    assert opened["url"] == stac_search.EARTH_SEARCH_ROOT
    assert opened["kwargs"]["timeout"] == (5.0, 12.0)
    assert opened["kwargs"]["headers"]["User-Agent"] == stac_search.USER_AGENT
    assert items[0]["id"] == "S2A_TEST"

    kwargs = fake.calls[0]
    assert kwargs["method"] == "POST"
    assert kwargs["collections"] == ["sentinel-2-l2a"]
    assert kwargs["bbox"] == [2.0, 33.0, 2.2, 33.2]
    assert kwargs["max_items"] == 5
    assert kwargs["limit"] == 5
    assert kwargs["query"]["eo:cloud_cover"]["lte"] == 20.0
    assert kwargs["sortby"] == [{"field": "properties.datetime", "direction": "desc"}]


def test_pystac_adapter_normalizes_provider_errors(monkeypatch):
    def fail_open(*_args, **_kwargs):
        raise ValueError("bad provider response")

    monkeypatch.setattr(stac_search.Client, "open", fail_open)
    request = stac_search.StacSearchRequest(
        bbox=[2.0, 33.0, 2.2, 33.2],
        datetime_range="2026-10-01/2026-10-06",
        cloud_cover_lte=30.0,
        limit=10,
    )
    try:
        stac_search.search_sentinel_items(request)
    except stac_search.StacSearchError:
        pass
    else:
        raise AssertionError("provider errors must be normalized")
