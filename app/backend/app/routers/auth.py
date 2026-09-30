from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, StringConstraints
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import User
from ..schemas import LoginIn, TokenOut, UserOut
from ..security import create_token, hash_password, password_needs_upgrade, verify_password
from ..auth_limits import limit_auth

router = APIRouter(prefix="/api/auth", tags=["auth"])
# Absent accounts still incur one current-cost password verification.
_DUMMY_PASSWORD_HASH = hash_password("unusable-dummy-password-verifier")


@router.post("/login", response_model=TokenOut, dependencies=[Depends(limit_auth)])
def login(payload: LoginIn, db: Session = Depends(get_db)):
    if len(payload.password.encode("utf-8")) > 4096:
        api_error(401, "BAD_CREDENTIALS", "Invalid email or password")
    user = db.execute(select(User).where(User.email == payload.email.lower()).with_for_update()).scalar_one_or_none()
    valid = verify_password(payload.password, user.password_hash if user else _DUMMY_PASSWORD_HASH)
    if user is None or not valid or user.role not in ("member", "reviewer", "admin"):
        api_error(401, "BAD_CREDENTIALS", "Invalid email or password")
    if password_needs_upgrade(user.password_hash):
        user.password_hash = hash_password(payload.password)
    token = create_token(user.id, user.password_hash)
    audit(db, user, "login", "user", entity_id=user.id)
    db.commit()
    return TokenOut(token=token, user=UserOut.model_validate(user))


class PasswordChangeIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: Annotated[str, StringConstraints(min_length=1, max_length=1024)]
    new_password: Annotated[str, StringConstraints(min_length=12, max_length=1024)]


@router.post("/password", response_model=TokenOut, dependencies=[Depends(limit_auth)])
def change_password(payload: PasswordChangeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Lock and refresh to avoid concurrent credential updates overwriting each other.
    current = db.execute(select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True)).scalar_one()
    if not verify_password(payload.current_password, current.password_hash):
        api_error(401, "BAD_CREDENTIALS", "Invalid email or password")
    if payload.current_password == payload.new_password:
        api_error(422, "PASSWORD_UNCHANGED", "Choose a different password")
    current.password_hash = hash_password(payload.new_password)
    audit(db, current, "password_changed", "user", entity_id=current.id)
    token = create_token(current.id, current.password_hash)
    db.commit()
    # All previously issued tokens fail the credential fingerprint check immediately.
    return TokenOut(token=token, user=UserOut.model_validate(current))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
