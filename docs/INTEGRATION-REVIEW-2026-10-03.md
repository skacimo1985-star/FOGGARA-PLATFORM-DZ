# Reviewed integration — FOGGARA-DZ — 2026-10-03

Work occurred through the connected GitHub repository and disposable GitHub Actions infrastructure. No checkout or build used the user's computer. Main was preserved at `3e5319eea22e05adc00a056e368cdf89145239e2`. Integration branch: `codex/reviewed-integration-2026-10-03`. PR: https://github.com/skacimo1985-star/FOGGARA-PLATFORM-DZ/pull/7

## Source review

| Source | Inspected HEAD | Difference from main | Decision |
| --- | --- | --- | --- |
| main | 3e5319eea22e05adc00a056e368cdf89145239e2 | baseline | Preserve pagination, deployment identity and stable modules |
| codex/agriculture-workspace-2026-10-01 | 0c7076b438d54c564dba9e60f5cef2ce36170d80 | +2 / -2, diverged | Bring agricultural UI; use RC1 equivalent API and uniquely named migration |
| codex/foggara-operational-platform | d7b36db13429d98af15cd5bfb52db4b94245dd0f | +9 / -0 | Bring versioned WEFEH evaluations, durable jobs, lots, matching, account/contact controls |
| codex/phase-04-web-workspace | 75adc53e01112f3808b242ce8641ca8b2406357a | +2 / -2, diverged | Its subsequent work is included in RC1; avoid duplicate/stale replacement |
| codex/platform-operational-completion | 8438e686537f0c751457266e2375b9994b5639e5 | +8 / -2, diverged | Review via RC1 descendant; preserve main-only behavior |
| release/expo-2026-rc1 | 1e7be5e323630dc4a708ff9af1968790882e8d68 | +25 / -2, diverged | Bring latest collaboration, assurance, intelligence, presentation and scoped authentication |

Commit order alone was not used as evidence of correctness. RC1 contains the phase-04 and completion histories; the operational branch contributes a separate capability set. Files were selected and shared contracts reconciled rather than merging whole divergent branches. The old agriculture revision `d4e5f6a7b8c9` collides with main's index revision; it was rejected.

## Component review

| COMPONENT | BEFORE | LATEST | ACTION | RESULT |
| --- | --- | --- | --- | --- |
| Backend API | Main tenant-scoped FastAPI API and pagination | RC1 intelligence/collaboration plus operational API | Combine routers; preserve bounded main responses | One API for existing and new workspaces |
| Frontend | Main dashboard and core modules | RC1 professional shell, Nexus workspace and studio; operational screens | Keep dashboard at /app, add /app/nexus and new routes; restore paginated selectors | Existing modules preserved in upgraded navigation |
| Database/migrations | Main historical index chain | RC1 agriculture chain and operational extension | Preserve revision identities; add int20261003m1 merge and int20261003s1 security revision | Single head; no historical migration rewrite |
| Authentication | Main login and request throttling | Scoped JWT issuer/audience/credential lifecycle; legacy verifier upgrade | Combine current-role verification, password invalidation and persistent throttles | Tokens use current credentials and DB role |
| RBAC/org isolation | Organization-scoped core records | Additional org-owned operations and explicit room permissions | Keep server-side checks; test denied cross-org access and foreign references | Browser visibility is supplementary to API checks |
| Audit/evidence | Source evidence, review and histories | Evidence graph, assurance chains, decision matrices and room audits | Preserve provenance distinctions and audit links | Observed, computed, inferred, proposed and simulation data remain distinguishable |
| Projects | Main paginated lists and existing project workflow | RC1 evidence, assurance, agriculture and matrices | Preserve main list contract; extend detail tabs | New project tools reuse existing workflow |
| Organizations | Main organization context | Invitations, onboarding, team controls and password change | Integrate new routes with a shared auth provider | Organization membership remains scoped |
| Decisions | Human lifecycle and separation of duties | Evidence-linked matrix proposals | Preserve pagination/reference validation and controlled transitions | Proposals require human review/authorization |
| Telemetry | Main sensors, readings, rules and charts | Additional source-backed intelligence | Preserve chart UI and API | No live sensor connection claimed |
| Simulation | Stored simulation runs and existing engine | RC1 decision comparison/Rust parity | Include actual Rust binary in checks and container | Simulations remain explicitly labelled |
| GIS | Main sites/wilayas/resources linkage | RC1 workspace links | Retain GIS behavior and bounds | No external satellite service claimed |
| i18n | Arabic/French/English core dictionaries | New RC1 and agricultural strings | Merge dictionaries; add new navigation labels | Core and agriculture multilingual; operational screens still primarily Arabic |
| Data Room | Main VDE page | RC1 permissions, access requests, evidence links and audit | Keep VDE route and add room detail workflows | Scoped collaboration; external sharing must be deliberately granted |
| WEFEH | Main five-domain modules | Versioned policies, reviewed observations, immutable snapshots | Add freshness, exact units and coverage checks | Missing inputs produce missing-domain results, not fabricated scores |
| Production | Existing project/actions workflow | Production lots, quality reviews, durable job outputs | Add independent release checks and worker | Matching suggestions are not reservations or payments |
| Agentic for humans | Human decisions and reproducible calculations | Matrices, evidence graph, explanations, job execution and optional read-only browser tool | Make proposals inspectable; retain explicit human transitions | Deterministic assistance implemented; external LLM/autonomous equipment control not configured |
| Docker | Main/RC1 container files | Operational web/worker/database stack | Build locked dependencies and Rust; run nonroot and disable implicit proxy rewriting | Disposable production stack tested on GitHub |
| Render | Main Python Blueprint/service identity | Release Docker alternative | Preserve existing runtime identity; harden locked install/env/proxy settings | Repository config reviewed; live service not deployed/verified |
| CI/dependencies | Existing basic verification | Combined database/browser/Rust/container verification | Pin official actions by SHA, least privilege, Dependabot | Full checks required; limited build-only advisory exception documented |
| Supabase/RLS/grants | Application SQL tables could receive inherited API grants | Deny direct Supabase API access to custom-auth tables | Enable RLS; revoke public/anon/authenticated/service_role table/sequence/default grants where roles exist | Disposable PostgreSQL grants tested; live main schema checked read-only; new integration schema still awaits deployment |
| Secrets/env/network | Main env examples and rate limits | Strong production checks and persistent auth limits | No production demo seed; no-store API; explicit CORS; trusted proxy peers opt-in | No production token copied; historical synthetic fixture exceptions are fingerprint-specific |
| Main protection | Unprotected | Desired PR/check/no-force/no-delete rules | Read attempted; administration denied with HTTP 403 | Not applied; requested config and limitation in docs/MAIN-PROTECTION.md |

