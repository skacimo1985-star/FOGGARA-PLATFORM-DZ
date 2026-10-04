"""Real Chromium integration checks against a disposable CI PostgreSQL database."""
import json
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
        project = Project(org_id=org.id, title="واحة الاختبار", domain="water", created_by=user.id, is_demo=True)
        db.add(project)
        db.flush()
        project_id = project.id
        db.commit()
    os.environ["RATE_LIMIT_LOGIN_MAX"] = "100"
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
                console_errors = []
                page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
                page.on("pageerror", lambda e: errors.append(str(e)))
                page.goto("http://127.0.0.1:8000/", wait_until="networkidle")
                expect(page.locator("#foggara-title")).to_be_visible()
                expect(page.locator(".cinematic-canvas")).to_be_visible()
                expect(page.locator(".cinematic-node")).to_have_count(5)
                for locale, title in (("fr", "Des ressources reliées."), ("en", "Connected resources."), ("ar", "موارد مترابطة.")):
                    page.get_by_role("combobox", name="Language", exact=True).select_option(locale)
                    expect(page.locator("#foggara-title")).to_contain_text(title)
                    expect(page.locator("html")).to_have_attribute("dir", "rtl" if locale == "ar" else "ltr")
                    page.locator(".fg-pillars button").first.click()
                    expect(page.locator(".fg-pillars button").first).to_have_attribute("aria-pressed", "true")
                    expect(page.locator(".fg-landing-selection a")).to_have_attribute("href", "/app/explore/water")
                    page.locator(".fg-pillars button").first.click()
                    for width in (390, 768, 1440):
                        page.set_viewport_size({"width": width, "height": 1000})
                        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), (locale, width)
                        page.wait_for_function("""() => {
                            const canvas = document.querySelector('.cinematic-canvas');
                            const pixel = canvas.getContext('2d').getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
                            return pixel[0] + pixel[1] + pixel[2] > 0;
                        }""")
                    page.screenshot(path=str(out / f"landing-{locale}.png"), full_page=True)
                page.screenshot(path=str(out / "landing-desktop.png"), full_page=True)

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
                def authenticated_visit(path):
                    page.goto("http://127.0.0.1:8000" + path)
                    expect(page.locator("#email")).to_be_visible()
                    page.locator("#email").fill("browser@example.invalid")
                    page.locator("#password").fill(password)
                    page.locator('button[type="submit"]').click()
                    expect(page).to_have_url("http://127.0.0.1:8000" + path)
                    page.wait_for_load_state("networkidle")
                authenticated_visit("/app/operations")
                expect(page.locator(".fg-console h1")).to_be_visible()
                expect(page.locator(".fg-empty")).to_be_visible()
                page.get_by_role("button", name="دفعات الإنتاج", exact=True).click()
                page.locator('[name="project_id"]').select_option(label="واحة الاختبار · DEMO")
                selected_project = page.locator('[name="project_id"]').input_value()
                page.get_by_role("button", name="تحديث البيانات").click()
                expect(page.get_by_role("button", name="إضافة دفعة إنتاج")).to_be_enabled()
                expect(page.locator('[name="project_id"]')).to_have_value(selected_project)
                page.locator('[name="code"]').fill("CI-LOT-001")
                page.locator('[name="product"]').fill("تمور الاختبار")
                page.locator('[name="quantity"]').fill("25")
                for locale, button in (("fr", "Ajouter un lot de production"), ("en", "Add production lot"), ("ar", "إضافة دفعة إنتاج")):
                    page.get_by_role("combobox", name="Language", exact=True).select_option(locale)
                    expect(page.get_by_role("button", name=button, exact=True)).to_be_enabled()
                    expect(page.locator('[name="project_id"]')).to_have_value(selected_project)
                    expect(page.locator('[name="code"]')).to_have_value("CI-LOT-001")
                    expect(page.locator('[name="quantity"]')).to_have_value("25")
                with page.expect_response(lambda r: r.url.endswith("/api/operations/lots") and r.request.method == "POST") as saved:
                    page.get_by_role("button", name="إضافة دفعة إنتاج").click()
                assert saved.value.status == 201, saved.value.text()
                expect(page.locator(".fg-record")).to_contain_text("CI-LOT-001")
                authenticated_visit("/app/operations")
                expect(page.locator(".fg-console")).to_be_visible()
                page.get_by_role("button", name="دفعات الإنتاج", exact=True).click()
                expect(page.locator(".fg-record")).to_contain_text("CI-LOT-001")
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
                page.screenshot(path=str(out / "operations-mobile.png"), full_page=True)
                page.set_viewport_size({"width":1440,"height":1000})
                page.screenshot(path=str(out / "operations-desktop.png"), full_page=True)

                assert page.request.get("http://127.0.0.1:8000/api/does-not-exist").status == 404
                for path in ("/app", "/app/projects", "/app/org", "/app/account", "/app/nexus",
                             "/app/studio", "/app/resources", "/app/opportunities", "/app/vde",
                             "/app/agriculture", "/app/telemetry", "/app/simulator", "/app/gis",
                             "/app/decisions", "/app/services", "/app/metrology", "/app/water",
                             "/app/review", "/app/audit", "/app/explore", "/app/analytics", "/app/iot",
                             f"/app/projects/{project_id}"):
                    authenticated_visit(path)
                    expect(page.locator("#main-content")).to_be_visible()
                    if path == "/app/iot":
                        # This planned module deliberately shows one field-control safety notice.
                        expect(page.get_by_role("alert")).to_have_count(1)
                        expect(page.get_by_role("alert")).to_contain_text("الأوامر الميدانية حساسة وممنوعة")
                    else:
                        assert not page.get_by_role("alert").count(), (path, page.locator("body").inner_text()[:1000], console_errors[-5:])
                    if path in ("/app", "/app/nexus", "/app/agriculture"):
                        page.screenshot(path=str(out / (path.split("/")[-1] + "-workspace.png")), full_page=True)
                    if path == "/app/account":
                        for locale, title in (("fr", "Équipe et compte"), ("en", "Team and account"), ("ar", "الفريق والحساب")):
                            page.get_by_role("combobox", name="Language", exact=True).select_option(locale)
                            expect(page.locator(".fg-console h1")).to_have_text(title)
                assert not errors, errors
                (out / "results.json").write_text(json.dumps({
                    "status":"passed", "browser":"Chromium", "viewports":[390,768,1440],
                    "checks":["public routes","interactive Kasria","AR/FR/EN landing and account","language switching preserves production form inputs","mobile overflow","contact persistence",
                              "authenticated operations","lot creation and reload","API 404","23 protected routes including project details","no page errors"]
                }, indent=2))
                browser.close()
        except Exception:
            if "page" in locals():
                try:
                    page.screenshot(path=str(out / "failure.png"), full_page=True)
                    print("FOGGARA_BROWSER_ERROR=" + page.locator("body").inner_text()[:4000])
                except Exception:
                    pass
            raise
        finally:
            process.terminate()
            process.wait(timeout=15)

if __name__ == "__main__":
    main()
