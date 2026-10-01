"""Deterministic scenarios, not field prescriptions. No external AI or network.
ETc = Kc * ETo: https://www.fao.org/4/X0490E/x0490e0a.htm
NDVI: https://www.usgs.gov/landsat-missions/landsat-normalized-difference-vegetation-index
"""
import math


def irrigation_scenario(area_ha, eto_mm_day, kc, effective_rain_mm, efficiency, days):
    values = (area_ha, eto_mm_day, kc, effective_rain_mm, efficiency, days)
    if not all(math.isfinite(float(x)) for x in values):
        raise ValueError('Inputs must be finite')
    if not (0 < area_ha <= 100000 and 0 <= eto_mm_day <= 30 and 0 <= kc <= 2
            and 0 <= effective_rain_mm <= 2000 and 0 < efficiency <= 1 and 1 <= days <= 30):
        raise ValueError('Inputs out of range')
    etc = eto_mm_day * kc * days
    net = max(0.0, etc - effective_rain_mm)
    gross = net / efficiency
    return dict(etc_mm=round(etc, 4), net_mm=round(net, 4), gross_mm=round(gross, 4),
                volume_m3=round(gross * area_ha * 10, 3), evidence_status='COMPUTED',
                decision_status='PROPOSED', method='foggara-water-balance-v1',
                formula='ETc=ETo*Kc*days; net=max(0,ETc-Peff); gross=net/efficiency; m3=gross*ha*10',
                limitations=['INPUTS_NOT_VERIFIED', 'NO_SOIL_STORAGE_OR_SALINITY_MODEL', 'HUMAN_REVIEW_REQUIRED'])


def vegetation_index(nir, red):
    if not all(math.isfinite(x) and 0 <= x <= 1 for x in (nir, red)) or nir + red == 0:
        raise ValueError('Use valid scaled surface reflectance; denominator must be positive')
    return (nir - red) / (nir + red)
