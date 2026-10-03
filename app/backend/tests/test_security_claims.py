"""Claim scope, credential lifecycle and password-verifier migration regressions."""
import hashlib
import os
import secrets
import subprocess
import sys
import jwt
import pytest
from app import config
from app.security import create_token, decode_token, hash_password, password_needs_upgrade, verify_password
from .conftest import login


def legacy_hash():
    salt = b"0123456789abcdef"
    return f"pbkdf2${salt.hex()}${hashlib.pbkdf2_hmac('sha256', b'pass#1', salt, 120000).hex()}"


def test_current_hash_and_legacy_upgrade():
    stored = hash_password("secret-with-spaces  ")
    assert stored.startswith("pbkdf2_sha256$600000$")
    assert verify_password("secret-with-spaces  ", stored)
    assert not verify_password("secret-with-spaces", stored)
    assert verify_password("pass#1", legacy_hash())
    assert password_needs_upgrade(legacy_hash())
    assert not password_needs_upgrade(stored)
    assert not verify_password("x", "untrusted$0123$0000")
    assert not verify_password("x", "pbkdf2_sha256$999999999$00$00")


@pytest.mark.parametrize("mutation", ["missing_exp", "missing_iat", "wrong_audience", "wrong_issuer", "negative_subject"])
def test_rejects_signed_but_invalid_claims(mutation):
    payload = jwt.decode(create_token(1, hash_password("pass#1")), config.JWT_SECRET, algorithms=["HS256"], audience="foggara-api", issuer="foggara-dz")
    if mutation == "missing_exp":
        del payload["exp"]
    elif mutation == "missing_iat":
        del payload["iat"]
    elif mutation == "wrong_audience":
        payload["aud"] = "another-service"
    elif mutation == "wrong_issuer":
        payload["iss"] = "another-issuer"
    else:
        payload["sub"] = "-1"
    assert decode_token(jwt.encode(payload, config.JWT_SECRET, algorithm="HS256")) is None


def test_password_change_invalidates_prior_tokens(client, world):
    headers = login(client, "o1m@t.dz")
    assert client.post("/api/auth/password", headers=headers, json={"current_password": "wrong", "new_password": "new-passphrase-123"}).status_code == 401
    assert client.get("/api/auth/me", headers=headers).status_code == 200
    changed = client.post("/api/auth/password", headers=headers, json={"current_password": "pass#1", "new_password": "new-passphrase-123"})
    assert changed.status_code == 200, changed.text
    assert client.get("/api/auth/me", headers=headers).status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {changed.json()['token']}"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "o1m@t.dz", "password": "pass#1"}).status_code == 401
    assert client.post("/api/auth/login", json={"email": "o1m@t.dz", "password": "new-passphrase-123"}).status_code == 200


def test_login_upgrades_legacy_verifier(client, world, db):
    user = world["o1_member"]
    user.password_hash = legacy_hash()
    db.commit()
    headers = login(client, user.email)
    db.refresh(user)
    assert not password_needs_upgrade(user.password_hash)
    assert client.get("/api/auth/me", headers=headers).status_code == 200


def test_credential_change_outside_route_invalidates_session(client, world, db):
    headers = login(client, "o1m@t.dz")
    world["o1_member"].password_hash = hash_password("administrator-reset-secret")
    db.commit()
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_role_checked_against_current_database(client, world, db):
    headers = login(client, "o1r@t.dz")
    world["o1_reviewer"].role = "member"
    db.commit()
    assert client.get("/api/auth/me", headers=headers).json()["role"] == "member"
    world["o1_reviewer"].role = "unsupported"
    db.commit()
    assert client.get("/api/auth/me", headers=headers).status_code == 401


@pytest.mark.parametrize("overrides", [{"JWT_SECRET": "a" * 64}, {"CORS_ORIGINS": "*"}, {"CORS_ORIGINS": "http://example.com"}, {"TOKEN_TTL_HOURS": "0"}, {"TOKEN_TTL_HOURS": "999"}])
def test_production_rejects_unsafe_config(overrides):
    env = dict(os.environ, ENV="prod", DATABASE_URL="postgresql+psycopg://user:password@localhost/foggara", JWT_SECRET=secrets.token_urlsafe(48), CORS_ORIGINS="", TOKEN_TTL_HOURS="12")
    env.update(overrides)
    result = subprocess.run([sys.executable, "-c", "import app.config"], env=env, capture_output=True, text=True)
    assert result.returncode != 0
    assert "RuntimeError" in result.stderr
