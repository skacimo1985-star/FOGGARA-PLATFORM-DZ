from app.routers import expo
from tests.conftest import login


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class FakeClient:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def post(self, url, **kwargs):
        self.calls.append((url, kwargs))
        return FakeResponse(self.payload)


def scene():
    return {
        "type": "Feature",
        "id": "S2A_EXPO_20261006",
        "collection": "sentinel-2-l2a",
        "bbox": [2.0, 33.0, 2.2, 33.2],
        "geometry": {
            "type": "Polygon",
            "coordinates": [[[2.0, 33.0], [2.2, 33.0], [2.2, 33.2], [2.0, 33.2], [2.0, 33.0]]],
        },
        "properties": {
            "datetime": "2026-10-06T10:00:00Z",
            "eo:cloud_cover": 8.0,
            "platform": "sentinel-2a",
            "constellation": "sentinel-2",
        },
        "assets": {"red": {}, "nir": {}, "visual": {}},
        "links": [
            {
                "rel": "self",
                "href": "https://earth-search.aws.element84.com/v1/collections/sentinel-2-l2a/items/S2A_EXPO_20261006",
            }
        ],
    }


def test_expo_guest_entry_is_public_optional_and_idempotent(client):
    session_key = "expo_session_1234567890"
    first = client.post(
        "/api/expo/visit",
        json={"session_key": session_key, "name": None, "visitor_role": None},
    )
    assert first.status_code == 201, first.text
    assert first.json()["visitors"] == 1
    visit_id = first.json()["visit_id"]

    second = client.post(
        "/api/expo/visit",
        json={"session_key": session_key, "name": "Visitor", "visitor_role": "Investor"},
    )
    assert second.status_code == 201, second.text
    assert second.json()["visit_id"] == visit_id
    assert second.json()["visitors"] == 1
    assert second.json()["name"] == "Visitor"
    assert second.json()["visitor_role"] == "Investor"

    stats = client.get("/api/expo/stats")
    assert stats.status_code == 200
    assert stats.json() == {"visitors": 1, "feedback": 0}


def test_expo_feedback_is_public_and_persistent(client):
    session_key = "expo_feedback_123456"
    visit = client.post(
        "/api/expo/visit",
        json={"session_key": session_key, "name": "", "visitor_role": ""},
    ).json()

    response = client.post(
        "/api/expo/feedback",
        json={
            "visit_id": visit["visit_id"],
            "session_key": session_key,
            "rating": 5,
            "suggestion": "Add irrigation alerts",
        },
    )
    assert response.status_code == 201, response.text
    assert response.json()["status"] == "received"
    assert response.json()["feedback"] == 1

    stats = client.get("/api/expo/stats")
    assert stats.json()["feedback"] == 1


def test_expo_feedback_requires_content(client):
    session_key = "expo_empty_feedback_123456"
    visit = client.post(
        "/api/expo/visit",
        json={"session_key": session_key, "name": None, "visitor_role": None},
    ).json()
    response = client.post(
        "/api/expo/feedback",
        json={
            "visit_id": visit["visit_id"],
            "session_key": session_key,
            "rating": None,
            "suggestion": "",
        },
    )
    assert response.status_code == 422


def test_expo_feedback_rejects_another_visitor_session(client):
    owner_key = "expo_feedback_owner_123456"
    attacker_key = "expo_feedback_other_123456"
    visit = client.post(
        "/api/expo/visit",
        json={"session_key": owner_key, "name": "Owner", "visitor_role": "Farmer"},
    ).json()
    client.post(
        "/api/expo/visit",
        json={"session_key": attacker_key, "name": "Other", "visitor_role": "Visitor"},
    )

    response = client.post(
        "/api/expo/feedback",
        json={
            "visit_id": visit["visit_id"],
            "session_key": attacker_key,
            "rating": 1,
            "suggestion": "forged feedback",
        },
    )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "EXPO_VISIT_NOT_FOUND"
    assert client.get("/api/expo/stats").json()["feedback"] == 0


