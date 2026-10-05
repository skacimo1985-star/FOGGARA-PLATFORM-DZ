# FOGGARA-DZ Production Engineering Instructions

> **SIREP OASES NEXUS WEFEH-DZ**
> Algerian National Integrated Platform for Sustainable Resource Management and Decision Support.
> Domains: Water · Energy · Food · Ecosystem · Health

These instructions define **how agents must work** on FOGGARA-DZ. They are governance rules, not product specifications. Every pull request is expected to follow them.

---

## 1. Source of Truth

- The existing repository is the source of truth. Do not create a replacement project or rebuild working capabilities from scratch.
- Inspect before modifying. Read the code, migrations, tests, and CI configuration you will touch before writing anything.
- Never recreate an already implemented working capability. Extend existing code; do not duplicate it.
- No speculative requirements. Build what is asked, not what might be needed later.
- Preserve architecture unless there is a demonstrated engineering reason to change it. Document that reason in the PR.

## 2. Change Discipline

- Small, reviewable changes. One concern per PR when practical.
- No direct modification of `main`. All changes arrive through pull requests.
- Tests before merge. New or modified behavior must be covered by tests that run in CI.
- Pull requests must document:
  - **What changed** — files and areas affected
  - **Why** — the engineering or user-facing reason
  - **Tests executed** — commands run and results
  - **Security implications** — new inputs, permissions, data exposure, or boundaries
  - **Migrations** — any database migration included, and whether it is reversible
  - **Rollback considerations** — how to revert if the change is defective

## 3. Migrations and Database

- Migrations must remain reversible and traceable. Every `upgrade` must have a corresponding `downgrade` (Alembic) or `down` migration.
- Never `DROP`, `DELETE` columns, change column types, or rename tables without a multi-step migration plan that preserves user data.
- Database changes require: migration file, tests, indexes where justified, and tenant/organization isolation checks.
- Do not use `BEGIN`/`COMMIT`/`ROLLBACK` in migration files. `DO $$ ... END $$` blocks are acceptable.
- Enable RLS on every new table. Scope policies explicitly — never use `USING (true)` as a shortcut around ownership checks.

## 4. Security

- No secrets in source code, commits, logs, prompts, screenshots, fixtures, CI artifacts, or documentation.
- Environment variables must use placeholders or examples only. Never commit real values.
- Security controls must not be silently weakened. If a change affects authorization, authentication, RLS, or access boundaries, state it explicitly in the PR.
- Fail securely. Errors must not leak sensitive data or grant unintended access.
- Validate all external inputs — API parameters, file uploads, URLs, user-entered text.
- Preserve organization isolation and authorization boundaries. Every query and mutation must be scoped to the current organization/tenant.
- CI/CD must use least privilege. Workflow secrets, tokens, and permissions must be minimal and scoped.
- Do not commit generated binaries, local databases, secrets, caches, virtual environments, build output, or developer-machine state.

## 5. Evidence and Provenance

- Respect evidence states: **OBSERVED**, **VERIFIED**, **COMPUTED**, **INFERRED**, **PROPOSED**. These labels describe record origin and analytical state.
- AI outputs must not silently become verified engineering facts. AI-generated analysis, predictions, or proposals must be labelled as `INFERRED` or `PROPOSED` until human review.
- Human validation must remain available for consequential engineering or regulatory decisions.
- Preserve deterministic behavior for engineering calculations, simulations, rules, and safety interlocks. These must produce the same output for the same input.
- Raw imported satellite/sensor data and human declarations must never be labelled as laboratory or certified measurements without evidence.
- Maintain auditability and evidence provenance. Every decision, action, and measurement must be traceable to its source.

## 6. Domain-Specific Rules

### GIS and Spatial Data
- GIS changes must preserve spatial correctness and CRS/SRID integrity.
- Never mix coordinate reference systems without explicit transformation.
- Validate geometry inputs before storage.

### IoT and Telemetry
- IoT ingestion must preserve device identity, timestamps, calibration/provenance, and telemetry integrity.
- Never alter or fabricate device timestamps. Use server-side reception time as a secondary record, not a replacement.

### API
- API changes require: input validation, authorization checks, error handling, and tests.
- Error responses must be generic to external callers; detail must appear in server logs only.
- Breaking API changes require a deprecation path or version bump.

### Frontend
- Frontend changes must use existing design/system patterns before adding new ones.
- Maintain Arabic RTL, French, and English compatibility when modifying UI architecture.
- Maintain accessibility (WCAG) and responsive design across all viewport sizes.
- Translation keys must stay aligned across all three languages.

## 7. Dependencies

- Do not add dependencies unless justified and checked for maintenance/security impact.
- Prefer removing unused dependencies over adding new ones.
- New dependencies must pass the CI advisory scan without known vulnerabilities.

## 8. Deployment and Sovereignty

- Local-first / sovereign deployment compatibility must be preserved.
- Avoid unnecessary vendor lock-in. Prefer open-source, self-hostable components.
- A successful build does not establish a production deployment. Live hosting, database configuration, and release boundaries must be verified separately.
- Docker build context must exclude local databases, credentials, caches, and compiled developer artifacts.

## 9. FOGGARA Identity

FOGGARA-DZ is an engineering and evidence-driven decision platform. The core decision cycle is:

```
Resource → Data → Structure → Analysis → Rules → Intelligence → Decision → Action → Monitoring → Evidence → Learning
```

FOGGARA-DZ is **not** to be reduced to:
- ERP, CRM, or generic marketplace
- Chatbot
- Simple GIS viewer
- Generic investor portal

It connects actors, resources, projects, measurements, analysis, rules, decisions, execution, monitoring, and verified evidence across the WEFEH domains.

## 10. Commit Conventions

- Use conventional commit messages: `type: description`
- Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `perf`
- Reference issue or PR numbers when relevant: `fix: correct water balance calc (#42)`
