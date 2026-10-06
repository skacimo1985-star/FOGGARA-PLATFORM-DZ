"""Real Chromium integration checks against a disposable CI PostgreSQL database."""
import json
import os
import secrets
import subprocess
import sys
import time
from pathlib import Path
import httpx

def ensure_no_overflow(page, context):
    if page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"):
        return
    page.screenshot(path="qa/overflow-failure.png", full_page=True)
    offending = page.evaluate("""() => [...document.querySelectorAll('body *')].map(e => {
        const r=e.getBoundingClientRect();
        return {tag:e.tagName, cls:e.className?.baseVal ?? e.className,
                left:Math.round(r.left), right:Math.round(r.right), width:Math.round(r.width)};
    }).filter(e => e.width>0 && (e.right>innerWidth+1 || e.left < -1)).slice(0,20)""")
    raise AssertionError((context, offending))


def main():
    if os.environ.get("CI") != "true" or "foggara_migration" not in os.environ.get("DATABASE_URL", ""):
        raise RuntimeError("This test requires the isolated CI foggara_migration database")
    from app.db import SessionLocal
    from app.models import AgriParcel, Organization, User, Project, Site, Measurement
    from datetime import datetime, timedelta, timezone
    from app.services.catalog import ensure_service_catalog
    from app.security import hash_password
    from playwright.sync_api import sync_playwright, expect
    out = Path("qa")
    out.mkdir(exist_ok=True)
    password = secrets.token_urlsafe(24)
    with SessionLocal() as db:
        org = Organization(code="CI-BROWSER", name_ar="مؤسسة اختبار", name_fr="Test", name_en="Test", is_demo=True)
        db.add(org)
        db.flush()
        site_bechar = Site(org_id=org.id, name="CI-Bechar", wilaya="08", lat=31.6, lon=-2.2, is_demo=True)
        site_algiers = Site(org_id=org.id, name="CI-Algiers", wilaya="16", lat=36.7, lon=3.0, is_demo=True)
        db.add_all([site_bechar, site_algiers])
        user = User(org_id=org.id, email="browser@example.invalid", password_hash=hash_password(password),
                    full_name="Browser QA", role="admin", locale="ar")
        db.add(user)
        db.flush()
        project = Project(org_id=org.id, title="واحة الاختبار", domain="water", site_id=site_bechar.id,
                          created_by=user.id, is_demo=True)
        db.add(project)
        db.flush()
        project_id = project.id
        site_bechar_id = site_bechar.id
        parcel = AgriParcel(
            org_id=org.id, name="CI Field", crop="wheat", area_ha=2.5, location="CI-Bechar",
            site_id=site_bechar.id, lat=31.6, lon=-2.2, stage="development",
            boundary_geojson={"type":"Polygon","coordinates":[[
                [-2.205,31.595],[-2.195,31.595],[-2.195,31.605],[-2.205,31.605],[-2.205,31.595]
            ]]},
            created_by=user.id, is_demo=True,
        )
        db.add(parcel)
        db.flush()
        parcel_id = parcel.id
        for i, quality in enumerate(("validated", "validated", "validated", "pending", "rejected")):
            db.add(Measurement(org_id=org.id, project_id=project.id, parameter="flow_rate", unit="L/s",
                value=float(i + 1), measured_at=datetime.now(timezone.utc) - timedelta(hours=5-i),
                source="CI synthetic meter", method="CI fixture", submitted_by=user.id,
                is_demo=True, quality_status=quality,
                verification_status="verified" if quality == "validated" else "unverified"))
        ensure_service_catalog(db)
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
                expect(page.locator(".fg-offerings-grid article")).to_have_count(7)
                assert page.locator(".fg-oasis-image img").evaluate("e => e.complete && e.naturalWidth > 0")
                expect(page.locator(".wefeh-links")).to_be_visible()
                expect(page.locator(".wefeh-node")).to_have_count(5)
                expect(page.locator(".fg-platform-spine")).to_be_visible()
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
                page.goto("http://127.0.0.1:8000/demo", wait_until="networkidle")
                page.get_by_role("combobox", name="Language", exact=True).select_option("en")
                expect(page.get_by_test_id("demo-demand")).to_contain_text("100")
                expect(page.locator(".fg-demo-journey article")).to_have_count(11)
                expect(page.locator(".fg-demo-proof-strip")).to_be_visible()
                page.locator(".fg-demo-scenarios button").nth(1).click()
                expect(page.get_by_test_id("demo-decision")).to_have_class("fg-demo-decision blocked")
                page.locator(".fg-demo-inputs input").first.fill("")
                expect(page.get_by_test_id("demo-demand")).to_contain_text("—")
                page.locator(".fg-demo-reset").click()
                expect(page.get_by_test_id("demo-demand")).to_contain_text("100")
                for locale in ("ar", "fr", "en"):
                    page.get_by_role("combobox", name="Language", exact=True).select_option(locale)
                    for width in (390, 768, 1440):
                        page.set_viewport_size({"width": width, "height": 1000})
                        ensure_no_overflow(page, ("demo", locale, width))
                    page.screenshot(path=str(out / f"demo-{locale}.png"), full_page=True)
                page.get_by_role("combobox", name="Language", exact=True).select_option("ar")
                page.locator(".fg-offerings-grid article a").first.click()
                expect(page.locator("#email")).to_be_visible()
                # Simulate password-manager DOM autofill without React input events.
                page.locator("#email").evaluate("e => e.value = 'BROWSER@EXAMPLE.INVALID'")
                page.locator("#password").evaluate("(e, value) => e.value = value", password)
                page.get_by_role("button", name="مسح حقول الدخول", exact=True).click()
                expect(page.locator("#email")).to_have_value("")
                expect(page.locator("#password")).to_have_value("")
                page.locator("#email").evaluate("e => e.value = 'BROWSER@EXAMPLE.INVALID'")
                page.locator("#password").evaluate("(e, value) => e.value = value", password)
                page.get_by_role("button", name="إظهار كلمة المرور", exact=True).click()
                expect(page.locator("#password")).to_have_value(password)
                page.locator('button[type="submit"]').click()
                expect(page).to_have_url(__import__("re").compile(r"/app/services\?service=\d+$"))
                expect(page.locator('[name="service_id"]')).not_to_have_value("")
                # Session persistence is intentional: the JWT is restored from sessionStorage via /auth/me.
                assert page.evaluate("sessionStorage.getItem('fg_session') !== null")
                page.reload(wait_until="networkidle")
                expect(page).to_have_url(__import__("re").compile(r"/app/services\?service=\d+$"))
                expect(page.locator("#email")).to_have_count(0)
                expect(page.locator("#main-content")).to_be_visible()
                page.goto("http://127.0.0.1:8000/agriculture-services", wait_until="networkidle")
                expect(page.get_by_test_id("agro-capability")).to_have_count(8)
                for locale in ("ar", "fr", "en"):
                    page.get_by_role("combobox", name="Language", exact=True).select_option(locale)
                    page.set_viewport_size({"width":390,"height":1000})
                    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), ("agro",locale)
                page.get_by_role("combobox", name="Language", exact=True).select_option("ar")
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
                # A transient /auth/me failure on a public page must not destroy
                # an otherwise valid persisted session.
                page.route("**/api/auth/me", lambda route: route.abort())
                page.reload(wait_until="networkidle")
                assert page.evaluate("sessionStorage.getItem('fg_session') !== null")
                page.unroute("**/api/auth/me")
                def authenticated_visit(path):
                    page.goto("http://127.0.0.1:8000" + path, wait_until="networkidle")
                    expect(page).to_have_url("http://127.0.0.1:8000" + path)
                    expect(page.locator("#email")).to_have_count(0)
                    expect(page.locator("#main-content")).to_be_visible()
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
                        ensure_no_overflow(page, ("automation",locale,width))
                page.screenshot(path=str(out / "automation-desktop.png"), full_page=True)
                page.set_viewport_size({"width":390,"height":844})
                page.screenshot(path=str(out / "automation-mobile.png"), full_page=True)
                page.set_viewport_size({"width":1440,"height":1000})
                authenticated_visit("/app/analytics")
                expect(page.locator(".an-empty")).to_be_visible()
                page.locator(".an-checkbox input").check()
                expect(page.locator(".an-chart circle")).to_have_count(3)
                expect(page.locator(".an-point.an-demo")).to_have_count(3)
                page.locator(".an-filters select").nth(3).select_option("all")
                expect(page.locator(".an-chart circle")).to_have_count(4)
                for locale in ("ar", "fr", "en"):
                    page.get_by_role("combobox", name="Language", exact=True).select_option(locale)
                    expect(page.locator("html")).to_have_attribute("dir", "rtl" if locale == "ar" else "ltr")
                    expect(page.locator(".an-chart circle")).to_have_count(4)
                    for theme in ("dark", "light"):
                        page.locator(".os-theme-toggle").click()
                        expect(page.locator("html")).to_have_attribute("data-theme", theme)
                        for width in (390, 768, 1440):
                            page.set_viewport_size({"width":width,"height":1000})
                            ensure_no_overflow(page, ("analytics",locale,theme,width))
                        page.screenshot(path=str(out / f"analytics-{locale}-{theme}.png"), full_page=True)
                page.locator(".an-records summary").click()
                expect(page.locator(".an-records tbody tr")).to_have_count(4)
                with page.expect_download() as exported:
                    page.locator(".an-actions button").nth(1).click()
                exported.value.save_as(str(out / "measurement-series.csv"))
                csv_text = (out / "measurement-series.csv").read_text(encoding="utf-8-sig")
                assert "CI synthetic meter" in csv_text and "matching_total" in csv_text
                page.emulate_media(media="print")
                expect(page.locator(".os-header")).not_to_be_visible()
                page.pdf(path=str(out / "measurement-series.pdf"), format="A4", print_background=True)
                page.emulate_media(media="screen")
                page.locator(".an-filters select").nth(0).select_option("ph")
                expect(page.locator(".an-empty")).to_be_visible()
                expect(page.locator(".an-filters select").nth(1)).to_have_value("pH")
                page.get_by_role("combobox", name="Language", exact=True).select_option("ar")
                assert page.request.get("http://127.0.0.1:8000/api/does-not-exist").status == 404
                for path in ("/app", "/app/automation", "/app/projects", "/app/org", "/app/account", "/app/nexus",
                             "/app/studio", "/app/resources", "/app/opportunities", "/app/vde",
                             "/app/agriculture", "/app/telemetry", "/app/simulator", "/app/gis",
                             "/app/decisions", "/app/services", "/app/metrology", "/app/water",
                             "/app/review", "/app/audit", "/app/explore", "/app/analytics", "/app/insights", "/app/iot",
                             f"/app/projects/{project_id}"):
                    authenticated_visit(path)
                    expect(page.locator("#main-content")).to_be_visible()
                    if path == "/app/iot":
                        # This planned module deliberately shows one field-control safety notice.
                        expect(page.get_by_role("alert")).to_have_count(1)
                        expect(page.get_by_role("alert")).to_contain_text("الأوامر الميدانية حساسة وممنوعة")
                    else:
                        assert not page.get_by_role("alert").count(), (path, page.locator("body").inner_text()[:1000], console_errors[-5:])
                    if path == "/app/agriculture":
                        expect(page.locator(".fg-section-nav")).to_be_visible()
                        expect(page.locator(".fg-section-nav button")).to_have_count(8)
                        expect(page.locator(".fg-sidebar")).to_have_count(0)
                        expect(page.locator(".fg-intelligence-band")).to_be_visible()
                        expect(page.locator(".fg-intelligence-metric")).to_have_count(9)
                        expect(page.locator(".fg-remote-sensing-state")).to_be_visible()
                        expect(page.locator(".fg-remote-sensing-grid > div")).to_have_count(4)
                    if path == "/app/water":
                        expect(page.locator(".fg-water-intelligence")).to_be_visible()
                        expect(page.locator(".fg-water-chain article")).to_have_count(7)
                    if path == "/app/insights":
                        expect(page.locator('[data-testid="ai-investor-brief"]')).to_be_visible()
                        expect(page.get_by_test_id("ai-provider-mode")).to_be_visible()
                        expect(page.locator(".ai-brief-section")).to_have_count(3)
                    if path == "/app/decisions":
                        expect(page.locator(".fg-decision-intelligence")).to_be_visible()
                        expect(page.locator(".fg-decision-lifecycle button")).to_have_count(6)
                    if path == "/app/gis":
                        expect(page.locator(".fg-gis-spatial-panel")).to_be_visible()
                        expect(page.locator(".fg-maplibre-host")).to_be_visible()
                        expect(page.locator(".fg-gis-register tbody tr")).to_have_count(2)
                        page.locator(".fg-gis-register tbody tr").first.get_by_role("button").click()
                        expect(page).to_have_url(__import__("re").compile(r"/app/gis\?.*site=\d+"))
                        expect(page.locator(".fg-gis-nearest li")).to_have_count(1)
                    if path == "/app/review":
                        expect(page.locator(".fg-evidence-assurance")).to_be_visible()
                        expect(page.locator(".fg-evidence-kpis article")).to_have_count(3)
                    if path == f"/app/projects/{project_id}":
                        expect(page.locator(".fg-project-spine")).to_be_visible()
                        expect(page.locator(".fg-project-spine-flow article")).to_have_count(7)
                        page.get_by_role("tab", name="الذكاء الزراعي").click()
                        expect(page.get_by_test_id("live-weather-panel")).to_be_visible()
                    if path == "/app":
                        expect(page.locator(".fg-command-project-board")).to_be_visible()
                        expect(page.locator(".fg-command-project-list article")).to_have_count(1)
                        expect(page.locator(".fg-command-project-list article").first).to_contain_text("واحة الاختبار")
                    if path in ("/app", "/app/nexus", "/app/agriculture"):
                        page.screenshot(path=str(out / (path.split("/")[-1] + "-workspace.png")), full_page=True)
                    if path == "/app/account":
                        for locale, title in (("fr", "Équipe et compte"), ("en", "Team and account"), ("ar", "الفريق والحساب")):
                            page.get_by_role("combobox", name="Language", exact=True).select_option(locale)
                            expect(page.locator(".fg-console h1")).to_have_text(title)
                authenticated_visit("/app/setup")
                page.locator('[name="site_name"]').fill("CI Real Farm")
                page.locator('[name="wilaya"]').select_option(index=1)
                page.locator('[name="commune"]').fill("CI Commune")
                page.locator('[name="lat"]').fill("32.1000")
                page.locator('[name="lon"]').fill("3.1000")
                page.locator('[name="project_title"]').fill("CI Real Operational Project")
                page.locator('[name="description"]').fill("Real-data browser onboarding verification")
                page.locator('[name="resource_name"]').fill("CI Real Borehole")
                page.locator('[name="parcel_name"]').fill("CI Real Parcel")
                page.locator('[name="crop"]').fill("wheat")
                page.locator('[name="area_ha"]').fill("3.25")
                with page.expect_response(lambda response: response.url.endswith("/api/workspace/setup") and response.request.method == "POST") as setup_response:
                    page.locator("form button").last.click()
                assert setup_response.value.status == 201, setup_response.value.text()
                expect(page).to_have_url(__import__("re").compile(r"/app/gis\?project=\d+&site=\d+&parcel=\d+$"))
                expect(page.get_by_test_id("gis-operational-context")).to_contain_text("CI Real Operational Project")
                expect(page.get_by_test_id("gis-selected-parcel")).to_contain_text("CI Real Parcel")
                ensure_no_overflow(page, ("workspace-setup-context", page.url))

                authenticated_visit(f"/app/water?project={project_id}&site={site_bechar_id}")
                expect(page.get_by_test_id("water-project-context")).to_be_visible()
                expect(page.get_by_test_id("water-project-context")).to_contain_text("CI-Bechar")
                ensure_no_overflow(page, ("water-project-context", site_bechar_id))

                authenticated_visit(f"/app/gis?project={project_id}&site={site_bechar_id}&parcel={parcel_id}")
                expect(page.get_by_test_id("gis-operational-context")).to_be_visible()
                expect(page.get_by_test_id("gis-operational-context")).to_contain_text("واحة الاختبار")
                expect(page.get_by_test_id("gis-selected-parcel")).to_contain_text("CI Field")
                page.get_by_test_id("gis-selected-parcel").get_by_role("link").click()
                expect(page).to_have_url(f"http://127.0.0.1:8000/app/agriculture?parcel={parcel_id}")
                expect(page.get_by_test_id("selected-parcel-card")).to_contain_text("CI Field")
                ensure_no_overflow(page, ("parcel-context", parcel_id))
                page.get_by_test_id("selected-parcel-card").get_by_role("link", name="GIS").click()
                expect(page).to_have_url(__import__("re").compile(rf"/app/gis\?parcel={parcel_id}(&|$)"))
                expect(page.get_by_test_id("gis-selected-parcel")).to_contain_text("CI Field")
                assert not errors, errors
                (out / "results.json").write_text(json.dumps({
                    "status":"passed", "browser":"Chromium", "viewports":[390,768,1440],
                    "checks":["measurement chart quality/demo filters and source rows", "AR/FR/EN analytics in both themes without mobile overflow", "audited CSV download and print PDF", "public routes","interactive resource network and original logo", "automatic queue completion and connection matrix","role workflows","public matrix calculation and hard constraints","SPA stylesheet isolation","workspace search and keyboard shortcuts","wilaya context filters real sites","AR/FR/EN landing and account","language switching preserves production form inputs","mobile overflow","contact persistence",
                              "authenticated operations","lot creation and reload","API 404","24 protected routes including project details","no page errors"]
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
