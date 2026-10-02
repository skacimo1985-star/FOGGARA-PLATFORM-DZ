import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt

from . import config

_ALGO = "HS256"


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 120_000)
    return f"pbkdf2${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, dk_hex = stored.split("$")
        dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 120_000)
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


def credential_stamp(password_hash: str) -> str:
    return hmac.new(config.JWT_SECRET.encode(), password_hash.encode(), hashlib.sha256).hexdigest()


def create_token(user_id: int, password_hash: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + timedelta(hours=config.TOKEN_TTL_HOURS),
               "credential": credential_stamp(password_hash)}
    return jwt.encode(payload, config.JWT_SECRET, algorithm=_ALGO)


def decode_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, config.JWT_SECRET, algorithms=[_ALGO], options={"require": ["sub", "iat", "exp", "credential"]})
        return int(payload["sub"])
    except Exception:
        return None


def token_matches_credentials(token: str, password_hash: str) -> bool:
    try:
        payload = jwt.decode(token, config.JWT_SECRET, algorithms=[_ALGO],
                             options={"require": ["sub", "iat", "exp", "credential"]})
        return hmac.compare_digest(payload["credential"], credential_stamp(password_hash))
    except Exception:
        return False
