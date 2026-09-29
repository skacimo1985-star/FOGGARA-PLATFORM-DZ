"""اختبارات بُعد الطاقة — التحليل الشمسي الفلكي (TDD).

الخوارزمية الإنتاجية في app/services/solar.py (خوارزمية NOAA منشورة، بلا اعتمادية جديدة).
pysolar تُستخدم هنا فقط كمرجع تحقق مستقل داخل الاختبارات (راجع requirements-dev.txt).
"""
import datetime

from app.i18n import get_message

from .conftest import login

ADRAR = {"lat": 27.87, "lon": -0.29}


def test_solar_requires_auth(client):
    """(أ) كل نقاط solar تتطلب مصادقة: 401 بلا رمز."""
    r1 = client.get("/api/energy/solar/position", params=ADRAR)
    r2 = client.get("/api/energy/solar/annual-hours", params=ADRAR)
    assert r1.status_code == 401
    assert r2.status_code == 401
    assert r1.json()["detail"]["code"] == "AUTH_REQUIRED"


def test_solar_out_of_algeria_bounds(client, world):
    """(ب) lat/lon إلزاميان وداخل نطاق الجزائر وإلا 422 بكود OUT_OF_ALGERIA_BOUNDS."""
    h = login(client, "o1m@t.dz")
    for params in ({"lat": 48.85, "lon": 2.35},      # باريس
                   {"lat": 18.0, "lon": 0.0},        # جنوب النطاق
                   {"lat": 38.0, "lon": 0.0},        # شمال النطاق
                   {"lat": 28.0, "lon": -9.5},       # غرب النطاق
                   {"lat": 28.0, "lon": 13.0}):      # شرق النطاق
        r = client.get("/api/energy/solar/position", params=params, headers=h)
        assert r.status_code == 422, params
        assert r.json()["detail"]["code"] == "OUT_OF_ALGERIA_BOUNDS"
        r2 = client.get("/api/energy/solar/annual-hours", params=params, headers=h)
        assert r2.status_code == 422, params
        assert r2.json()["detail"]["code"] == "OUT_OF_ALGERIA_BOUNDS"
    # الكود مترجم للغات الثلاث في messages_i18n
    for loc in ("ar", "fr", "en"):
        assert get_message("OUT_OF_ALGERIA_BOUNDS", loc) != "OUT_OF_ALGERIA_BOUNDS"
    # تاريخ at غير صالح → 422
    r = client.get("/api/energy/solar/position",
                   params={**ADRAR, "at": "not-a-date"}, headers=h)
    assert r.status_code == 422


