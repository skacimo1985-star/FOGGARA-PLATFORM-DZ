# FOGGARA-DZ — Webflow to application migration blueprint

Status: DESIGN PROPOSAL / no production code changes.
Branch: design/foggara-webflow-integration

## Product identity
FOGGARA-DZ is the Algerian integrated WEFEH resource, evidence, decision and investment platform. SIREP is its connected field monitoring and control layer, NOT the same product. A public marketing site is not a replacement for operational workspaces.

## Information architecture
1. Public landing: hero with real Algerian oasis imagery, statement of value, transparent project maturity, audience pathways.
2. WEFEH nexus: water, energy, food, ecosystems, health, and cross-domain decision chain.
3. Farmer: parcel entry, source and provenance, soil/water diagnostics, irrigation and energy advice only when verified.
4. Operator: SIREP integrations, telemetry, measurements, alarms, human-approved actions.
5. GIS: select polygon/parcel, measurements, coordinate reference system, source dates and caveats.
6. Evidence and decisions: OBSERVED / VERIFIED / COMPUTED / INFERRED / PROPOSED provenance.
7. Projects and investment: readiness, needs, risk register, partners, non-confidential opportunity briefs.
8. Permissioned VDR: verified parties, consent, reviewer/witness role, audit log, controlled disclosure; do not promise judicial notarization without legal basis.
9. Contact/partnership intake: role, location, need, consent, spam prevention, secure server-side submission.
10. Legal: privacy, terms, cookies and security, localized and reviewed.

## Integration architecture
Source of truth remains the React/Vite frontend in app/ and the FastAPI backend. Rebuild Webflow-approved visual patterns as React components; do not blindly embed exported scripts or overwrite app/src/App.tsx. Preserve existing routes, guards, AuthProvider, i18n, GIS and agriculture features. Public pages should link to functional application routes, not simulated interactions.

## Content and locales
AR native RTL, FR and EN full copy parity. Localized routes or shared React i18next resources, matching navigation and form validation. Do not claim availability of unverified GIS, satellite, telemetry or VDR capabilities. Distinguish DEMO, IN DEVELOPMENT, VERIFIED.

## Migration acceptance criteria
- Desktop/mobile responsive snapshots at 360/768/1280/1440.
- RTL, LTR and keyboard accessibility checks.
- Core route smoke tests and existing frontend suite green.
- Backend/DB untouched during landing-only migration; no secrets committed.
- Contact submission validation, opt-in and privacy path proven before enabling collection.
- All public CTA destinations tested.
- No broken assets, duplicated HTML ids or missing translations.
- Compare before/after Lighthouse and production build.
- Review via PR; never merge or deploy before validation.

## Priorities
P0: information architecture, design tokens and multilingual landing shell.
P1: verified service and audience entry paths, real contact backend.
P2: GIS contextual entry, public project showcase, investment brief.
P3: VDR and advanced interactions only after access-control and auditing verification.

## Benchmark patterns
CropX: field-to-decision messaging, integrated sensing and satellite data.
WRI Aqueduct: location-first water risk investigation with provenance and exports.
Avoid copying proprietary artwork, brand layout, claims or source code.
