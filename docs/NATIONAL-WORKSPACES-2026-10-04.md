# National references and source-grounded workspaces

This release replaces empty paths with persistent entry and review workflows. It does not insert invented farms, prices, measurements, accounts or investment commitments into production.

| Workspace | Persisted records and behavior |
| --- | --- |
| National directory | 69 multilingual wilayas, official codes, version and source URLs; laws 26-06 / decree 26-206. Directory presence does not assert field coverage. |
| Reference centre | 14 curated legal/scientific/economic/dataset records, AR/FR/EN summaries, checked dates, formulas where applicable and original publisher links. No automatic legal scraping or unsupervised publication. |
| Registry | Create/edit sites, coordinates, water resources and assets. Server checks organisation ownership and project/resource/asset chain consistency. Parent resource/asset links cannot be silently reassigned. Lists show the first 500 entries and disclose larger totals. |
| Water and soil | Reviewed project evidence is required. Water: pH, EC, TDS, temperature, turbidity, dissolved oxygen, Na/Ca/Mg in meq/L. Soil: nutrients, SOC, moisture, pH, EC, organic matter, temperature, texture. No chemistry inferred from images or coordinates. |
| Scientific calculations | Existing supplied-band NDVI/LSWI and FAO-56 irrigation calculations; SAR from Na/sqrt((Ca+Mg)/2). Missing inputs/zero denominator produce no SAR. Observations retain their source; SAR is explicitly COMPUTED. No suitability or drinking-water certification. |
| Economics | Immutable scenario snapshots in nominal DZD. Explicit CAPEX, annual revenues/costs, year-end discounting, symmetric stress/upside, NPV and undiscounted fractional payback. No assumed prices, taxes, debt, inflation or terminal value. |
| Intelligence | Nine domain specialists; up to three private model names; actual installed-model connectivity checks; durable queue and per-model drafts with allowed source IDs. Failures disclose error classes only. Outputs remain PROPOSED and require human review. |
| Legal pages | Localised operator, privacy, terms, rights/source and contact pages. Describe actual hosting, token storage, rights intake and retention limitations. No unverified ANPDP approval or legal accreditation. |

The reference seed runs even when SEED_DEMO=false and remains idempotent. New PostgreSQL tables enable RLS and revoke Data API access from PUBLIC/anon/authenticated/service_role. Authorised backend routes are the access path; backend tenancy checks remain essential. The migration head is ref20261004a1, with upgrade/downgrade path verification in CI. Reference JSON files must accompany both frontend builds and backend runtimes; all Dockerfiles include them.

## Private inference configuration

No model server or paid inference account is provisioned by this release. Until configured, the interface reports “unconfigured” and persists source packets without pretending an inference occurred. Operators must supply an authenticated/network-isolated compatible Ollama server reachable from the backend. Do not expose an unauthenticated model endpoint to the public internet.

Set these server-side environment variables only after approving the data placement and network boundary:

- FOGGARA_LLM_PRIVATE_DEPLOYMENT=true
- FOGGARA_OLLAMA_URL=<private operator-controlled HTTP(S) endpoint>
- FOGGARA_LLM_MODELS=<installed-model-a>,<installed-model-b>,<installed-model-c>

Check /api/ai/models through an authorised account; “ready” requires all configured names to exist at /api/tags. /api/chat uses a strict JSON schema, deterministic settings and a restricted source packet. This is source-ID validation, not semantic proof of model statements. Each draft must be reviewed; agreement among models is never recorded as verified scientific consensus. No tools, browser agents, equipment commands or transactions are attached to these models.

The embedded AI consumer runs only with a configured private endpoint. A dedicated consumer is available with `cd app/backend && python -m app.services.llm_ensemble`; it requires the same database and private model configuration. Queue admission is capped at ten pending runs per organisation. PostgreSQL row locks prevent simultaneous consumers from processing the same queued run. Transactions preserve recoverability when the process terminates. The current free Render web service can sleep, pausing consumers; continuous service needs an operator-provisioned worker/hosting plan. Ollama capacity, model licensing and resource requirements must be assessed on that private deployment; this release makes no untested model-performance claim.

## Verification

Local checks: 181 backend tests passed, one Rust-binary-dependent check skipped locally; frontend build, lint and five deterministic matrix tests passed. New tests cover national reference idempotency, tenant isolation, immutable parent relationships, exact cash-flow examples, SAR/missing inputs, evidence withdrawal, source-packet persistence, citation rejection and durable partial model failure. Chromium verifies creation/edit/reopening of registry entries, saved economic scenarios and intelligence packets, plus AR/FR/EN layouts at 390/768/1440 pixels. CI additionally uses real PostgreSQL, SQL-role isolation, Rust and the production Docker stack. Release/CI/deploy status must be read from the PR and Render; this document alone is not proof of deployment.

Live satellite/weather feeds, private inference hosting, actual laboratory samples, reviewed operational data, human experts, continuous availability, legal formalities and sovereign hosting remain operator/data dependencies. Existing planned modules retain their truthful status. National coverage, accreditation or full production readiness must not be inferred merely from a populated reference directory.
