"""Real Chromium integration checks against a disposable CI PostgreSQL database."""
import json
import base64
import os
import secrets
import subprocess
import sys
import time
from pathlib import Path
import httpx

def main():
    if os.environ.get("CI") != "true" or "foggara_migration" not in os.environ.get("DATABASE_URL", ""):
        raise RuntimeError("This test requires the isolated CI foggara_migration database")
    from app.db import SessionLocal
    from app.models import Organization, User, Project
    from app.security import hash_password
    from playwright.sync_api import sync_playwright, expect
    out = Path("qa")
    out.mkdir(exist_ok=True)
    password = secrets.token_urlsafe(24)
    with SessionLocal() as db:
        org = Organization(code="CI-BROWSER", name_ar="مؤسسة اختبار", name_fr="Test", name_en="Test", is_demo=True)
        db.add(org)
        db.flush()
        user = User(org_id=org.id, email="browser@example.invalid", password_hash=hash_password(password),
                    full_name="Browser QA", role="admin", locale="ar")
        db.add(user)
        db.flush()
        db.add(Project(org_id=org.id, title="واحة الاختبار", domain="water", created_by=user.id, is_demo=True))
        db.commit()
    with (out / "server.log").open("w") as log:
        process = subprocess.Popen([sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
                                   stdout=log, stderr=log)
        try:
            for _ in range(40):
                try:
                    if httpx.get("http://127.0.0.1:8000/api/health").status_code == 200:
                        break
                except httpx.ConnectError:
                    pass
                time.sleep(.5)
            else:
                raise RuntimeError("Server did not become healthy")
            with sync_playwright() as p:
                browser = p.chromium.launch()
                page = browser.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
                errors = []
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.goto("http://127.0.0.1:8000/", wait_until="networkidle")
                expect(page.locator("#foggara-title")).to_be_visible()
                image_loaded = page.locator(".fg-hero-photo").evaluate("(img) => img.complete && img.naturalWidth > 0")
                assert image_loaded, "Hero photograph must load"
                page.screenshot(path=str(out / "landing-desktop.png"), full_page=True)
                print("FOGGARA_DESKTOP_PREVIEW=" + base64.b64encode(page.screenshot(type="jpeg", quality=60)).decode())
                for width in (390, 768):
                    page.set_viewport_size({"width": width, "height": 844})
                    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "Horizontal overflow"
                    page.screenshot(path=str(out / f"landing-{width}.png"), full_page=True)
                for path in ("about", "privacy", "terms", "rights", "contact"):
                    response = page.goto("http://127.0.0.1:8000/" + path)
                    assert response.status == 200
                    expect(page.locator("h1")).to_be_visible()
                page.locator('[name="name"]').fill("اختبار التواصل")
                page.locator('[name="email"]').fill("qa@example.invalid")
                page.locator('[name="subject"]').fill("طلب اختبار")
                page.locator('[name="message"]').fill("رسالة اختبار للتأكد من الحفظ في قاعدة البيانات")
                page.locator('[name="consent"]').check()
                page.get_by_role("button", name="تسجيل الرسالة").click()
                expect(page.get_by_role("status")).to_contain_text("FG-")
                page.reload()
                # Authentication uses the real API, then the same persisted session as the browser UI.
                response = page.request.post("http://127.0.0.1:8000/api/auth/login",
                    data={"email": "browser@example.invalid", "password": password})
                assert response.ok
                token = response.json()["token"]
                page.evaluate("(token) => localStorage.setItem('token', token)", token)
                page.goto("http://127.0.0.1:8000/app/operations")
                expect(page.locator(".fg-console h1")).to_be_visible()
                expect(page.locator(".fg-empty")).to_be_visible()
                page.get_by_role("button", name="دفعات الإنتاج", exact=True).click()
                page.locator('[name="project_id"]').select_option(label="واحة الاختبار · DEMO")
                page.locator('[name="code"]').fill("CI-LOT-001")
                page.locator('[name="product"]').fill("تمور الاختبار")
                page.locator('[name="quantity"]').fill("25")
                page.get_by_role("button", name="إضافة دفعة إنتاج").click()
                expect(page.locator(".fg-record")).to_contain_text("CI-LOT-001")
                page.reload()
                expect(page.locator(".fg-console")).to_be_visible()
                page.get_by_role("button", name="دفعات الإنتاج", exact=True).click()
                expect(page.locator(".fg-record")).to_contain_text("CI-LOT-001")
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
                page.screenshot(path=str(out / "operations-mobile.png"), full_page=True)
                page.set_viewport_size({"width":1440,"height":1000})
                page.screenshot(path=str(out / "operations-desktop.png"), full_page=True)
                print("FOGGARA_OPERATIONS_PREVIEW=" + base64.b64encode(page.screenshot(type="jpeg", quality=60)).decode())
                assert page.request.get("http://127.0.0.1:8000/api/does-not-exist").status == 404
                assert not errors, errors
                (out / "results.json").write_text(json.dumps({
                    "status":"passed", "browser":"Chromium", "viewports":[390,768,1440],
                    "checks":["public routes","photograph","mobile overflow","contact persistence",
                              "authenticated operations","lot creation and reload","API 404","no page errors"]
                }, indent=2))
                browser.close()
        finally:
            process.terminate()
            process.wait(timeout=15)

if __name__ == "__main__":
    main()
