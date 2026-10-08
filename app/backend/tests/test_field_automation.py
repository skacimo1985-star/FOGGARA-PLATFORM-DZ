from datetime import datetime, timezone

from sqlalchemy import select

from app import field_automation
from app.models import AgriObservation, AgriParcel


def _multi_index_result():
    indices = {}
    values = {
        "ndvi": 0.63,
        "evi": 0.51,
        "savi": 0.58,
        "ndwi": -0.14,
        "ndmi": 0.21,
        "lswi": 0.19,
        "bsi": -0.08,
    }
    for key, mean in values.items():
        indices[key] = {
            "pixels": {"valid": 64, "total": 80, "valid_fraction": 0.8},
            "statistics": {"min": mean - 0.1, "max": mean + 0.1, "mean": mean, "median": mean},
        }
    return {
        "processing_plan_fingerprint": "test-plan-fingerprint",
        "indices": indices,
    }


def test_automated_field_analysis_persists_once_and_uses_polygon(db, world, monkeypatch):
    user = world["o1_member"]
    polygon = {
        "type": "Polygon",
        "coordinates": [[
            [2.9990, 35.9990],
            [3.0010, 35.9990],
            [3.0010, 36.0010],
            [2.9990, 36.0010],
            [2.9990, 35.9990],
        ]],
    }
    parcel = AgriParcel(
        org_id=user.org_id,
        name="Automation Field",
        crop="date_palm",
        area_ha=4.0,
        location="Laghouat",
        lat=36.0,
        lon=3.0,
        boundary_geojson=polygon,
        stage="mid",
        archived=False,
        created_by=user.id,
        is_demo=False,
    )
    db.add(parcel)
    db.commit()
    db.refresh(parcel)

    feature = {
        "id": "S2_TEST_SCENE",
        "collection": "sentinel-2-l2a",
        "properties": {"datetime": "2026-10-07T10:00:00Z"},
        "geometry": polygon,
        "assets": {},
    }
    scene = {
        "id": "S2_TEST_SCENE",
        "datetime": "2026-10-07T10:00:00Z",
        "geometry": polygon,
    }

    monkeypatch.setattr(field_automation, "_earth_search_features", lambda *args, **kwargs: [feature])
    monkeypatch.setattr(field_automation, "_scene_from_feature", lambda value: scene)
    monkeypatch.setattr(
        field_automation,
        "build_multi_index_plan",
        lambda value: {"scene_id": value["id"], "fingerprint_sha256": "test-plan"},
    )

    captured = {}

    def compute(plan, bounds, geometry_wgs84=None):
        captured["geometry"] = geometry_wgs84
        captured["bounds"] = bounds
        return _multi_index_result()

    monkeypatch.setattr(field_automation, "compute_multi_index_statistics", compute)

    first = field_automation.analyze_parcel(
        db,
        parcel,
        now=datetime(2026, 10, 8, 12, 0, tzinfo=timezone.utc),
    )
    db.commit()

    rows = db.scalars(
        select(AgriObservation)
        .where(AgriObservation.parcel_id == parcel.id)
        .order_by(AgriObservation.metric)
    ).all()

    assert first["status"] == "READY"
    assert first["created"] == 7
    assert len(rows) == 7
    assert {row.metric for row in rows} == set(field_automation.AUTOMATED_INDICES)
    assert all(row.source_type == "satellite" for row in rows)
    assert all(row.evidence_status == "INFERRED" for row in rows)
    assert all(row.source_ref.startswith("automation:element84-earth-search:") for row in rows)
    assert captured["geometry"] == polygon
    assert captured["bounds"] == [2.999, 35.999, 3.001, 36.001]

    second = field_automation.analyze_parcel(
        db,
        parcel,
        now=datetime(2026, 10, 8, 12, 0, tzinfo=timezone.utc),
    )
    db.commit()

    assert second["created"] == 0
    assert second["skipped"] == 7
    rows_after = db.scalars(
        select(AgriObservation).where(AgriObservation.parcel_id == parcel.id)
    ).all()
    assert len(rows_after) == 7
