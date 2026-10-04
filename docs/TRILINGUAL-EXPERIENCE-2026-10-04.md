# FOGGARA production experience — 2026-10-04

Base: verified main `6c08f02b92e6b51fdf6e02da2d2fc0e122c2c6b2`.

## Change

The public landing, production operations and team/account pages previously forced Arabic even when the global switch selected French or English. These pages now follow the shared locale, direction and localized dates. Production identifiers, units, API enum values and original user-entered evidence are preserved. Source content is not machine-translated or silently rewritten.

The landing reuses the existing interactive Kasria rather than depending on an external photograph. It provides entry points to existing project, independent review and permissioned Data Room workflows. It is responsive, supports reduced motion, and retains explicit limits on simulated data and field connectivity. No credentials, analytics or third-party design scripts are added.

Canvas buffers now repaint once when resized even if the scene is outside the viewport or reduced motion is enabled. Animation remains restricted to visible, active scenes. Unsupported stored locale values fall back to Arabic.

## Verification

- Latest main has five successful GitHub job results: backend, frontend, security, Rust, production container.
- Local baseline and final frontend build, lint, typecheck and five decision-matrix tests passed.
- Eight existing production operations API tests passed with a disposable SQLite database.
- Chromium checks passed on AR/FR/EN and widths 390, 768 and 1440: landing and account translation, resource selection, no horizontal overflow, unchanged in-progress lot fields across language changes, saved lot creation and subsequent login/reload, contact persistence, public pages and 23 protected routes, no page errors.
- SQLite migrations reached `int20261003s1`; this does not substitute for the PostgreSQL migration, concurrency and container checks run in CI.

Browser screenshots and results are produced by the existing CI artifact `foggara-browser-verification`. The test now also checks that the Kasria is painted after resize, including reduced-motion/offscreen rendering.

## Boundaries

This change adds no backend or database schema, and does not duplicate national GIS PR #23. The public legal/contact content still requires a separate reviewed multilingual pass. Runtime API errors retain their existing centralized translation behavior; original free-text records remain in their source language. This change does not certify legal compliance or professional accreditation, and does not complete field hardware integration, sovereign hosting, payments, signed contracts, native mobile or disaster-recovery acceptance.

The named UI/UX Pro Max skill was absent from the available catalog and local skill search. The specified Dribbble page could not be retrieved; no claim is made to have inspected or copied it. The design uses the existing in-repository React, CSS, Lucide and Canvas implementation.

Review and CI are required before merging. No live production deployment is implied by a branch, pull request, screenshot or successful build.
