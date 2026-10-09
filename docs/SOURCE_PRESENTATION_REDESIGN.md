# FOGGARA source presentation and workflow review

The source is the user-supplied eight-slide Oases Nexus WEFEH FOGGARA PowerPoint. The Canva connector denied access to the linked design; the supplied PowerPoint is therefore the reviewed source. Slide 2 contained an opaque orange freeform over the satellite collage. Only that fill was removed in the corrected deliverable; the original slide order and all other ZIP entries were preserved.

## Public interface

The shared presentation component now shows the actual eight source slides rather than the previous twelve-slide reconstruction. It provides manual previous/next controls, numbered navigation, localized Arabic/French/English captions, and links into the existing sections. The original slides remain in French. The supplied logo and banner are used directly, with no redesign of the institution's mark. Satellite, field and partnership images come from the source deck. Institutional artwork and demonstration examples are not measurement evidence.

The landing retains existing routes, service search, Expo QR and guest entry. It uses a restrained forest, sand and gold palette, smaller display typography and visible keyboard focus. Protected sections retain authentication.

## Workflow and relationships

| Source presentation stage | Existing destination | Relationship |
| --- | --- | --- |
| Define terrain | GIS | AOI and parcel boundaries |
| Satellite observation | Agriculture | Acquisition and derived indices |
| Water, soil and crops | Agriculture services | Service intake and measurements |
| Evidence before decision | Projects | Project-linked evidence |
| Analysis and arbitration | Nexus | Cross-domain analysis |
| Sovereign AI and services | Agriculture | Existing local advisory capability |
| National ecosystem | Organization | Organizational context |
| Stand B02 | Expo | Demonstration and visitor pathway |

Review found that project foreign keys were individually tenant-checked but could point to unrelated sites, resources and assets within the same organization. Create and patch now validate Site → WaterResource → Asset ancestry, including asset-only links. A service request specifying both project and site must match the project's explicit or resource-derived site. Inconsistent links return 422 without persistence; foreign-organization links remain 404.

This change introduces no tables or migrations and does not rewrite existing records. It validates new and edited links at the API boundary. Direct database writes remain outside this validation; historical inconsistency requires a separate read-only inventory before any repair. AI outputs and illustrative slide claims do not become verified records.

## Open-source reuse

The existing implementation already contains self-hostable MapLibre GL JS, Rasterio and gmqtt integrations. This redesign reuses those working capabilities rather than creating parallel apps. Their code, licenses and notices remain separate from the FOGGARA institutional identity. No new dependency or cloned third-party application was added.

## Validation and release

Local frontend tests: 77 passed. TypeScript and production build passed. ESLint passed. Focused backend validation: 27 acceptance, ancestry and remote-sensing processing tests passed; 5 solar tests passed. Project ancestry tests cover rejected create combinations, retained links on patch, atomic coherent patch, cross-organization concealment and service-site mismatch.

The broad SQLite run returned 430 passed, 1 skipped and 2 failures. A stale remote-sensing assertion expected formula v1 while the existing implementation and catalogue use v2; the assertion was corrected without changing processing behavior. The other failure was a missing development-only Pysolar dependency, which was installed locally. Both affected modules passed on targeted recheck. An additional broad rerun did not produce a complete reliable pytest report in this environment; a fully green broad suite is not established.

Browser smoke selectors were updated to the actual current landing, and the test now captures source slide 2 in Arabic, French and English. These browser checks were not executed locally because the managed browser URL policy blocked the preview.

GitHub PR #196: https://github.com/skacimo1985-star/FOGGARA-PLATFORM-DZ/pull/196. Its Verify FOGGARA run 37905456457 completed as failure; all five jobs reported failure with no steps and no available logs. The reason was not established. No merge or deployment was performed. PostgreSQL, container and visual release verification remain outstanding.

The original live landing was inspected before editing. The local browser preview was blocked by browser URL policy, so local visual verification is incomplete. CI must pass before merge, including PostgreSQL/migration/container checks and browser smoke. Live release verification must separately confirm the supplied logo, eight-slide source viewer, visible satellite collage on slide 2, mobile layouts and protected-route behavior.

Rollback: revert the PR. No database migration or data rollback is required.
