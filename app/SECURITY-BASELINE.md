# FOGGARA-DZ Secure Release Baseline — RC1

This baseline is a project control, not a certification claim.

## Standards profile

- NIST SSDF SP 800-218 v1.1: secure-development lifecycle baseline.
- NIST SP 800-218 Rev.1 / SSDF v1.2: draft only; tracked for future alignment, not claimed as a final standard.
- OWASP ASVS 5.0: application-security verification reference. RC1 targets the controls relevant to authentication, session management, authorization, tokens, API/web services, data protection, configuration, logging and architecture.

## Automated evidence in CI

- PostgreSQL 16 service, fresh databases and Alembic upgrade.
- Alembic one-step downgrade then upgrade-to-head round trip.
- Backend dependency audit with pip-audit.
- Python static security scan with Bandit.
- Full backend tests against PostgreSQL.
- Rust release build, tests and clippy with warnings denied.
- Frontend dependency audit at high severity threshold.
- Frontend deterministic matrix tests, production build and lint.
- Full-history secret scan with Gitleaks.

## Security architecture invariants

1. Organization-scoped records must be queried with organization identity derived from the authenticated principal, never trusted from client payloads.
2. Authorization and independent-review rules are server-side.
3. Authentication bearer material is memory-only in the browser; legacy disk token storage is removed.
4. API responses use no-store; request logging excludes Authorization/password material.
5. CSP defaults to local assets for the application surface.
6. Evidence provenance is explicit: OBSERVED, VERIFIED, COMPUTED, INFERRED, PROPOSED, DEMO/SIMULATED.
7. Inference is not silently promoted to measurement. Satellite soil chemistry is not accepted as laboratory measurement without a separately validated model/evidence process.
8. Deterministic engineering engines preserve method/formula/limitations and require human review for proposed operational decisions.
9. Controlled Data Room access and material mutations require authorization and auditability.

## Manual / environment gates still required

- Browser QA for Arabic RTL, French and English on representative desktop/mobile browsers.
- Accessibility review (keyboard, focus, contrast, semantics).
- Data Room adversarial authorization tests and download/access audit verification.
- Deployment TLS/header verification on the actual public staging origin.
- Backup/restore exercise for the selected production PostgreSQL/object-store environment.
- Load/performance test against an agreed workload and SLO.
- Sovereign-hosting review before sensitive Algerian operational datasets are admitted.
- Incident response, vulnerability intake and recovery runbooks.

## Release rule

A green CI run proves only the automated checks encoded in the workflow for that commit. It is not ISO certification, penetration-test certification, legal compliance certification, or production authorization.
