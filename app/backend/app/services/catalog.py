"""Authored SIREP service offerings; no synthetic customers or certifications."""
from sqlalchemy import select, text
from ..models import Service

CATALOG_PROVIDER = "EURL SIREP OASES NEXUS WEFEH-DZ"
CATALOG = (
    ("calibration", None, "معايرة أجهزة القياس", "Étalonnage des instruments", "Instrument calibration"),
    ("inspection", None, "فحص الأجهزة والتجهيزات", "Inspection des équipements", "Equipment inspection"),
    ("measurement", None, "قياسات المياه والتربة والطاقة", "Mesures eau, sol et énergie", "Water, soil and energy measurements"),
    ("technical_study", None, "دراسات تقنية للموارد والمشاريع", "Études techniques des ressources et projets", "Resource and project technical studies"),
    ("irrigation_service", "food", "دراسة الري وترشيد المياه", "Étude de l’irrigation et gestion de l’eau", "Irrigation and water efficiency studies"),
    ("maintenance", None, "متابعة صيانة التجهيزات", "Suivi de maintenance des équipements", "Equipment maintenance planning"),
    ("consultation", None, "استشارة هندسية ورقمية WEFEH", "Conseil technique et numérique WEFEH", "WEFEH engineering and digital consulting"),
)


def ensure_service_catalog(db):
    # Serialize startup seed transactions across PostgreSQL workers/instances.
    if db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(70401041)"))
    count = 0
    for kind, domain, ar, fr, en in CATALOG:
        existing = db.scalar(select(Service.id).where(Service.provider == CATALOG_PROVIDER,
                                                     Service.type == kind, Service.is_demo.is_(False)))
        if existing is None:
            db.add(Service(type=kind, domain=domain, name_ar=ar, name_fr=fr, name_en=en,
                           provider=CATALOG_PROVIDER, is_demo=False,
                           description="يخضع الطلب لمراجعة النطاق والإمكانات والشروط قبل القبول. لا يمثل الكتالوج شهادة اعتماد أو عقداً."))
            count += 1
    db.flush()
    return count
