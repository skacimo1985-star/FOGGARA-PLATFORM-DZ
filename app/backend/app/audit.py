from sqlalchemy.orm import Session

from .models import AuditLog, User


def audit(db: Session, user: User | None, action: str, entity_type: str,
          entity_id: int | None = None, project_id: int | None = None,
          org_id: int | None = None, meta: dict | None = None):
    entry = AuditLog(
        org_id=org_id if org_id is not None else (user.org_id if user else 0),
        user_id=user.id if user else None,
        project_id=project_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        meta=meta or {},
    )
    db.add(entry)
