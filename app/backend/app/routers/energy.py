"""Energy domain endpoints: astronomically computed solar analysis.

دوال صرفة بلا تخزين — الحساب فلكي من الإحداثيات فقط، لذا لا عزل مؤسسات.
"""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends

from ..deps import api_error, get_current_user
from ..models import User
from ..services import solar

router = APIRouter(prefix="/api/energy", tags=["energy"])

TZ_ALGIERS = ZoneInfo("Africa/Algiers")
SOLAR_METHOD = "NOAA solar approximation"
SOLAR_DISCLAIMER = "SOLAR_COMPUTED_NOT_MEASURED"

# نطاق الجزائر التقريبي (خطوط العرض/الطول)
LAT_MIN, LAT_MAX = 18.5, 37.2
LON_MIN, LON_MAX = -8.7, 12.0


def _check_bounds(lat: float, lon: float):
    if not (LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX):
        api_error(422, "OUT_OF_ALGERIA_BOUNDS",
                  "Coordinates outside Algeria bounds "
                  f"(lat [{LAT_MIN}, {LAT_MAX}], lon [{LON_MIN}, {LON_MAX}])")


def _parse_at(at: str | None) -> datetime:
    """ISO 8601 اختياري؛ الافتراضي الآن. التاريخ غير الصالح → 422."""
    if at is None:
        return datetime.now(timezone.utc)
    try:
        dt = datetime.fromisoformat(at.strip().replace("Z", "+00:00"))
    except ValueError:
        api_error(422, "VALIDATION_ERROR", "Invalid ISO datetime for 'at'")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


@router.get("/solar/position")
def solar_position(lat: float, lon: float, at: str | None = None,
                   user: User = Depends(get_current_user)):
    """موقع الشمس الحسابي في لحظة (الافتراضي: الآن) — دالة صرفة بلا تخزين."""
    _check_bounds(lat, lon)
    at_utc = _parse_at(at)
    pos = solar.sun_position(at_utc, lat, lon)
    return {
        "lat": lat,
        "lon": lon,
        "at_utc": at_utc.isoformat(),
        "elevation_deg": round(pos["elevation_deg"], 3),
        "azimuth_deg": round(pos["azimuth_deg"], 3),
        "is_day": pos["elevation_deg"] > 0,
        "timezone": "Africa/Algiers",
        "local_time": at_utc.astimezone(TZ_ALGIERS).isoformat(),
        "method": SOLAR_METHOD,
        "disclaimer_code": SOLAR_DISCLAIMER,
    }


@router.get("/solar/annual-hours")
def solar_annual_hours(lat: float, lon: float, year: int | None = None,
                       user: User = Depends(get_current_user)):
    """ساعات الإشراق الفلكية التقريبية سنويًا + تفصيل شهري — دالة صرفة."""
    _check_bounds(lat, lon)
    year = year or datetime.now(timezone.utc).year
    if not (1900 <= year <= 2100):
        api_error(422, "VALIDATION_ERROR", "year must be within [1900, 2100]")
    annual, monthly = solar.annual_daylight_hours(year, lat, lon)
    return {
        "lat": lat,
        "lon": lon,
        "year": year,
        "annual_hours": round(annual, 1),
        "monthly_hours": [round(m, 1) for m in monthly],
        "method": SOLAR_METHOD,
        "disclaimer_code": SOLAR_DISCLAIMER,
    }