def _position(client, h, at):
    r = client.get("/api/energy/solar/position",
                   params={**ADRAR, "at": at}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_solar_position_known_value_and_crosscheck(client, world):
    """(ج) قيمة معروفة: أدرار ظهر الاعتدال + تقاطع مع pysolar (<0.5°).

    المجال المتوقع موثق: يوم الاعتدال الربيعي 2024-03-20 الساعة 12:00 UTC
    (13:00 بتوقيت الجزائر) تكون الشمس قريبة من الجهة الجنوبية في أدرار
    (27.87°N) بارتفاع ≈ 90° − |27.87° − 0°| ≈ 62°.
    التقاطع يقتصر على شمس فوق 5° ارتفاعًا: pysolar يطبّق تصحيح الانكسار
    الجوي قرب الأفق بينما خوارزمية NOAA الهندسية لا تفعل، فيتجمع الفرق هناك.
    """
    from pysolar import solar as pysolar_solar
    import pytz

    h = login(client, "o1m@t.dz")

    body = _position(client, h, "2024-03-20T12:00:00Z")
    assert body["lat"] == ADRAR["lat"] and body["lon"] == ADRAR["lon"]
    assert body["at_utc"] == "2024-03-20T12:00:00+00:00"
    assert body["timezone"] == "Africa/Algiers"
    assert body["local_time"] == "2024-03-20T13:00:00+01:00"
    assert body["method"] == "NOAA solar approximation"
    assert body["disclaimer_code"] == "SOLAR_COMPUTED_NOT_MEASURED"
    # نص التوسيم مترجم للغات الثلاث
    for loc in ("ar", "fr", "en"):
        assert get_message("SOLAR_COMPUTED_NOT_MEASURED", loc) != "SOLAR_COMPUTED_NOT_MEASURED"
    assert 55.0 <= body["elevation_deg"] <= 68.0, body
    assert 150.0 <= body["azimuth_deg"] <= 210.0, body

    # تقاطع مع مرجع مستقل (pysolar) على عدة تواريخ/أوقات
    checked = 0
    for month in (1, 3, 6, 9, 12):
        for hour in (9, 12, 15):
            dt = datetime.datetime(2024, month, 15, hour, 0)
            ref_elev = pysolar_solar.get_altitude(
                ADRAR["lat"], ADRAR["lon"], pytz.utc.localize(dt))
            if ref_elev < 5.0:
                continue  # قرب الأفق: فرق الانكسار الجوي الموثق أعلاه
            body = _position(client, h, dt.isoformat() + "Z")
            ref_az = pysolar_solar.get_azimuth(
                ADRAR["lat"], ADRAR["lon"], pytz.utc.localize(dt))
            assert abs(body["elevation_deg"] - ref_elev) < 0.5, (dt, body, ref_elev)
            d_az = abs(body["azimuth_deg"] - ref_az) % 360
            assert min(d_az, 360 - d_az) < 0.5, (dt, body, ref_az)
            checked += 1
    assert checked >= 10


def test_solar_annual_hours(client, world):
    """(د) ساعات الإشراق الفلكية السنوية لأدرار بين 4000 و4500 + 12 شهرًا موجبة.

    موثق: متوسط طول النهار السنوي ≈ 12.1 ساعة/يوم (مع سمتية 90.833°)
    ← ≈ 4400 ساعة سنويًا في عرض أدرار، داخل المجال [4000, 4500].
    """
    h = login(client, "o1m@t.dz")
    r = client.get("/api/energy/solar/annual-hours",
                   params={**ADRAR, "year": 2025}, headers=h)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["lat"] == ADRAR["lat"] and body["lon"] == ADRAR["lon"]
    assert body["year"] == 2025
    assert 4000.0 <= body["annual_hours"] <= 4500.0, body["annual_hours"]
    monthly = body["monthly_hours"]
    assert len(monthly) == 12
    assert all(m > 0 for m in monthly), monthly
    assert abs(sum(monthly) - body["annual_hours"]) < 0.5
    # يونيو أطول من ديسمبر في نصف الكرة الشمالي
    assert monthly[5] > monthly[11]
    assert body["method"] == "NOAA solar approximation"
    assert body["disclaimer_code"] == "SOLAR_COMPUTED_NOT_MEASURED"
    # الافتراضي: السنة الحالية
    r2 = client.get("/api/energy/solar/annual-hours", params=ADRAR, headers=h)
    assert r2.status_code == 200
    assert r2.json()["year"] == datetime.datetime.now().year


def test_solar_is_day(client, world):
    """(هـ) is_day صحيح ليلًا/نهارًا (الشمس فوق الأفق الهندسي)."""
    h = login(client, "o1m@t.dz")
    # ظهرًا (13:00 محلي) — نهار
    noon = _position(client, h, "2024-03-20T12:00:00Z")
    assert noon["is_day"] is True
    assert noon["elevation_deg"] > 0
    # منتصف الليل UTC (01:00 محلي) — ليل
    night = _position(client, h, "2024-01-15T00:00:00Z")
    assert night["is_day"] is False
    assert night["elevation_deg"] < 0
    # مساء صيفي بعد الغروب (21:00 محلي) — ليل
    evening = _position(client, h, "2024-06-21T20:00:00Z")
    assert evening["is_day"] is False
