"""Explore WEFEH domains, GIS aggregation, admin directory, IoT/VDE status.

مبدأ صارم: أي قسم بلا بيانات حقيقية يُعاد كـ {status:"planned", required_data:[...]}
— ممنوع اختلاق قيم.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import (Asset, Indicator, Project, Service, ServiceRequest, Site,
                      User, WaterResource)
from ..wilayas import WILAYAS
from ..platform_models import NexusResource

router = APIRouter(prefix="/api", tags=["explore"])

DOMAINS = ("water", "energy", "food", "ecosystem", "health")

# بيانات مطلوبة موثقة لكل قسم مخطط (لا قيم مخترعة)
REQUIRED_DATA = {
    "resources": ["resource_registry", "site_link", "resource_type"],
    "assets": ["asset_registry", "resource_link", "operational_status"],
    "indicators": ["indicator_definition", "validated_measurements"],
    "risks": ["hazard_catalog", "exposure_data", "vulnerability_assessment"],
    "services": ["service_catalog_entry", "provider"],
    "projects": ["project_record"],
    "terminology": ["glossary_source", "domain_terms"],
}

# مسرد مصطلحات ثابت موثق (مرجعية، ليست قياسات)
GLOSSARY: dict[str, list[dict]] = {
    "water": [
        {"term_ar": "فڨارة", "term_fr": "foggara", "term_en": "foggara (qanat)",
         "definition": "نظام ري تقليدي بقنوات جوفية بميل خفيف"},
        {"term_ar": "البئر الأم", "term_fr": "puits mère", "term_en": "mother well",
         "definition": "أعمق بئر في الفڨارة عند منبع المياه الجوفية"},
    ],
    "energy": [
        {"term_ar": "القدرة الكهربائية", "term_fr": "puissance électrique", "term_en": "electrical power",
         "definition": "معدل استهلاك أو إنتاج الطاقة الكهربائية (kW)"},
    ],
    "food": [
        {"term_ar": "الرطوبة التربوية", "term_fr": "humidité du sol", "term_en": "soil moisture",
         "definition": "نسبة الماء في التربة (%) المؤثرة في الري"},
    ],
    "ecosystem": [
        {"term_ar": "الواحة", "term_fr": "oasis", "term_en": "oasis",
         "definition": "منظومة بيئية زراعية صحراوية قائمة على المياه الجوفية"},
    ],
    "health": [
        {"term_ar": "العكارة", "term_fr": "turbidité", "term_en": "turbidity",
         "definition": "مؤشر جودة مياه الشرب (NTU)"},
    ],
}


def _section(items: list, required_key: str):
    if items:
        return {"status": "available", "items": items}
    return {"status": "planned", "required_data": REQUIRED_DATA[required_key]}


@router.get("/explore/{domain}")
def explore_domain(domain: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if domain not in DOMAINS:
        api_error(404, "UNKNOWN_DOMAIN", f"Unknown WEFEH domain: {domain}")

    # الموارد: لا يوجد حاليًا سوى موارد مائية حقيقية
    resources = []
    if domain == "water":
        resources = [
            {"id": r.id, "type": r.type, "name": r.name, "status": r.status,
             "site_id": r.site_id, "is_demo": r.is_demo}
            for r in db.execute(select(WaterResource).where(WaterResource.org_id == user.org_id)
                                .order_by(WaterResource.id)).scalars().all()
        ]

    resources.extend({"id": r.id, "type": r.kind, "name": r.name, "status": "registered", "site_id": None, "is_demo": r.is_demo}
                     for r in db.scalars(select(NexusResource).where(NexusResource.org_id == user.org_id, NexusResource.domain == domain)))
    assets = []
    if domain == "water":
        assets = [
            {"id": a.id, "kind": a.kind, "name": a.name, "status": a.status,
             "resource_id": a.resource_id, "is_demo": a.is_demo}
            for a in db.execute(select(Asset).where(Asset.org_id == user.org_id)
                                .order_by(Asset.id)).scalars().all()
        ]

    projects = [
        {"id": p.id, "title": p.title, "status": p.status, "domain": p.domain, "is_demo": p.is_demo}
        for p in db.execute(select(Project).where(Project.org_id == user.org_id,
                                                  Project.domain == domain)
                            .order_by(Project.id)).scalars().all()
    ]

    indicators = [
        {"code": i.code, "name_ar": i.name_ar, "name_fr": i.name_fr, "name_en": i.name_en,
         "unit": i.unit, "formula": i.formula}
        for i in db.execute(select(Indicator).order_by(Indicator.id)).scalars().all()
    ] if domain == "water" else []

    services = [
        {"id": s.id, "type": s.type, "name_ar": s.name_ar, "name_fr": s.name_fr,
         "name_en": s.name_en, "provider": s.provider, "is_demo": s.is_demo}
        for s in db.execute(select(Service).where((Service.domain == domain) | Service.domain.is_(None))
                            .order_by(Service.id)).scalars().all()
    ]

    terminology = GLOSSARY.get(domain, [])

    return {
        "domain": domain,
        "resources": _section(resources, "resources"),
        "assets": _section(assets, "assets"),
        "indicators": _section(indicators, "indicators"),
        "risks": _section([], "risks"),  # لا نموذج مخاطر بعد — مخطط دائمًا
        "services": _section(services, "services"),
        "projects": _section(projects, "projects"),
        "terminology": _section(terminology, "terminology"),
    }


# ---------- GIS ----------
@router.get("/gis/sites")
def gis_sites(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """تجميع المواقع ذات الإحداثيات اليدوية مع مشاريعها/مواردها/أصولها/طلبات خدماتها."""
    sites = db.execute(select(Site).where(Site.org_id == user.org_id,
                                          Site.lat.isnot(None), Site.lon.isnot(None))
                       .order_by(Site.id)).scalars().all()
    out = []
    for s in sites:
        resources = db.execute(select(WaterResource).where(WaterResource.site_id == s.id)).scalars().all()
        res_ids = [r.id for r in resources]
        assets = db.execute(select(Asset).where(Asset.resource_id.in_(res_ids))).scalars().all() if res_ids else []
        projects = db.execute(select(Project).where(Project.site_id == s.id)).scalars().all()
        requests = db.execute(select(ServiceRequest).where(ServiceRequest.site_id == s.id)).scalars().all()
        out.append({
            "site": {"id": s.id, "name": s.name, "wilaya": s.wilaya, "commune": s.commune,
                     "lat": float(s.lat), "lon": float(s.lon), "is_demo": s.is_demo},
            "projects": [{"id": p.id, "title": p.title, "domain": p.domain, "status": p.status} for p in projects],
            "resources": [{"id": r.id, "type": r.type, "name": r.name, "status": r.status} for r in resources],
            "assets": [{"id": a.id, "kind": a.kind, "name": a.name, "status": a.status} for a in assets],
            "service_requests": [{"id": r.id, "service_id": r.service_id, "status": r.status} for r in requests],
        })
    return {"count": len(out), "sites": out}


# ---------- Admin directory ----------
@router.get("/meta/wilayas")
def list_wilayas(user: User = Depends(get_current_user)):
    return {"count": len(WILAYAS), "wilayas": WILAYAS}


# ---------- IoT / VDE — وصفي فقط، بلا محاكاة ----------
@router.get("/iot/status")
def iot_status(user: User = Depends(get_current_user)):
    return {
        "status": "planned",
        "model": ["Device", "Gateway", "TelemetryMessage", "DeviceProvisioning",
                  "IngestionPipeline(measurement source_type=instrument)"],
        "warnings": [
            "no_real_devices_connected",
            "no_simulated_telemetry",
            "ingestion_requires_verified_device_identity",
        ],
    }


@router.get("/vde/status")
def vde_status(user: User = Depends(get_current_user)):
    return {
        "status": "planned",
        "model": ["VirtualDigitalEntity", "TwinState", "TwinBinding(asset_id)",
                  "ScenarioRun(offline, non-simulated live data)"],
        "warnings": [
            "no_live_twin_instances",
            "no_synthetic_environment_data",
            "requires_iot_ingestion_layer_first",
        ],
    }
