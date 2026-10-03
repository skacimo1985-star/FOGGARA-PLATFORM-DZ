# FOGGARA-DZ — working plan and verification record

Updated: 2026-09-30  
Repository: `skacimo1985-star/FOGGARA-PLATFORM-DZ`  
Inspected upstream branch: `main`  
Inspected upstream HEAD: `01a22227a9918a76b51fbdb16bb1abcf47b82d9e` (`Update deployment environment example`)

This file distinguishes code present in the repository from work that has actually been run. The upstream repository history visible at inspection contained four commits; phase reports in conversation are not treated as substitutes for tests against this checkout.

## Current milestone: Web workspace and platform shell

| Acceptance check | Status | Evidence |
|---|---|---|
| Inspect actual repository tree and recent commit history before editing | PASS | Read GitHub `main`, tree, and commit list at the HEAD above |
| Backend migrations reach Alembic head on SQLite | PASS | All five migrations applied successfully |
| Backend regression suite | PASS | 62 tests passed on SQLite |
| Frontend production build and TypeScript check | PASS | `npm run build` passed |
| Frontend lint | PASS | `npm run lint` passed after fixes |
| Arabic, French, and English translation keys stay aligned | PASS | Compared 647 leaf keys; zero missing or extra keys |
| Arabic direction and language switch | PASS by code inspection | Existing i18n setup assigns `dir="rtl"` for Arabic and `ltr` for French/English |
| Mobile navigation works without a 15-link horizontal strip | PASS by build/code inspection | Replaced it with an accessible, expandable grid menu |
| Protected routes resume after login | PASS by build/code inspection | Login now returns to the requested internal route and query |
| Evidence provenance is visible independently of DEMO/review badges | PASS by UI mapping | Observed, verified, computed, inferred, proposed, and simulation classes are localized |
| Simulation stays visibly distinct from observations | PASS by UI mapping | Simulator and simulated telemetry show a separate Simulation badge |
| Demo passwords are absent from production frontend bundles | PASS | Clean production build contains no seeded demo emails or password |
| GitHub Actions detects and runs the workflow from repository root | PASS (layout/configuration) | Workflow is at `.github/workflows/ci.yml` with app-aware paths; actual hosted Actions run remains pending |

## Changes in this worktree

- Added an animated WebGL water-flow scene with a stylized kasria and five WEFEH paths. It is labeled as an illustration and contains no asserted field measurements. The scene has a reduced-motion mode and a static fallback when WebGL is unavailable.
- Replaced the narrow-screen overflow navigation with an accessible expandable menu.
- Added localized provenance badges. The labels describe record origin or analytical state and remain separate from DEMO labels and review status.
- Preserved the intended protected route when a user logs in.
- Split route pages into lazy-loaded chunks. The production build no longer emits one 500+ kB application chunk.
- Removed the unused `kimi-plugin-inspect-react` build plugin and its dependency tree (100 packages) after confirming it was not needed by application code.
- Moved CI to the repository root, corrected working directories, and added lint to CI.
- Fixed test configuration so CI honors its PostgreSQL `DATABASE_URL`; `TEST_DATABASE_URL` remains available for local SQLite runs.
- Corrected root and app documentation and made `run-local.ps1 -Mode dev` use SQLite without requiring Docker.
- Hid seeded demo credentials from production builds.

## Verified commands and results

Run from `app/`:

```sh
npm ci
npm run build
npm run lint
```

Run from `app/backend/`:

```sh
DATABASE_URL=sqlite:///./test_foggara.db python -m pytest tests -q
DATABASE_URL=sqlite:///./migration_check.db python -m alembic upgrade head
```

Recorded results: clean `npm ci`, frontend build, and lint passed; all 62 backend tests passed; Alembic reached `c3d4e5f6a7b8`; seeded demo login, authenticated telemetry request, API health check, and Vite entry-page smoke checks passed. The test client emitted one upstream Starlette/httpx deprecation warning. A browser screenshot review and execution of the PowerShell launcher on Windows have not been performed in this environment.

## Remaining milestones

1. Run the root GitHub Actions workflow on a feature branch and address any PostgreSQL-specific failures.
2. Perform browser visual and mobile review of the animated kasria scene, including WebGL fallback and reduced-motion behavior; refine against the frozen reference-image specification.
3. Add first-class, auditable provenance fields and evidence relationships at the API/database layer. Current provenance classes are a presentation mapping over existing records, not a new evidence-graph schema.
4. Add localization metadata for user-entered records; the current language switch translates UI labels, while user content remains as originally entered.
5. Implement and test public Expo registration, consent capture, exhibitor/visitor profiles, QR flows, and Data Room access controls.
6. Implement GIS/PostGIS, device integrations, and other planned WEFEH domains beyond the current water-led workflows.
7. Review browser token storage and production identity/session controls before any public deployment.
8. Rehearse deployment, backup restoration, audit review, and migration to an Algerian sovereign environment before handling sensitive data.

No public deployment or merge to `main` is recorded by this plan.
