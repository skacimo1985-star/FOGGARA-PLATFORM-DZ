from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_current_user
from ..models import AuditLog, User
from ..schemas import AuditOut

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("", response_model=list[AuditOut])
def list_audit(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.execute(select(AuditLog).where(AuditLog.org_id == user.org_id)
                      .order_by(AuditLog.id.desc()).limit(300)).scalars().all()
