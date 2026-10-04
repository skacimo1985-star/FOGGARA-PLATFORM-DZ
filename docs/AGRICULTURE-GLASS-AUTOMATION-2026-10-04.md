# Agriculture glass and automation foundations — 2026-10-04

The production preview stays at https://foggara-dz.onrender.com/.
The new authenticated workspace is /app/automation.

## Identity and interface

The company’s latest retained design, “Oasis futuriste sous arche maghrébine.png” (2026-10-02), contains the technological palm, crescent and five-pointed star. The original composition is encoded as a small WebP inside a self-contained SVG; no replacement emblem was invented. It replaces the letter glyph in the brand and favicon. Responsive agricultural glass surfaces preserve opaque text, visible controls and keyboard focus. Agriculture uses the Sprout icon, while the new automation branch uses Workflow.

A lightweight SVG resource graph replaces the Canvas basin on the landing, presentation and resource workspaces. Sources feed the FOGGARA core and the five domains. Domain selection, animation pause and reset work with keyboard and pointer. Motion respects reduced-motion settings. Public links are explanatory, not field telemetry. On the automation page domain counts come from reviewed organization data.

## Existing database, new automation

No new parallel database, table or authentication system is introduced. The existing PostgreSQL MatrixJob, MatrixPolicy, MatrixObservation, MatrixEvaluation and ValueMatch models remain authoritative.

- A lifecycle-managed consumer starts by default in ENV=prod. OPERATIONS_AUTOMATION_ENABLED=false disables it for a dedicated-worker deployment; local development defaults to disabled.
- Each 15-second cycle processes at most 20 jobs. Existing SKIP LOCKED row claiming, organization locks, atomic job/output commits and three-attempt terminal failure handling remain in effect. Failures in a queue cycle are logged by exception class and retried on the next cycle. Shutdown finishes the current transaction.
- Hourly refresh re-enqueues active-policy projects that have observations. Approval of a new observation and policy activation already enqueue evaluation jobs; new supply/demand listings enqueue matching jobs.
- The new authenticated summary API exposes only the current organization’s policy, observation/job counts, derived matrix and serving-instance runtime status. The enqueue API is rate-limited, organization-locked and audited, schedules at most 500 projects, and deduplicates pending work.
- WEFEH evaluation version wefeh-reviewed-provenance-v2 retains the existing weights, bounds, unit matching and freshness rules. Results explicitly carry COMPUTED, field_execution=false, source, measurement time, unit, raw value, submitter and reviewer references. The fingerprint includes the algorithm version so legacy results remain preserved and a new enriched result is distinguishable. No missing measurement is fabricated.

## Matrix meaning

For domains i and j, C[i,j] is the number of DISTINCT organization projects with approved observations in both domains. C is symmetric; its diagonal is reviewed project coverage per domain. The query first deduplicates (project, domain), then joins within the organization. It does not treat correlation as causation, invent influence coefficients or imply that historic readings remain fresh. Evaluation freshness is checked independently by the versioned policy.

## Deployment limits

Embedded processing runs only while the web service is running. A sleeping or suspended free Render web service does not provide continuous 24/7 processing. Jobs remain in PostgreSQL and resume when the service starts. A separately provisioned worker can provide independent scheduling; it was not created or charged in this release. Independent review and human approval remain required, and this foundation never actuates equipment or executes a contract.

## Validation

Frontend build and lint; operation regression tests; new tests for reviewed-only matrix membership, organization isolation, queue deduplication, provenance preservation, missing-data handling and worker recovery/shutdown. Chromium tests exercise automatic queue completion, 25 matrix controls, AR/FR/EN and mobile/desktop layouts, alongside public scenarios, persistence and protected routes. Hosted verification checks the actual new graph and original brand asset after deployment. PostgreSQL/Rust/security/container validation runs through CI before merge.
