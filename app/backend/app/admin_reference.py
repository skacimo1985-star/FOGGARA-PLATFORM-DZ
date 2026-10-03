"""Verified national wilaya reference seed for the 2026 territorial framework.

Names/codes 01-58 follow the established official wilaya numbering.
The eleven wilayas created by Law 26-06 are included without an invented
official numeric code; their full operational date is recorded as 2027-01-01.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from .gis_models import AdministrativeVersion, Wilaya

LAW_SOURCE = "https://www.joradp.dz/FTP/jo-francais/2026/F2026025.pdf"
MINISTRY_SOURCE = "https://interieur.gov.dz/2026/05/17/le-ministre-de-linterieur-preside-une-reunion-de-coordination-pour-assurer-le-suivi-de-la-mise-en-place-des-onze-nouvelles-wilayas-et-des-preparatifs-logistiques-des-processus-electoraux-qui-sy-de/"

# reference_key, official_code, ar, fr, en, operational_from
WILAYAS_2026 = [
    ("adrar", "01", "أدرار", "Adrar", "Adrar", None),
    ("chlef", "02", "الشلف", "Chlef", "Chlef", None),
    ("laghouat", "03", "الأغواط", "Laghouat", "Laghouat", None),
    ("oum-el-bouaghi", "04", "أم البواقي", "Oum El Bouaghi", "Oum El Bouaghi", None),
    ("batna", "05", "باتنة", "Batna", "Batna", None),
    ("bejaia", "06", "بجاية", "Béjaïa", "Bejaia", None),
    ("biskra", "07", "بسكرة", "Biskra", "Biskra", None),
    ("bechar", "08", "بشار", "Béchar", "Bechar", None),
    ("blida", "09", "البليدة", "Blida", "Blida", None),
    ("bouira", "10", "البويرة", "Bouira", "Bouira", None),
    ("tamanrasset", "11", "تمنراست", "Tamanrasset", "Tamanrasset", None),
    ("tebessa", "12", "تبسة", "Tébessa", "Tebessa", None),
    ("tlemcen", "13", "تلمسان", "Tlemcen", "Tlemcen", None),
    ("tiaret", "14", "تيارت", "Tiaret", "Tiaret", None),
    ("tizi-ouzou", "15", "تيزي وزو", "Tizi Ouzou", "Tizi Ouzou", None),
    ("alger", "16", "الجزائر", "Alger", "Algiers", None),
    ("djelfa", "17", "الجلفة", "Djelfa", "Djelfa", None),
    ("jijel", "18", "جيجل", "Jijel", "Jijel", None),
    ("setif", "19", "سطيف", "Sétif", "Setif", None),
    ("saida", "20", "سعيدة", "Saïda", "Saida", None),
    ("skikda", "21", "سكيكدة", "Skikda", "Skikda", None),
    ("sidi-bel-abbes", "22", "سيدي بلعباس", "Sidi Bel Abbès", "Sidi Bel Abbes", None),
    ("annaba", "23", "عنابة", "Annaba", "Annaba", None),
    ("guelma", "24", "قالمة", "Guelma", "Guelma", None),
    ("constantine", "25", "قسنطينة", "Constantine", "Constantine", None),
    ("medea", "26", "المدية", "Médéa", "Medea", None),
    ("mostaganem", "27", "مستغانم", "Mostaganem", "Mostaganem", None),
    ("msila", "28", "المسيلة", "M'Sila", "M'Sila", None),
    ("mascara", "29", "معسكر", "Mascara", "Mascara", None),
    ("ouargla", "30", "ورقلة", "Ouargla", "Ouargla", None),
    ("oran", "31", "وهران", "Oran", "Oran", None),
    ("el-bayadh", "32", "البيض", "El Bayadh", "El Bayadh", None),
    ("illizi", "33", "إليزي", "Illizi", "Illizi", None),
    ("bordj-bou-arreridj", "34", "برج بوعريريج", "Bordj Bou Arréridj", "Bordj Bou Arreridj", None),
    ("boumerdes", "35", "بومرداس", "Boumerdès", "Boumerdes", None),
    ("el-tarf", "36", "الطارف", "El Tarf", "El Tarf", None),
    ("tindouf", "37", "تندوف", "Tindouf", "Tindouf", None),
    ("tissemsilt", "38", "تيسمسيلت", "Tissemsilt", "Tissemsilt", None),
    ("el-oued", "39", "الوادي", "El Oued", "El Oued", None),
    ("khenchela", "40", "خنشلة", "Khenchela", "Khenchela", None),
    ("souk-ahras", "41", "سوق أهراس", "Souk Ahras", "Souk Ahras", None),
    ("tipaza", "42", "تيبازة", "Tipaza", "Tipaza", None),
    ("mila", "43", "ميلة", "Mila", "Mila", None),
    ("ain-defla", "44", "عين الدفلى", "Aïn Defla", "Ain Defla", None),
    ("naama", "45", "النعامة", "Naâma", "Naama", None),
    ("ain-temouchent", "46", "عين تموشنت", "Aïn Témouchent", "Ain Temouchent", None),
    ("ghardaia", "47", "غرداية", "Ghardaïa", "Ghardaia", None),
    ("relizane", "48", "غليزان", "Relizane", "Relizane", None),
    ("timimoun", "49", "تيميمون", "Timimoun", "Timimoun", None),
    ("bordj-badji-mokhtar", "50", "برج باجي مختار", "Bordj Badji Mokhtar", "Bordj Badji Mokhtar", None),
    ("ouled-djellal", "51", "أولاد جلال", "Ouled Djellal", "Ouled Djellal", None),
    ("beni-abbes", "52", "بني عباس", "Béni Abbès", "Beni Abbes", None),
    ("in-salah", "53", "إن صالح", "In Salah", "In Salah", None),
    ("in-guezzam", "54", "إن قزام", "In Guezzam", "In Guezzam", None),
    ("touggourt", "55", "تقرت", "Touggourt", "Touggourt", None),
    ("djanet", "56", "جانت", "Djanet", "Djanet", None),
    ("el-mghair", "57", "المغير", "El M'Ghair", "El M'Ghair", None),
    ("el-meniaa", "58", "المنيعة", "El Meniaâ", "El Meniaa", None),
    ("aflou", None, "آفلو", "Aflou", "Aflou", date(2027, 1, 1)),
    ("barika", None, "بريكة", "Barika", "Barika", date(2027, 1, 1)),
    ("ksar-chellala", None, "قصر الشلالة", "Ksar Chellala", "Ksar Chellala", date(2027, 1, 1)),
    ("messaad", None, "مسعد", "Messaad", "Messaad", date(2027, 1, 1)),
    ("ain-oussera", None, "عين وسارة", "Aïn Oussera", "Ain Oussera", date(2027, 1, 1)),
    ("bou-saada", None, "بوسعادة", "Bou Saâda", "Bou Saada", date(2027, 1, 1)),
    ("el-abiodh-sidi-cheikh", None, "الأبيض سيدي الشيخ", "El Bayadh Sidi Cheikh", "El Abiodh Sidi Cheikh", date(2027, 1, 1)),
    ("el-kantara", None, "القنطرة", "El Kantara", "El Kantara", date(2027, 1, 1)),
    ("bir-el-ater", None, "بئر العاتر", "Bir El Ater", "Bir El Ater", date(2027, 1, 1)),
    ("ksar-el-boukhari", None, "قصر البخاري", "Ksar El Boukhari", "Ksar El Boukhari", date(2027, 1, 1)),
    ("el-aricha", None, "العريشة", "El Aricha", "El Aricha", date(2027, 1, 1)),
]


def ensure_2026_wilaya_reference(db: Session) -> AdministrativeVersion:
    version = db.scalar(select(AdministrativeVersion).where(
        AdministrativeVersion.code == "DZ-ORG-26-06-2026"
    ))
    if version is None:
        version = AdministrativeVersion(
            code="DZ-ORG-26-06-2026",
            title="Algeria territorial organization — Law 26-06",
            valid_from=date(2026, 4, 5),
            source_title="Journal officiel n°25 — Loi n°26-06",
            source_uri=LAW_SOURCE,
            source_date=date(2026, 4, 5),
            verified=True,
        )
        db.add(version)
        db.flush()

    for key, official_code, ar, fr, en, operational_from in WILAYAS_2026:
        row = db.scalar(select(Wilaya).where(
            Wilaya.version_id == version.id, Wilaya.reference_key == key
        ))
        source = MINISTRY_SOURCE if official_code is None else LAW_SOURCE
        if row is None:
            row = Wilaya(
                version_id=version.id,
                reference_key=key,
                official_code=official_code,
                operational_from=operational_from,
                name_ar=ar,
                name_fr=fr,
                name_en=en,
                source_uri=source,
                verified=True,
            )
            db.add(row)
        else:
            row.official_code = official_code
            row.operational_from = operational_from
            row.name_ar, row.name_fr, row.name_en = ar, fr, en
            row.source_uri = source
            row.verified = True
    db.flush()
    return version
