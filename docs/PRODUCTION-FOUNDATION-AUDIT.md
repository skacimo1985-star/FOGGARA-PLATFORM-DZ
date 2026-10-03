# Production foundation audit — 2026-10-03

## Reproducible baseline

Remote default branch: main. Verified commit: `93a190a7c8c59830af126ef84480bb38a11c6eac`.
Tree: `08c27cc4a63762abf5d36261a9986d80fe374773`. All 241 tracked blobs,
file modes, the complete tree and signed commit bytes were verified by Git SHA-1.
Direct Git HTTPS lacked credentials. The authenticated GitHub connector retrieved
immutable objects; the local shallow checkout was reconstructed without inventing
history. No old archive was used. Work branch: `codex/production-foundation`.
No AGENTS.md exists in the fetched tree.

Before code changes, Python 3.12.14 and locked backend dependencies were used:

| Check | Actual result |
|---|---|
| SQLite full pytest | 171 passed, 1 skipped (Rust executable unavailable) |
| PostgreSQL 16 full pytest | 170 passed, 1 failed, 1 skipped |
| PostgreSQL fresh Alembic upgrade | PASS, head int20261003s1 (15 revision files) |
| npm typecheck | PASS |
| npm lint | PASS |
| npm test:matrix (Node 24.19) | 1 passed, 0 failed |
| npm production build | PASS |
| Rust with system Cargo 1.75 | BLOCKED: lockfile v4 / project requires Rust >=1.85 |

The PostgreSQL failure is `test_ingestion_validation_and_duplicates`: the
server's non-UTC session displays the same instant with another offset while the
test expects UTC. Fix connection timezone, not the assertion or stored instant.
Starlette emits one deprecation warning for its httpx TestClient integration.
An initial sandboxed TestClient attempt stalled; recorded results above are the
completed reruns with local socket access, not the stalled attempt.

## Code-backed capability inventory

IMPLEMENTED means code and relevant existing tests exist, not full production certification.

| Phase / capability | Baseline status | Evidence / remaining boundary |
|---|---|---|
| 1 architecture/config | PARTIAL | React/Vite, FastAPI, SQLAlchemy, existing production config, web/worker Compose. Preserve Vite; Next.js rewrite unjustified. |
| 2 data | PARTIAL | PostgreSQL migrations, 15 revisions, single head; no PostGIS. Historical security migration imports live metadata, unsafe for future tables. |
| 3 security | PARTIAL | Scoped JWT, credential invalidation, PBKDF2, RBAC, org checks, file limits, RLS/grants, security tests. No MFA/SSO; per-process general rate limiter; test harness can consume DATABASE_URL. |
| 4 national GIS | MISSING | Coordinate table only (`Gis.tsx`, `explore.py`); 15 fixed wilaya entries duplicated frontend/backend; no administrative hierarchy or geometries. |
| 5 WEFEH | PARTIAL | NexusResource, project evidence graph, versioned policies/observations/evaluations. No general typed cross-resource relation registry. |
| 6 evidence | PARTIAL | Measurement/Evidence, review, provenance labels, attachments, audits; metadata varies by module; binary attachments in SQL. |
| 7 decision/simulation | PARTIAL | Hard-bound matrix, reproducible Python/Rust comparison, human lifecycle; deterministic telemetry. Sensor configuration snapshot/version missing from simulation runs. |
| 8 technical assurance | IMPLEMENTED / PARTIAL | Instruments/calibrations/certificates/inspection, expiry gates, tested workflows. Physical calibration and signed external certificates unverified. |
| 9 commercial assurance | PARTIAL | Evidence-linked stages, reconciliation, tests. No payment execution, external accounting or legal contract validation. |
| 10 VDR | PARTIAL | Disclosure, requests, explicit grants/revocation, Q&A, download audit, adversarial tests. No expiring grants or external identity verification. |
| 11 telemetry/IoT | PARTIAL | Ingest/validation/rules/simulator tested. Devices created as simulated; no commissioned MQTT/Modbus/OPC-UA edge. |
| 12 agriculture | PARTIAL | Source-linked soil/crop/weather observations and operations. No live provider feeds; no measured satellite soil chemistry claims. |
| 13 AI/agents | MISSING | Deterministic assistance exists; no local inference, RAG or least-privilege agent runtime. |
| 14 multilingual UX | PARTIAL | Global ar/fr/en switch, RTL and shared dictionaries; several operational/legal screens primarily Arabic. |
| 15 Digital Foggara | PARTIAL | Existing animated lazy Canvas illustration and reduced-motion support; not live flow data or 3D digital twin. |
| 16 observability | PARTIAL | Request IDs, logs, DB health; no complete telemetry exporter/alert pipeline. |
| 17 CI | PARTIAL | Backend/PostgreSQL/migration/browser/frontend/Rust/container/security jobs, pinned Actions; no SBOM. |
| 18 readiness | NOT PROVEN | Main unprotected per GitHub branch API. Hosting revision, worker, backup restoration, capacity, penetration test and legal approval require evidence. |

## Implementation decisions

- Extend existing modules incrementally; no replacement application or production data mutation.
- National administrative records must be imported with source/license/version and
  explicit data origin. No fabricated boundaries or seeded official registry.
- Keep PostGIS behind a spatial adapter. PostgreSQL is authoritative; SQLite is a
  development fallback and must never pretend to perform PostGIS spatial queries.
- Cloud proposals never authorize or bypass installation-specific local interlocks.
- New security migrations must retain direct Data API denial. Do not relax old grants.
- All final counts, changed files, migration revisions and unresolved gates belong in
  the completion report/PR after actual execution.
