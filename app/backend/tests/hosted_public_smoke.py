"""Read-only browser verification of the public Render release; no account or records created."""
import time
from playwright.sync_api import sync_playwright, expect

BASE = "https://foggara-dz.onrender.com"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
        # Auto-deployment can still serve the previous healthy build during compilation.
        for attempt in range(36):
            page.goto(BASE + "/", wait_until="networkidle", timeout=60000)
            try:
                expect(page.locator(".fg-source-banner img")).to_have_count(1, timeout=5000)
                expect(page.locator(".fg-global-operating-grid a")).to_have_count(5, timeout=5000)
                expect(page.locator(".ocp-source-controls nav button")).to_have_count(8, timeout=5000)
                break
            except AssertionError:
                if attempt == 35:
                    raise
                time.sleep(5)
        assert page.locator(".os-brand-symbol").evaluate("e => e.complete && e.naturalWidth > 0")
        page.locator(".fg-source-banner").scroll_into_view_if_needed()
        assert page.locator(".fg-source-banner img").evaluate("e => e.complete && e.naturalWidth > 0")
        page.locator(".fg-moon-qr").scroll_into_view_if_needed()
        expect(page.locator(".fg-moon-qr")).to_be_visible()
        expect(page.locator(".fg-moon-qr > a")).to_have_attribute("href", BASE + "/expo")
        assert page.locator(".fg-moon-qr img").evaluate("e => e.complete && e.naturalWidth > 0")
        expect(page.locator('.fg-moon-qr a[download]')).to_have_attribute("href", "/expo-qr.svg")
        qr_response = page.context.request.get(BASE + "/expo-qr.svg")
        assert qr_response.ok
        assert "https://foggara-dz.onrender.com/expo" in qr_response.text()
        page.keyboard.press("Control+K")
        assert page.locator(".fg-tool-command input").evaluate("e => document.activeElement === e")
        page.locator(".fg-tool-command input").fill("Sentinel")
        expect(page.locator(".fg-tool-card")).to_have_count(1)
        page.keyboard.press("Escape")
        expect(page.locator(".fg-tool-card")).to_have_count(6)
        page.locator(".fg-lukas-domain-strip button").first.click()
        expect(page.locator(".fg-lukas-domain-strip button").first).to_have_attribute("aria-pressed", "true")
        page.locator(".fg-lukas-domain-strip button").first.click()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        for locale in ("ar", "fr", "en"):
            page.get_by_role("combobox", name="Language", exact=True).select_option(locale)
            expect(page.locator("html")).to_have_attribute("dir", "rtl" if locale == "ar" else "ltr")
            expect(page.locator("#foggara-title")).to_be_visible()
            for index, path in enumerate(("/app/gis", "/app/agriculture", "/agriculture-services", "/app/projects", "/app/nexus")):
                expect(page.locator(".fg-global-operating-grid a").nth(index)).to_have_attribute("href", path)
            page.locator(".ocp-source").scroll_into_view_if_needed()
            for index in range(8):
                page.locator(".ocp-source-controls nav button").nth(index).click()
                expect(page.locator(".ocp-source-image")).to_have_attribute("src", f"/images/source-deck/slide-{index+1}.webp")
                page.wait_for_function("document.querySelector('.ocp-source-image').complete && document.querySelector('.ocp-source-image').naturalWidth > 0")
                expect(page.locator(".ocp-source-controls nav button").nth(index)).to_have_attribute("aria-current", "step")
            for width in (390, 768, 1440):
                page.set_viewport_size({"width": width, "height": 1000})
                assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), (locale, width)
        page.goto(BASE + "/presentation", wait_until="networkidle")
        page.locator("#matrix").scroll_into_view_if_needed()
        expect(page.locator("#matrix")).to_be_in_viewport()
        for index in range(5):
            axis = page.locator(".fp-axis").nth(index)
            if index:
                axis.locator("summary").click()
            axis.locator('input[type="range"]').fill("20")
            for field, value in enumerate(("50", "0", "100")):
                axis.locator('input[type="number"]').nth(field).fill(value)
        expect(page.locator(".fp-score-orbit.ready strong")).to_have_text("50.0")
        page.locator(".fp-axis").first.locator('input[type="number"]').first.fill("150")
        page.locator(".fp-axis").first.locator('input[type="checkbox"]').check()
        expect(page.locator(".fp-score-orbit.blocked strong")).to_have_text("—")
        page.locator(".os-brand").click()
        expect(page.locator("#foggara-title")).to_be_visible()
        expect(page.locator(".fg-rebuilt-hero")).to_be_visible()
        page.goto(BASE + "/expo", wait_until="networkidle")
        expect(page.locator(".fg-expo-share-qr")).to_be_visible()
        assert page.locator(".fg-expo-qr-image img").evaluate("e => e.complete && e.naturalWidth > 0")
        expect(page.locator(".fg-expo-qr-actions")).to_be_visible()
        expect(page.locator('.fg-expo-qr-actions a[download]')).to_have_attribute("href", "/expo-qr.svg")
        page.goto(BASE + "/demo", wait_until="networkidle")
        page.get_by_role("combobox", name="Language", exact=True).select_option("en")
        expect(page.get_by_test_id("demo-demand")).to_contain_text("100")
        page.locator(".fg-demo-scenarios button").nth(1).click()
        expect(page.get_by_test_id("demo-decision")).to_have_class("fg-demo-decision blocked")
        expect(page.locator(".fg-offerings-grid article")).to_have_count(7)
        for width in (390, 768, 1440):
            page.set_viewport_size({"width": width, "height": 1000})
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), ("demo", width)
        page.goto(BASE + "/agriculture-services", wait_until="networkidle")
        expect(page.get_by_test_id("agro-capability")).to_have_count(8)
        for locale in ("ar", "fr", "en"):
            page.get_by_role("combobox", name="Language", exact=True).select_option(locale)
            page.set_viewport_size({"width":390,"height":1000})
            assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), ("agro",locale)
        page.get_by_role("combobox", name="Language", exact=True).select_option("ar")
        assert not errors, errors
        print("Hosted release passed: AR/FR/EN, responsive layout, eight source slides, operating links, matrix, hard constraints and SPA stylesheet isolation.")
        browser.close()

if __name__ == "__main__":
    main()
