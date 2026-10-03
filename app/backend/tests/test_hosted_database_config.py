"""Provider URLs must select the installed driver losslessly."""
import os
import secrets
import subprocess
import sys
import pytest


@pytest.mark.parametrize("prefix", ["postgres://", "postgresql://", "postgresql+psycopg://"])
def test_hosted_postgres_aliases_select_psycopg(prefix):
    suffix = "fixture:encoded%40value@localhost:5432/foggara_test?sslmode=require"
    signing_key = secrets.token_urlsafe(48)
    while len(set(signing_key)) < 16:
        signing_key = secrets.token_urlsafe(48)
    env = dict(os.environ, ENV="prod", DATABASE_URL=prefix + suffix,
               JWT_SECRET=signing_key, CORS_ORIGINS="")
    expected = repr("postgresql+psycopg://" + suffix)
    script = ("from app.config import DATABASE_URL; "
              "from sqlalchemy.engine import make_url; "
              f"assert DATABASE_URL == {expected}; "
              "assert make_url(DATABASE_URL).get_driver_name() == 'psycopg'")
    result = subprocess.run([sys.executable, "-c", script], env=env,
                            capture_output=True, text=True)
    assert result.returncode == 0, result.stderr
