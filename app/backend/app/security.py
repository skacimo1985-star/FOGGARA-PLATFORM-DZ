"""Password hashing and strictly scoped, credential-bound access tokens."""
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt

from . import config

_ALGO = "HS256"
_ISSUER = "foggara-dz"
_AUDIENCE = "foggara-api"
_PASSWORD_ITERATIONS = 600_000
_MAX_PASSWORD_BYTES = 4096


def hash_password(password: str) -> str:
    encoded = password.encode("utf-8")
    if len(encoded) > _MAX_PASSWORD_BYTES:
        raise ValueError("Password is too long")
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", encoded, salt, _PASSWORD_ITERATIONS)
    return f"pbkdf2_sha256${_PASSWORD_ITERATIONS}${salt.hex()}${dk.hex()}"


def _password_parts(stored: str):
    parts = stored.split("$")
    if len(parts) == 3 and parts[0] == "pbkdf2":
        iterations, salt_hex, dk_hex = 120_000, parts[1], parts[2]
    elif len(parts) == 4 and parts[0] == "pbkdf2_sha256":
        iterations, salt_hex, dk_hex = int(parts[1]), parts[2], parts[3]
    else:
        raise ValueError("Unknown password scheme")
    salt, expected = bytes.fromhex(salt_hex), bytes.fromhex(dk_hex)
    if not 120_000 <= iterations <= 2_000_000 or len(salt) != 16 or len(expected) != 32:
        raise ValueError("Malformed password hash")
    return iterations, salt, expected


def verify_password(password: str, stored: str) -> bool:
    try:
        encoded = password.encode("utf-8")
        if len(encoded) > _MAX_PASSWORD_BYTES:
            return False
        iterations, salt, expected = _password_parts(stored)
        result = hashlib.pbkdf2_hmac("sha256", encoded, salt, iterations)
        return hmac.compare_digest(result, expected)
    except (ValueError, TypeError, AttributeError):
        return False


def password_needs_upgrade(stored: str) -> bool:
    try:
        return _password_parts(stored)[0] < _PASSWORD_ITERATIONS
    except (ValueError, TypeError, AttributeError):
        return True


def credential_fingerprint(password_hash: str) -> str:
    # A keyed digest does not disclose the database password verifier in a JWT.
    return hmac.new(config.JWT_SECRET.encode(), ("credential:" + password_hash).encode(), hashlib.sha256).hexdigest()


def create_token(user_id: int, password_hash: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + timedelta(hours=config.TOKEN_TTL_HOURS),
               "iss": _ISSUER, "aud": _AUDIENCE, "jti": secrets.token_hex(16),
               "cv": credential_fingerprint(password_hash)}
    return jwt.encode(payload, config.JWT_SECRET, algorithm=_ALGO)


def decode_token_claims(token: str) -> dict | None:
    if not isinstance(token, str) or len(token) > 4096:
        return None
    try:
        payload = jwt.decode(token, config.JWT_SECRET, algorithms=[_ALGO], issuer=_ISSUER,
                             audience=_AUDIENCE, options={"require": ["sub", "iat", "exp", "iss", "aud", "jti", "cv"]})
        if not isinstance(payload["sub"], str) or not payload["sub"].isdigit() or int(payload["sub"]) <= 0:
            return None
        if not isinstance(payload["cv"], str) or len(payload["cv"]) != 64:
            return None
        return payload
    except (jwt.PyJWTError, ValueError, TypeError):
        return None


def decode_token(token: str) -> int | None:
    payload = decode_token_claims(token)
    return int(payload["sub"]) if payload else None
