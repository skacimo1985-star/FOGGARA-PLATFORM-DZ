# Recovery and capacity gates

Starting source: main `f19f61486964f5d5fe4abb6270846df0935dfa41`. This change
preserves the React/FastAPI/PostgreSQL architecture, authentication protections,
organization authorization, additive migrations and evidence semantics.

## Database backup and recovery

Use the installed backend Python dependencies and PostgreSQL 16 client tools.
Connection URLs are environment variables, not command arguments. SQLAlchemy's
`postgresql+psycopg://` URLs, percent-encoded passwords, sockets and libpq TLS
options are supported; implicit or nested database connection strings are refused.

From `app/backend`:

```bash
python scripts/postgres_recovery.py backup --output-dir /private/foggara-backups
python scripts/postgres_recovery.py restore --archive /private/foggara-backups/foggara-<timestamp>-<id>.dump --expected-head an20261004m1
```

Set `DATABASE_URL` for backup and a separate `TARGET_DATABASE_URL` for restore.
The restore target must be a newly created, empty, isolated database with no
other connected sessions. The tool never drops, cleans or overwrites populated
databases. Keep the target offline until all verification and deployment-specific
checks pass. Only restore trusted archives: a PostgreSQL dump contains SQL.

Backups use a shared exported repeatable-read snapshot for pg_dump and the
manifest. Verification compares every public application table's row count and
content digest, columns, constraints, indexes, RLS settings, policies and the
Alembic head. A failed dump leaves no completed archive; completed backups have
an adjacent manifest and archive SHA-256. Preserve both together. Checksums detect
accidental corruption; they do not authenticate an attacker-modified backup.
Unix archive permissions are private. Operator-managed encryption/access control
and off-host retention remain required; no automatic deletion is introduced.

Restore uses one pg_restore transaction, verifies data/schema/security, and
revokes inherited public-table and sequence privileges for PUBLIC and the
managed-provider API roles anon/authenticated/service_role. API roles must remain
denied even if the target owner has permissive default privileges. SQL/API role
configuration outside these roles still needs deployment-specific review.

Scope is the application's public schema. Global roles, provider auth/storage
schemas, object-store files, secrets, inference models and infrastructure settings
are not included. Restore them through their separate operating procedures. Do
not apply an all-database managed-provider dump to a shared managed instance.

The legacy gzip backup entry point now uses pipefail, private permissions,
temporary output and gzip validation. It no longer announces success after a
pg_dump failure or passes its URL as a pg_dump argument. For verified recovery,
use the new snapshot+manifest tool rather than legacy archives.

## Continuous verification

`python -m tests.operational_gates` accepts only the disposable GitHub Actions
PostgreSQL service. It creates and removes databases named foggara_qa_*, migrates
them, creates synthetic accounts/projects through HTTP, backs up and restores,
checks restored login/read/write and cross-organization 404 behavior, and refuses
to restore again over the populated target. Source and target are stopped while
the recovery gate runs. No live deployment is contacted.

The capacity gate sends 96 invalid logins at concurrency 32 while running 24
health checks. It requires bounded 401/429/503 outcomes, Retry-After on rejection,
healthy database responses under pressure, five allowed registrations followed
by three denied attempts, and continued denial after restarting the API. The QA
JSON reports measured status counts and p95/max latency. This validates admission
and durable throttling on CI capacity; it is not a throughput, DDoS, Render Free
availability or national-scale performance guarantee.

Only aggregate operational-gates.json is uploaded with browser QA. Database
archives, row content, credentials and process logs are temporary and removed.

## Remaining release evidence

The deployed database's actual encrypted backup/restore drill, off-host retention,
field/laboratory records, private inference hosting and continuous production
monitoring remain operator/infrastructure tasks. The release must not be described
as fully nationally production-ready solely because these CI gates pass.

PostgreSQL behavior follows the primary PostgreSQL 16 documentation:
https://www.postgresql.org/docs/16/app-pgdump.html
https://www.postgresql.org/docs/16/app-pgrestore.html
