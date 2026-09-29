"""موقع الشمس الفلكي — تنفيذ ذاتي لخوارزمية NOAA المنشورة، بلا اعتمادية إنتاج جديدة.

المرجع: NOAA Solar Calculations — Global Monitoring Laboratory,
https://gml.noaa.gov/grad/solcalc/ (خوارزمية منشورة وعامة: الميل، معادلة الوقت،
زاوية الساعة ← الارتفاع/السمت، وشروق/غروب الشمس عند زاوية سمتية 90.833°).

الخطوات: اليوم اليوليوسي ← القرن اليوليوسي ← متوسط طول/شذوذ الشمس ومدار الأرض
← الطول الحقيقي/الظاهري وميل المسار المُصحَّح ← ميل الشمس ومعادلة الوقت
← زاوية الساعة ← الارتفاع والسمت (باتجاه عقارب الساعة من الشمال).

الدقة: أجري تقاطع مع مرجع مستقل (pysolar، في الاختبارات فقط) على أدرار —
فرق الارتفاع/السمت < 0.5° عندما تكون الشمس فوق 5° من الأفق (قرب الأفق يطبّق
pysolar تصحيح انكسار جوي لا تطبّقه الصيغة الهندسية هنا).

هذه قيم محسوبة فلكيًا — ليست قياسًا ميدانيًا (انظر كود SOLAR_COMPUTED_NOT_MEASURED).
"""
import math
from datetime import date, datetime, timedelta

# زاوية السمتية المعيارية للشروق/الغروب (انكسار ~34′ + قرص الشمس ~16′)
_SUNRISE_ZENITH_DEG = 90.833


def _sun_geom(dt_utc: datetime) -> tuple[float, float]:
    """ميل الشمس (راديان) ومعادلة الوقت (دقائق) — معادلات NOAA المنشورة."""
    y, m = dt_utc.year, dt_utc.month
    if m <= 2:
        y, m = y - 1, m + 12
    day_frac = (dt_utc.hour + dt_utc.minute / 60 + dt_utc.second / 3600) / 24
    jd = (int(365.25 * (y + 4716)) + int(30.6001 * (m + 1)) + dt_utc.day + day_frac
          + 2 - y // 100 + (y // 100) // 4 - 1524.5)
    t = (jd - 2451545.0) / 36525.0  # القرن اليوليوسي
    l0 = math.radians((280.46646 + t * (36000.76983 + t * 0.0003032)) % 360)
    m_anom = math.radians(357.52911 + t * (35999.05029 - 0.0001537 * t))
    ecc = 0.016708634 - t * (0.000042037 + 0.0000001267 * t)
    c = (math.sin(m_anom) * (1.914602 - t * (0.004817 + 0.000014 * t))
         + math.sin(2 * m_anom) * (0.019993 - 0.000101 * t)
         + math.sin(3 * m_anom) * 0.000289)
    omega = math.radians(125.04 - 1934.136 * t)
    # c (معادلة المركز) بالدرجات — تُحوَّل لراديان قبل الجمع مع الطول
    app_long = l0 + math.radians(c - 0.00569 - 0.00478 * math.sin(omega))
    mean_obliq = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60
    obliq = math.radians(mean_obliq + 0.00256 * math.cos(omega))
    decl = math.asin(math.sin(obliq) * math.sin(app_long))
    y2 = math.tan(obliq / 2) ** 2
    eqtime = 4 * math.degrees(
        y2 * math.sin(2 * l0) - 2 * ecc * math.sin(m_anom)
        + 4 * ecc * y2 * math.sin(m_anom) * math.cos(2 * l0)
        - 0.5 * y2 * y2 * math.sin(4 * l0) - 1.25 * ecc * ecc * math.sin(2 * m_anom))
    return decl, eqtime


def sun_position(dt_utc: datetime, lat: float, lon: float) -> dict:
    """ارتفاع وسمت الشمس (درجات) في لحظة UTC — السمت باتجاه عقارب الساعة من الشمال."""
    decl, eqtime = _sun_geom(dt_utc)
    minutes = dt_utc.hour * 60 + dt_utc.minute + dt_utc.second / 60
    true_solar = (minutes + eqtime + 4 * lon) % 1440
    ha = math.radians(true_solar / 4 - 180)  # زاوية الساعة
    la = math.radians(lat)
    cos_zen = math.sin(la) * math.sin(decl) + math.cos(la) * math.cos(decl) * math.cos(ha)
    zenith = math.acos(max(-1.0, min(1.0, cos_zen)))
    elevation = 90 - math.degrees(zenith)
    azimuth = (math.degrees(math.atan2(
        math.sin(ha), math.cos(ha) * math.sin(la) - math.tan(decl) * math.cos(la)))
        + 180) % 360
    return {"elevation_deg": elevation, "azimuth_deg": azimuth}


def daylight_hours(day: date, lat: float, lon: float) -> float:
    """ساعات الإشراق الفلكية ليوم كامل (شروق→غروب عند سمتية 90.833°)."""
    noon = datetime(day.year, day.month, day.day, 12, 0)
    decl, _ = _sun_geom(noon)
    la = math.radians(lat)
    cos_ha = (math.cos(math.radians(_SUNRISE_ZENITH_DEG)) / (math.cos(la) * math.cos(decl))
              - math.tan(la) * math.tan(decl))
    if cos_ha < -1:
        return 24.0  # نهار قطبي
    if cos_ha > 1:
        return 0.0   # ليل قطبي
    return 2 * math.degrees(math.acos(cos_ha)) / 15


def annual_daylight_hours(year: int, lat: float, lon: float) -> tuple[float, list[float]]:
    """المجموع السنوي التقريبي لساعات الإشراق + تفصيل شهري (12 قيمة)."""
    monthly = [0.0] * 12
    day = date(year, 1, 1)
    while day.year == year:
        monthly[day.month - 1] += daylight_hours(day, lat, lon)
        day += timedelta(days=1)
    return sum(monthly), monthly