## Verification evidence

Initial combined run [37120116846](https://github.com/skacimo1985-star/FOGGARA-PLATFORM-DZ/actions/runs/37120116846) passed 172 backend tests, Rust tests/clippy, backend dependency audit, Bandit and migration/security checks. It correctly failed on missing frontend integration exports and a synthetic test signing value. Those issues were repaired.

Run [37121009455](https://github.com/skacimo1985-star/FOGGARA-PLATFORM-DZ/actions/runs/37121009455) additionally verified the production container/worker, frontend build/typecheck, presentation matrix and secret scanning. Browser testing exposed the old Projects list response assumption; affected screens and reference selectors were repaired. Full dependency auditing exposed the build-only braces advisory; see docs/DEPENDENCY-SECURITY.md.

Final outcomes and the exact final HEAD are recorded in the [PR and its checks](https://github.com/skacimo1985-star/FOGGARA-PLATFORM-DZ/pull/7/checks). Pending/failing checks are not evidence of release readiness.

The database smoke test upgrades disposable databases from the shared base, main, operational and RC1 migration states, checks a single final head, reapplies the security revision after downgrade, and verifies that every public application table has RLS and public Supabase roles lack SELECT privileges. Existing PostgreSQL migration grants are imitated to test revocation. Backend tests use a separate PostgreSQL database and the real Rust executable. The production HTTP smoke check exercises two concurrent bootstrap requests (one success, one closed), login, protected module APIs and persisted project creation.

Browser checks cover public/legal/contact pages, responsive viewports, real login, production-lot persistence, core protected routes and project details. Screenshots/server logs are published as GitHub Actions artifacts, not captured from the user's computer.

## Release boundaries

- No merge to main, live deployment, production data migration or production backup/restore was performed.
- Live Supabase project \`foggara-dz\` (\`fqaugqahiubrkcelwsri\`) was inspected read-only on 2026-10-03. It is ACTIVE_HEALTHY on PostgreSQL 17; its Alembic revision is \`d4e5f6a7b8c9\` (main), with 39 public tables and RLS enabled on all. Effective anon/authenticated SELECT/INSERT/UPDATE/DELETE privileges are false for all 39; service_role currently has all four privileges. The security advisor reports INFO for RLS without policies, consistent with direct custom-auth table access being denied: [Supabase explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). This PR's schema has not been applied. Supabase Auth settings, storage buckets and service keys were not inspected. This application uses its own FastAPI JWT identity; it must access SQL using the intended server DB owner/role. Application table owners bypass RLS; org isolation remains enforced in the API. Direct browser Supabase CRUD is deliberately denied. Keep the Supabase Data API disabled or restrict exposed schemas when not used.
- Apply migrations only with an appropriate migration owner after verifying backups and deployment configuration. Existing data under previous PostgreSQL grants and external Data API clients needs an explicit operational review before migration.
- Render's live secrets, PostgreSQL credentials, domain/TLS, worker service, deployed revision and persistence/backup behavior remain unverified. Existing free-tier configuration is not a production SLA.
- An external LLM provider, live weather/satellite/sensor feeds, equipment actuation, payments and outbound email are not configured. The UI does not present calculations or synthetic data as live field measurements.
- Browser auth is memory-only: reload/closing the page requires login. Do not introduce localStorage bearer tokens. A persistent secure-cookie session would be a separate reviewed change.
- All new operational screens are not yet fully translated into French/English.
- The unresolved braces development advisory has a bounded, expiring exception; runtime auditing remains strict.
- Main protection still needs an administrator-capable connection and an eligible private-repository plan. No token is needed in conversation.
