"""تهيئة أول مدير — مرة واحدة فقط (نشر إنتاجي).

شروط النجاح الثلاثة معًا:
1) جدول المستخدمين فارغ تمامًا (أول إقلاع فقط) — بعده يُغلق المسار نهائيًا 409.
2) SETUP_KEY مضبوط في أسرار الاستضافة (بدونه المسار معطّل 403).
3) ترويسة X-Setup-Key مطابقة (مقارنة بزمن ثابت).

لا كلمة مرور ثابتة ولا حسابات تجريبية عامة — بيانات الاعتماد يدخلها
المشغّل مرة واحدة ولا تُعاد في الرد ولا تُسجَّل.
"""
import hmac
import os

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, Field
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..deps import api_error
from ..models import Organization, User
from ..ratelimit import check_setup_rate
from ..security import hash_password

router = APIRouter(prefix="/api/setup", tags=["setup"])


class BootstrapIn(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=12, max_length=128)
    org_name_ar: str = Field(default="المنظمة الوطنية", max_length=255)
    org_name_fr: str = Field(default="Organisation nationale", max_length=255)
    org_name_en: str = Field(default="National organization", max_length=255)


@router.post("/bootstrap", status_code=201)
def bootstrap_first_admin(request: Request, payload: BootstrapIn,
                          db: Session = Depends(get_db),
                          x_setup_key: str | None = Header(default=None)):
    check_setup_rate(request)
    # Serialize the one-time bootstrap across PostgreSQL workers/processes.
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(7026100301)"))
    users_count = db.execute(select(func.count(User.id))).scalar_one()
    if users_count > 0:
        api_error(409, "SETUP_CLOSED",
                  "Bootstrap is closed: users already exist")

    setup_key = os.environ.get("SETUP_KEY", "")
    if not setup_key:
        api_error(403, "SETUP_DISABLED",
                  "SETUP_KEY is not configured on the server")
    if not x_setup_key or not hmac.compare_digest(x_setup_key, setup_key):
        api_error(403, "SETUP_KEY_INVALID", "Invalid setup key")

    org = Organization(code="DEFAULT-ORG", name_ar=payload.org_name_ar,
                       name_fr=payload.org_name_fr, name_en=payload.org_name_en,
                       is_demo=False)
    db.add(org)
    db.flush()
    admin = User(org_id=org.id, email=payload.email,
                 password_hash=hash_password(payload.password),
                 full_name=payload.full_name, role="admin", locale="ar")
    db.add(admin)
    db.flush()
    audit(db, None, "bootstrap", "user", entity_id=admin.id, org_id=org.id,
          meta={"role": "admin", "first_admin": True})
    db.commit()
    # لا تُعاد كلمة المرور ولا المفتاح إطلاقًا
    return {"status": "created", "org_id": org.id, "admin_id": admin.id,
            "email": admin.email, "next": "login"}
