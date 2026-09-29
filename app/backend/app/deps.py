from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

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
