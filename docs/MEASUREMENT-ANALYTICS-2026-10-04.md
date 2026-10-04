# Measurement analytics and themes — 2026-10-04

This change adds measurement trends to the existing FOGGARA analytics page. It does not replace the React/FastAPI product or assert complete production readiness.

## User behavior

- AR/FR/EN interface with persisted light/dark preference, existing local Tajawal/Hanken fonts and Lucide icons.
- Project, parameter, unit, date-window and review filters. Rejected rows are excluded. Demonstration readings require an explicit opt-in and stay labelled DEMO.
- Exact observed time/value positions with source table; no interpolation, suitability threshold, forecasts or field commands. Averages are arithmetic summaries, not time-weighted quantities.
- CSV export for spreadsheet use, with audit record and text formula escaping. Printing supports the browser's Save as PDF; this is not a server PDF endpoint.
- At most 500 latest rows are drawn/exported by this interface, with explicit truncation notice. Summary statistics cover all matching rows. API allows 1–1000 rows and windows up to 366 days. Units are separated; equivalent spelling aliases are matched without numerical conversion.
- Reference selectors that requested page_size=500 now follow actual server pagination in Projects, ProjectDetail, Water, Services, DecisionStudio, NexusResources, Analytics, Metrology, Home, NexusWorkspace, Operations and Vde. Failure is surfaced rather than returning a partial collection. Walks stop with an error beyond 200 pages.

## Database and access

JSON and CSV routes require a valid user and the owned project. Measurement queries include org_id explicitly. Filters are validated and parameterized. API cache/security middleware remains active. The only schema change is reversible composite index ix_measurements_series. Migration head: an20261004m1, parent int20261003s1. Existing records and migration identities are retained.

## Dependency/security work

Tailwind CSS 4.3.3 removes the vulnerable v3 glob chain; both npm audits now run without exceptions. Existing visual configuration is retained, with semantic colors and preserved radius/shadow/blur values. See DEPENDENCY-SECURITY.md for the modern browser baseline and dated audit result. Authentication remains the existing tenant-scoped JWT implementation; Auth0 has not been activated without a configured tenant/application.

## Verification

Local: 193 backend tests passed, 1 real Rust integration test skipped because no Rust binary was available; 9 frontend tests passed; build, typecheck and lint passed; both npm audits reported zero vulnerabilities. SQLite fresh migration, index downgrade and re-upgrade succeeded. A follow-up boundary check rejects datetime underflow with HTTP 422; all 20 analytics tests passed after this fix. Browser access to the local preview was blocked by the session browser, so no local visual approval is claimed.

GitHub CI is configured to verify PostgreSQL migration paths/RLS, all backend tests with the real Rust engine, Rust tests/clippy, dependency and source scanning, an isolated production container, and Chromium workflows. The browser fixture additionally covers analytics in three languages/two themes at 390/768/1440px, demo/quality filters, source rows, actual CSV download and an A4 PDF artifact. CI results must be checked before merge; screenshots are review evidence, not proof of accessibility or global security.

## Selected design tools

Themely supplied the Oasis Evidence semantic palette. Lumen React 1.6.0 was evaluated and removed: its component/icon core increased the main JS bundle from about 497 kB to 1091 kB. Existing components keep the final bundle around 503 kB (Vite warning remains). FLOWSTACK was inspected; no configured package/runtime was found, so it was not inserted. Canva had no brand kit. The separate older Lovable/Supabase project was inspected and left unchanged to prevent incompatible source replacement. Malwarebytes returned an unknown reputation verdict for the existing legal PDF URL; this is not a source-code security scan. No trivia mechanic was added to operational decisions.

Production deployment, backup restoration, load/SLA targets and operational acceptance remain separate release gates. This change does not certify the entire platform or create real field evidence.
