"""اختبارات نشر الإنتاج: bootstrap أول مدير + تقييد SEED_DEMO.

bootstrap: يعمل مرة واحدة فقط على قاعدة فارغة المستخدمين، بمفتاح إعداد
من أسرار الاستضافة، ويُغلق نهائيًا بعدها. SEED_DEMO=false: لا حسابات DEMO.
"""
import os
import subprocess
import sys

import pytest

from app.models import User

BOOT = "/api/setup/bootstrap"
KEY = "test-setup-key-0123456789"


def _payload():
    return {"email": "owner@foggara.dz", "full_name": "المدير الأول",
            "password": "StrongPass#2026xyz"}


def test_bootstrap_requires_empty_users(client, world):
    """وجود مستخدمين (أي بيئة عاملة) يغلق المسار دائمًا."""
    r = client.post(BOOT, json=_payload(), headers={"X-Setup-Key": KEY})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "SETUP_CLOSED"


def test_bootstrap_requires_setup_key(client, db, monkeypatch):
    monkeypatch.delenv("SETUP_KEY", raising=False)
    r = client.post(BOOT, json=_payload(), headers={"X-Setup-Key": KEY})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "SETUP_DISABLED"


def test_bootstrap_rejects_wrong_key(client, db, monkeypatch):
    monkeypatch.setenv("SETUP_KEY", KEY)
    r = client.post(BOOT, json=_payload(), headers={"X-Setup-Key": "wrong"})
    assert r.status_code == 403 and r.json()["detail"]["code"] == "SETUP_KEY_INVALID"


def test_bootstrap_weak_password_rejected(client, db, monkeypatch):
    monkeypatch.setenv("SETUP_KEY", KEY)
    bad = _payload()
    bad["password"] = "short"
    r = client.post(BOOT, json=bad, headers={"X-Setup-Key": KEY})
    assert r.status_code == 422


def test_bootstrap_once_only_and_login(client, db, monkeypatch):
    monkeypatch.setenv("SETUP_KEY", KEY)
    r = client.post(BOOT, json=_payload(), headers={"X-Setup-Key": KEY})
    assert r.status_code == 201, r.text
    body = r.json()
    assert "password" not in body and KEY not in str(body)  # لا ارتداد للأسرار

    # المدير يسجّل دخوله فعلًا بكلمة المرور التي اختارها
    r_login = client.post("/api/auth/login",
                          json={"email": "owner@foggara.dz",
                                "password": "StrongPass#2026xyz"})
    assert r_login.status_code == 200 and "token" in r_login.json()

    # التكرار مستحيل — المسار مغلق نهائيًا حتى بالمفتاح الصحيح
    r2 = client.post(BOOT, json=_payload(), headers={"X-Setup-Key": KEY})
    assert r2.status_code == 409 and r2.json()["detail"]["code"] == "SETUP_CLOSED"


def test_seed_demo_false_creates_no_users(db, monkeypatch):
    """SEED_DEMO=false: لا حسابات تجريبية ولا بيانات محاكاة إطلاقًا."""
    monkeypatch.setenv("SEED_DEMO", "false")
    import seed
    seed.main()
    assert db.execute(
        __import__("sqlalchemy").select(__import__("sqlalchemy").func.count(User.id))
    ).scalar_one() == 0


def test_prod_seed_demo_requires_explicit_demo_instance(monkeypatch):
    monkeypatch.setenv("ENV", "prod")
    monkeypatch.setenv("SEED_DEMO", "true")
    monkeypatch.delenv("DEMO_INSTANCE", raising=False)
    import seed
    with pytest.raises(RuntimeError, match="requires DEMO_INSTANCE=true"):
        seed._seed_demo_enabled()


def test_prod_demo_instance_can_explicitly_enable_synthetic_seed(monkeypatch):
    monkeypatch.setenv("ENV", "prod")
    monkeypatch.setenv("SEED_DEMO", "true")
    monkeypatch.setenv("DEMO_INSTANCE", "true")
    import seed
    assert seed._seed_demo_enabled() is True
