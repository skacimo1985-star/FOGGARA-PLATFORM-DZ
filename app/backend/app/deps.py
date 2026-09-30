import hmac

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .db import get_db
from .models import User
from .security import credential_fingerprint, decode_token_claims

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
    claims = decode_token_claims(cred.credentials)
    if claims is None:
        api_error(401, "AUTH_INVALID", "Invalid or expired token")
    user = db.get(User, int(claims["sub"]))
    if user is None or user.role not in ("member", "reviewer", "admin") or not hmac.compare_digest(
        claims["cv"], credential_fingerprint(user.password_hash)
    ):
        api_error(401, "AUTH_INVALID", "Invalid or expired token")
    return user


def require_reviewer(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("reviewer", "admin"):
        api_error(403, "ROLE_FORBIDDEN", "Reviewer role required")
    return user

