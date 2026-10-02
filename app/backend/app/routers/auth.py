from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..audit import audit
from ..db import get_db
from ..deps import api_error, get_current_user
from ..models import User
from ..ratelimit import check_login_rate
from ..schemas import LoginIn, TokenOut, UserOut
from ..security import create_token, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut)
def login(request: Request, payload: LoginIn, db: Session = Depends(get_db)):
    check_login_rate(request)
    user = db.execute(select(User).where(User.email == payload.email.lower())).scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.password_hash):
        api_error(401, "BAD_CREDENTIALS", "Invalid email or password")
    token = create_token(user.id, user.password_hash)
    audit(db, user, "login", "user", entity_id=user.id)
    db.commit()
    return TokenOut(token=token, user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user
