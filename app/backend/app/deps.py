from fastapi import Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import config
from .db import get_db
from .models import User
from .security import decode_token

_bearer = HTTPBearer(auto_error=False)


def api_error(status: int, code: str, message: str):
    """Structured error: the frontend localizes by `code`."""
    raise HTTPException(status_code=status, detail={"code": code, "message": message})


def get_current_user(
    cred: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if cred is None:
        api_error(401, "AUTH_REQUIRED", "Authentication required")
    user_id = decode_token(cred.credentials)
    if user_id is None:
        api_error(401, "AUTH_INVALID", "Invalid or expired token")
    user = db.get(User, user_id)
    if user is None:
        api_error(401, "AUTH_INVALID", "Invalid or expired token")
    return user


def require_reviewer(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("reviewer", "admin"):
        api_error(403, "ROLE_FORBIDDEN", "Reviewer role required")
    return user


# ---- ترقيم الصفحات ----
# سقف ثابت في التحقق (422 فوقه)، ثم تُقيَّد القيمة بسقف الخادم LIST_MAX_LIMIT.
def pagination(page: int = Query(default=1, ge=1),
               page_size: int = Query(default=50, ge=1, le=1000)) -> tuple[int, int]:
    return page, min(page_size, config.LIST_MAX_LIMIT)


def paginate(db: Session, stmt, page: int, page_size: int):
    """يعيد (items, total, pages) لاستعلام مرتّب ثابت — عدّ + شريحة واحدة."""
    from sqlalchemy import func, select
    total = db.execute(select(func.count()).select_from(stmt.subquery())).scalar_one()
    items = db.execute(stmt.limit(page_size).offset((page - 1) * page_size)).scalars().all()
    pages = max(1, (total + page_size - 1) // page_size)
    return items, total, pages
