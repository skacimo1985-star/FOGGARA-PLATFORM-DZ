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
    from app.models import Organization, User, Project, Site, Evidence
    from app.security import hash_password
    from app.platform_models import AuthThrottle
    from sqlalchemy import delete
    from app.services.reference_catalog import ensure_reference_catalog
    from playwright.sync_api import sync_playwright, expect
    out = Path("qa")
    out.mkdir(exist_ok=True)
    password = secrets.token_urlsafe(24)
    with SessionLocal() as db:
        ensure_reference_catalog(db)
        org = Organization(code="CI-BROWSER", name_ar="مؤسسة اختبار", name_fr="Test", name_en="Test", is_demo=True)
        db.add(org)
        db.flush()
        db.add_all([
            Site(org_id=org.id, name="CI-Bechar", wilaya="08", lat=31.6, lon=-2.2, is_demo=True),
            Site(org_id=org.id, name="CI-Algiers", wilaya="16", lat=36.7, lon=3.0, is_demo=True),
        ])
        user = User(org_id=org.id, email="browser@example.invalid", password_hash=hash_password(password),
                    full_name="Browser QA", role="admin", locale="ar")
        db.add(user)
        db.flush()
        project = Project(org_id=org.id, title="واحة الاختبار", domain="water", created_by=user.id, site_id=db.scalar(__import__("sqlalchemy").select(Site.id).where(Site.org_id==org.id).order_by(Site.id)), is_demo=True)
        db.add(project)
        db.flush()
        project_id = project.id
        evidence = Evidence(org_id=org.id, project_id=project.id, title="CI-reviewed-lab", doc_type="lab_result", license="internal", status="verified", submitted_by=user.id, is_demo=True)
        db.add(evidence); db.flush(); evidence_id=evidence.id
        db.commit()
    os.environ["RATE_LIMIT_LOGIN_MAX"] = "100"
    os.environ["OPERATIONS_AUTOMATION_ENABLED"] = "true"
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
                expect(page.locator(".wefeh-links")).to_be_visible()
                expect(page.locator(".wefeh-node")).to_have_count(5)
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
                        expect(page.locator(".wefeh-node")).to_have_count(5)
                        assert page.locator(".os-brand-symbol").evaluate("e => e.complete && e.naturalWidth > 0")
                    page.screenshot(path=str(out / f"landing-{locale}.png"), full_page=True)
                page.screenshot(path=str(out / "landing-desktop.png"), full_page=True)
                for index, path in ((0, "/app/agriculture"), (1, "/app/metrology"), (2, "/app/projects")):
                    page.locator(".fg-role-switch button").nth(index).click()
                    expect(page.locator(".fg-role-switch button").nth(index)).to_have_attribute("aria-pressed", "true")
                    expect(page.locator(".fg-guide-card").first).to_have_attribute("href", path)
                page.locator(".fg-guide-preview a").click()
                expect(page.locator("#matrix")).to_be_in_viewport()
                for index in range(5):
                    axis = page.locator(".fp-axis").nth(index)
                    if index > 0:
                        axis.locator("summary").click()
                    axis.locator('input[type="range"]').fill("20")
                    for field, value in enumerate(("50", "0", "100")):
                        axis.locator('input[type="number"]').nth(field).fill(value)
                expect(page.locator(".fp-score-orbit.ready strong")).to_have_text("50.0")
                page.locator(".fp-axis").first.locator('input[type="number"]').first.fill("150")
                page.locator(".fp-axis").first.locator('input[type="checkbox"]').check()
                expect(page.locator(".fp-score-orbit.blocked strong")).to_have_text("—")
                # SPA navigation retains lazy styles: the landing must remain isolated.
                page.locator('.os-brand').click()
                expect(page.locator("#foggara-title")).to_be_visible()
                assert page.locator(".fg-landing-hero").evaluate("e => getComputedStyle(e).display") == "grid"

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
                page.get_by_role("button", name="إرسال الرسالة").click()
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
                page.get_by_role("button", name="البحث في المنصة", exact=True).click()
                expect(page.locator(".os-search-dialog")).to_be_visible()
                page.locator(".os-search-dialog input").fill("واحة الاختبار")
                page.locator(".os-search-dialog-results button").filter(has_text="واحة الاختبار").click()
                expect(page).to_have_url(f"http://127.0.0.1:8000/app/projects/{project_id}")
                page.keyboard.press("Control+k")
                expect(page.locator(".os-search-dialog")).to_be_visible()
                page.keyboard.press("Escape")
                expect(page.locator(".os-search-dialog")).not_to_be_visible()
                page.locator('select[aria-label="اختر الولاية"]').select_option("08")
                expect(page).to_have_url("http://127.0.0.1:8000/app/gis?wilaya=08")
                expect(page.locator("tbody")).to_contain_text("CI-Bechar")
                expect(page.locator("tbody")).not_to_contain_text("CI-Algiers")

                labels = json.loads((Path(__file__).resolve().parents[2] / "src/locales/ar.json").read_text())
                authenticated_visit("/app/registry")
                page.locator('#registry-name').fill("CI-registered-oasis")
                page.locator('#registry-wilaya').select_option("69")
                page.locator('#registry-lat').fill("33.7")
                page.locator('#registry-lon').fill("1.0")
                with page.expect_response(lambda r: r.url.endswith('/api/sites') and r.request.method=='POST') as saved_site:
                    page.get_by_role('button',name=labels['registry']['save'],exact=True).click()
                assert saved_site.value.status==201, saved_site.value.text()
                site_id=saved_site.value.json()['id']
                expect(page.locator('article').filter(has_text="CI-registered-oasis")).to_be_visible()
                authenticated_visit("/app/registry")
                record=page.locator('article').filter(has_text="CI-registered-oasis")
                expect(record).to_be_visible()
                record.get_by_role('button',name=labels['registry']['edit'],exact=True).click()
                page.locator('#registry-name').fill("CI-updated-oasis")
                page.get_by_role('button',name=labels['registry']['save'],exact=True).click()
                expect(page.locator('article').filter(has_text="CI-updated-oasis")).to_be_visible()
                page.locator('button[aria-pressed]').filter(has_text=labels['registry']['resources']).click()
                page.locator('#registry-name').fill('CI-Foggara')
                page.locator('#registry-parent').select_option(str(site_id))
                page.get_by_role('button',name=labels['registry']['save'],exact=True).click()
                expect(page.locator('article').filter(has_text='CI-Foggara')).to_be_visible()
                authenticated_visit('/app/economics')
                page.locator('#economics-project').select_option(str(project_id))
                for field,value in (('title','CI-economic-scenario'),('initial_investment','1000'),('discount_percent','10')):
                    page.locator('#economics-'+field).fill(value)
                page.locator('#economics-source').fill('Explicit isolated test assumptions')
                page.locator('#cash-0-revenue').fill('800')
                page.locator('#cash-0-cost').fill('200')
                page.get_by_role('button',name=labels['economics']['computeSave'],exact=True).click()
                expect(page.get_by_role('heading',name='CI-economic-scenario COMPUTED')).to_be_visible()
                authenticated_visit('/app/economics')
                page.locator('#economics-project').select_option(str(project_id))
                expect(page.get_by_role('heading',name='CI-economic-scenario COMPUTED')).to_be_visible()
                authenticated_visit('/app/intelligence')
                page.locator('#ai-project').select_option(str(project_id))
                page.locator('#ai-question').fill('CI-source-packet: analyse the recorded location')
                page.get_by_role('button',name=labels['intelligence']['prepare'],exact=True).click()
                expect(page.locator('#main-content')).to_contain_text('CI-source-packet')
                expect(page.locator('#main-content')).to_contain_text(labels['intelligence']['missing']['private_model_connection'])
                authenticated_visit('/app/intelligence')
                page.locator('#ai-project').select_option(str(project_id))
                expect(page.locator('#main-content')).to_contain_text('CI-source-packet')
                for path in ('/app/registry','/app/economics','/app/intelligence','/app/references'):
                    authenticated_visit(path)
                    for locale in ('ar','fr','en'):
                        page.get_by_role('combobox',name='Language',exact=True).select_option(locale)
                        for width in (390,768,1440):
                            page.set_viewport_size({'width':width,'height':1000})
                            assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),(path,locale,width)
                    page.get_by_role('combobox',name='Language',exact=True).select_option('ar')
                    page.screenshot(path=str(out / (path.split('/')[-1]+'-desktop.png')),full_page=True)
                authenticated_visit(f"/app/projects/{project_id}")
                page.get_by_role('tab',name=labels['agri']['title'],exact=True).click()
                page.locator('#agri-kind').select_option('water')
                page.locator('#agri-evidence').select_option(str(evidence_id))
                page.locator('[name="source"]').fill('CI-reviewed-laboratory')
                page.locator('[name="observed_at"]').fill('2026-10-01T10:00')
                for field,value in (('sample_id','CI-WATER-01'),('method','Laboratory report'),('sodium_meq_l','4'),('calcium_meq_l','4'),('magnesium_meq_l','4')):
                    page.locator('#agri-'+field).fill(value)
                with page.expect_response(lambda r:'/agriculture/water' in r.url and r.request.method=='POST') as water:
                    page.get_by_role('button',name=labels['agri']['record'],exact=True).click()
                assert water.value.status==201, water.value.text()
                expect(page.locator('[role="tabpanel"][data-state="active"]')).to_contain_text('CI-WATER-01')
                expect(page.locator('[role="tabpanel"][data-state="active"]')).to_contain_text('COMPUTED')
                authenticated_visit("/app/automation")
                expect(page.locator(".ag-runtime")).to_contain_text("المعالجة الذاتية تعمل")
                page.get_by_role("button", name="إعادة بناء النتائج", exact=True).click()
                expect(page.get_by_role("status")).to_contain_text("أُضيفت المهام")
                expect(page.locator(".ag-job-status.completed")).to_be_visible(timeout=45000)
                expect(page.locator(".ag-matrix td button")).to_have_count(25)
                page.locator(".ag-matrix td button").nth(1).click()
                expect(page.locator(".ag-matrix-detail")).to_contain_text("مشاريع مشتركة")
                for locale,title in (("fr","Centre d’automatisation et de liens"),("en","Automation and connections"),("ar","مركز الأتمتة والترابط")):
                    page.get_by_role("combobox", name="Language", exact=True).select_option(locale)
                    expect(page.locator(".ag-automation h1")).to_have_text(title)
                    for width in (390,768,1440):
                        page.set_viewport_size({"width":width,"height":1000})
                        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), ("automation",locale,width)
                page.screenshot(path=str(out / "automation-desktop.png"), full_page=True)
                page.set_viewport_size({"width":390,"height":844})
                page.screenshot(path=str(out / "automation-mobile.png"), full_page=True)
                page.set_viewport_size({"width":1440,"height":1000})
                assert page.request.get("http://127.0.0.1:8000/api/does-not-exist").status == 404
                # Reset only the disposable fixture window before the route inventory.
                # Production throttling is verified independently by API security tests.
                with SessionLocal() as db:
                    db.execute(delete(AuthThrottle)); db.commit()
                for path in ("/app", "/app/registry", "/app/references", "/app/economics", "/app/intelligence", "/app/automation", "/app/projects", "/app/org", "/app/account", "/app/nexus",
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
                    "checks":["public routes","interactive resource network and original logo", "automatic queue completion and connection matrix","role workflows","public matrix calculation and hard constraints","SPA stylesheet isolation","workspace search and keyboard shortcuts","wilaya context filters real sites","AR/FR/EN landing and account","language switching preserves production form inputs","mobile overflow","contact persistence",
                              "authenticated operations","lot creation and reload","API 404","28 protected routes including project details", "registry create/edit/reload", "economic scenarios save/reload", "AI source packets save/reload and honest connection state", "AR/FR/EN new workspaces","no page errors"]
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
