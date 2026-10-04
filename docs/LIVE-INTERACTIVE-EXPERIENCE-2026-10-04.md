# Live interactive experience — 2026-10-04

Public preview: https://foggara-dz.onrender.com/

## Design choices

The existing React application and backend remain the source of truth. The interface adopts the responsive sidebar, keyboard search and RTL-friendly navigation patterns reviewed in the MIT-licensed shadcn-admin project (https://github.com/satnaing/shadcn-admin), with an original FOGGARA palette and WEFEH workflows. Agriculture dashboard references on https://dribbble.com/tags/agriculture-dashboard informed visual research; no proprietary template or image was copied. No additional UI dependency is introduced. UI/UX Pro Max was unavailable in the installed skill catalog.

## Working interactions

- Public role selection reveals producer, engineering and institutional routes linked to existing modules; it does not grant an account role or change permissions.
- The public decision matrix accepts weights, values, bounds and objectives, computes locally, enforces hard constraints and exposes reset/export controls. It remains an explicitly unsaved scenario, separate from verified operational data.
- Authenticated Ctrl/Cmd-K search navigates module destinations and organization-scoped project results. It searches the first 100 projects, with at most 20 matching results; the interface states this limit and reports request failures.
- The workspace wilaya selector opens the GIS directory with a URL-backed filter. The filter matches directory codes and localized names and shares state with the GIS selector. Coverage follows the existing directory, not a newly certified national boundary dataset.
- Presentation styles use an isolated `fp-` namespace so visiting the lazy-loaded presentation cannot alter landing or operational page layouts.

## Validation

`npm run build`, `npm run lint` and real Chromium integration checks cover AR/FR/EN, three viewport sizes, role navigation, public matrix calculation, hard constraints, SPA style isolation, keyboard search, actual site filtering, contact persistence, production lot creation and reload, and 23 authenticated routes. The CI suite additionally verifies PostgreSQL migrations, backend isolation, security, Rust and the production container. The hosted workflow now targets the main-branch Render service and tests actual public interactions without creating production accounts or business records.

## Scope boundaries

This release improves the functioning interface; it does not certify legal compliance or claim that every planned module is production-complete. Physical IoT control, external providers, countrywide GIS boundaries and regulatory approvals require their separate integrations and validation. Protected workspaces require an authenticated account.
