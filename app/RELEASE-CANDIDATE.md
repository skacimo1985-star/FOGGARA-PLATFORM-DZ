# FOGGARA-DZ — Expo 2026 Release Candidate Contract

Status: **RC1 integration branch — NOT production approved**

## Purpose

This branch is the controlled integration line for the AGRITECH Expo release. It starts from the broader operational platform work in PR #2 and accepts selected, reviewed capabilities from PR #3 only after schema, authorization, evidence and migration reconciliation.

## Product invariant

FOGGARA-DZ is a WEFEH decision and assurance platform, not a generic chatbot, ERP, CRM, marketplace, invoice collector, simple GIS map, or investor portal.

Operational cycle:

Resource → Data → Structure → Analysis → Rules → Intelligence → Decision → Action → Monitoring → Evidence → Learning

## Evidence vocabulary

Every material output must preserve provenance and use one of:
- OBSERVED
- VERIFIED
- COMPUTED
- INFERRED
- PROPOSED
- DEMO / SIMULATED

AI-generated or inferred content must never be presented as measured or verified evidence.

## Architecture boundary

### Deterministic / auditable
Engineering calculations, telemetry validation, simulation, constraints, decision scoring, reconciliation and rule evaluation.

### Agentic AI
Extraction, orchestration, search, matching, explanation and drafting. Agents receive least-privilege tools and may not bypass organization isolation or evidence rules.

### Human authority
High-impact decisions, publication of verified claims, controlled Data Room access and material operational actions require explicit authorized human approval.

## RC1 integration order

1. Preserve PR #2 security hardening, organization isolation, audit, Decision Matrix, Data Room and Nexus core.
2. Reconcile PR #3 agriculture domain into one canonical data model and one Alembic lineage.
3. Prefer PR #3 improvements that remove persistent bearer-token storage and improve deployment hygiene when they are compatible.
4. Do not duplicate agriculture routers/models or silently maintain two competing schemas.
5. Keep Arabic RTL, French and English behavior equivalent at the capability level.

## Mandatory release gates

- [ ] One canonical agriculture schema/router/service.
- [ ] Full backend regression suite passes.
- [ ] PostgreSQL fresh migration passes.
- [ ] PostgreSQL downgrade/upgrade migration path passes.
- [ ] Organization isolation / RBAC / IDOR tests pass.
- [ ] Audit events cover material mutations and controlled access.
- [ ] Frontend typecheck, lint and production build pass.
- [ ] Browser QA: Arabic RTL, French, English; desktop and mobile.
- [ ] Authentication secrets/tokens are not persisted to browser disk storage.
- [ ] Data Room authorization and audit trail verified.
- [ ] Deterministic engines preserve input snapshots, units and provenance.
- [ ] SBOM / third-party notices / license review complete.
- [ ] Secret scanning and dependency security review complete.
- [ ] Synthetic data is visibly DEMO/SIMULATED.
- [ ] Unsupported live services are not marketed as operational.

## Explicitly blocked from production claims until verified

- live satellite intelligence pipelines
- live weather pipelines
- image-based diagnosis
- payments
- sovereign Algerian production hosting
- field-accuracy claims
- productivity, savings or revenue claims without operational evidence

## Merge policy

This branch must remain separate from `main` until every mandatory gate above is evidenced. Passing SQLite tests alone is insufficient for production approval.