def test_expo_feedback_requires_session_proof(client):
    visit = client.post(
        "/api/expo/visit",
        json={"session_key": "expo_feedback_proof_123456", "name": None, "visitor_role": None},
    ).json()
    response = client.post(
        "/api/expo/feedback",
        json={"visit_id": visit["visit_id"], "rating": 4, "suggestion": "Good"},
    )
    assert response.status_code == 422


def test_expo_satellite_search_is_public_bounded_and_uses_fixed_provider(client, monkeypatch):
    fake = FakeClient({"type": "FeatureCollection", "features": [scene()]})
    monkeypatch.setattr(expo.httpx, "Client", lambda **_kwargs: fake)

    response = client.get(
        "/api/expo/satellite/scenes"
        "?bbox=2,33,2.3,33.3&start=2026-10-01&end=2026-10-06&cloud_cover_lte=20&limit=5"
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["live"] is True
    assert body["count"] == 1
    assert body["scenes"][0]["id"] == "S2A_EXPO_20261006"
    assert len(fake.calls) == 1
    url, kwargs = fake.calls[0]
    assert url == expo.EARTH_SEARCH_SEARCH_URL
    assert kwargs["json"]["collections"] == ["sentinel-2-l2a"]
    assert kwargs["json"]["limit"] == 5
    assert kwargs["json"]["query"]["eo:cloud_cover"]["lte"] == 20


def test_expo_satellite_rejects_outside_algeria_before_provider_io(client, monkeypatch):
    monkeypatch.setattr(
        expo.httpx,
        "Client",
        lambda **_kwargs: (_ for _ in ()).throw(AssertionError("provider IO must not run")),
    )
    response = client.get(
        "/api/expo/satellite/scenes"
        "?bbox=-20,20,-10,30&start=2026-10-01&end=2026-10-06"
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "EXPO_BBOX_OUTSIDE_ALGERIA"



def test_expo_insights_require_reviewer(client, world):
    member = login(client, world["o1_member"].email)
    response = client.get("/api/expo/insights", headers=member)
    assert response.status_code == 403

    reviewer = login(client, world["o1_reviewer"].email)
    response = client.get("/api/expo/insights", headers=reviewer)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["visitors"] == 0
    assert body["feedback"] == 0
    assert body["average_rating"] is None
    assert body["rating_distribution"] == {}
    assert body["role_distribution"] == []
    assert body["recent_feedback"] == []


def test_expo_insights_aggregate_feedback_without_session_keys(client, world):
    first = client.post(
        "/api/expo/visit",
        json={"session_key": "expo_insights_visitor_0001", "name": "Amina", "visitor_role": "Investor"},
    ).json()
    second = client.post(
        "/api/expo/visit",
        json={"session_key": "expo_insights_visitor_0002", "name": "Karim", "visitor_role": "Farmer"},
    ).json()
    client.post(
        "/api/expo/feedback",
        json={
            "visit_id": first["visit_id"],
            "session_key": "expo_insights_visitor_0001",
            "rating": 5,
            "suggestion": "Add irrigation alerts",
        },
    )
    client.post(
        "/api/expo/feedback",
        json={
            "visit_id": second["visit_id"],
            "session_key": "expo_insights_visitor_0002",
            "rating": 3,
            "suggestion": "More local crop data",
        },
    )

    reviewer = login(client, world["o1_reviewer"].email)
    response = client.get("/api/expo/insights", headers=reviewer)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["visitors"] == 2
    assert body["visitors_last_24h"] == 2
    assert body["feedback"] == 2
    assert body["average_rating"] == 4.0
    assert body["rating_distribution"] == {"3": 1, "5": 1}
    assert {row["visitor_role"] for row in body["role_distribution"]} == {"Investor", "Farmer"}
    assert len(body["recent_feedback"]) == 2
    assert body["recent_feedback"][0]["suggestion"] == "More local crop data"
    assert "session_key" not in body["recent_feedback"][0]
