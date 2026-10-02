# FOGGARA operational extension

This extends the React 19 / FastAPI / SQLAlchemy / Alembic baseline. It does not
replace existing water, metrology, evidence, decisions, telemetry or simulation
modules. New public and operations screens are Arabic-first; existing modules
retain their Arabic/French/English dictionaries. Full translation of the new
screens remains a release task.

## Implemented

- Public presentation of FOGGARA and SIREP OASIS NEXUS WEFEH, based on the supplied
  company deck and narration. Professional services, software and field systems
  are distinguished; experimental data is not described as national measurements.
- Versioned organization-owned WEFEH rules and independently reviewed observations.
  Five domains are mandatory, positive weights sum to one, units match exactly,
  timestamps include time zones, future and non-finite input is rejected.
- Reproducible evaluation snapshots reference their policy version and input IDs.
  Latest approved, correctly unit-labelled observations within their freshness
  windows are normalized to 0–100, reversed for "lower is better", then weighted.
  Incomplete input returns coverage and missing domains, never a fabricated
  aggregate. Displayed policy templates are illustrative and require admin review.
- Approval cannot be performed by a contributor of source observations, and
  incomplete or obsolete evaluations cannot be approved.
- Production lots follow production → processing → quality review → ready →
  dispatched → closed. Quality release requires an independent reviewer.
- Organization-internal offer/demand matching requires exact product code, sector
  and unit; same-wilaya alternatives rank first. Up to 20 alternatives per demand
  and 2,000 active listings per organization bound processing. Alternatives can
  share inventory: they are NOT reservations, contracts, payments or allocations.
- Durable database jobs, transaction-safe outputs and three attempts. PostgreSQL
  SKIP LOCKED permits multiple workers. Process termination rolls back an
  unfinished transaction so the job remains pending. Freshness is re-evaluated
  hourly while the long-running worker is running.
- Contact tickets stored with consent-policy version and unique reference.
  No email is sent. Only admins of CONTACT_ORG_CODE can read the platform inbox.
- User privacy requests and admin responses. A response does not itself implement
  data export or deletion; operators must carry out and document the requested
  action after identity and retention checks.
- Admin account creation within the current organization; passwords never appear
  in account responses. Users can change passwords. Credential-bound JWTs become
  invalid when the password changes. Old JWTs issued before this update require
  users to log in again. Logout removes the browser token; it does not revoke a
  previously copied token. Browser tokens currently remain in localStorage.
- Navigation to /app/operations and /app/account, public legal/contact routes,
  phone/tablet layouts, reduced-motion support, loading/error/empty states.

## Database and worker

Run from app/backend against the SAME database as the API:

    python -m alembic upgrade head
    python -m app.operations_worker

For a bounded queue drain (at most 100 attempts):

    python -m app.operations_worker --once

Hourly freshness refresh is part of the long-running worker, not --once.
Failed jobs remain visible; the worker does not silently retry forever.
Investigate before enqueueing another evaluation. Pending jobs do not prove a
worker is online. UI manual evaluation and matching remain available.

The migration is e5f6a7b8c9d0, based on d4e5f6a7b8c9. It creates nine
new tables and their indexes without deleting existing application data.
Take a backup before applying it to an existing installation. Downgrading
this extension drops its operational records and must not be used as a routine
production rollback.

## Container deployment

Use app/Dockerfile.production and compose.production.yml. The older app/Dockerfile
starts an embedded database and is NOT the production path for this extension.
The production configuration separates PostgreSQL 16, migrations, web and worker,
disables demo seeding, runs the app as a non-root user, and binds HTTP to localhost
for an operator-managed TLS reverse proxy.

Set these values in an untracked .env before starting:

    POSTGRES_PASSWORD=<strong URL-safe random password>
    DATABASE_URL=postgresql+psycopg://foggara:<URL-encoded password>@db:5432/foggara
    JWT_SECRET=<separate random secret at least 32 characters>
    SETUP_KEY=<separate random bootstrap key>
    CONTACT_ORG_CODE=DEFAULT-ORG

Then:

    docker compose -f compose.production.yml up --build -d

Create the first administrator through POST /api/setup/bootstrap using the
X-Setup-Key header; this endpoint closes once users exist. Do not store the key
in browser application code or source control. Use /app/account to create
independent reviewers. Remove SETUP_KEY from the long-running environment after
bootstrap. Set CONTACT_ORG_CODE to the actual contact operator's organization.
Do not enable trust of forwarded client addresses without a sanitizing proxy.

Keep database backups outside the host, test restoration, monitor disk/queue age
and 5xx responses, and install a TLS reverse proxy before public use.
This repository addition does not provision those external services.

## Legal and media

Legal pages reference Algeria's law 18-07 as amended by law 25-11 (2025),
and distinguish internal matching from electronic commerce under law 18-05.
They are an operational draft requiring alignment with the actual deployment,
retention schedule, controller/processor arrangements, appointed privacy contact,
and applicable authority formalities. They do not certify compliance, trademark
registration, professional accreditation, or national/international deployment.

The public image is "Foggara in Timimoun" by Bernard Gagnon, Wikimedia Commons,
CC BY 4.0. Its presentation is cropped and darkened. Attribution and license
links appear in /rights. It is not one of the user's local attachments.
The supplied local files could be read during source research, but their asset
copying could not be completed after the local execution environment failed.
The photograph loads from Wikimedia; fonts may load from Google. Self-host
licensed assets for a deployment that prohibits external browser requests.

Design reference: https://dribbble.com/tags/agriculture-dashboard (inspiration;
no source design/component copied). Company identity is from the supplied deck,
not inferred from external directories.

## Verification and limits

CI applies migrations to PostgreSQL and runs the full API suite. Chromium checks
public routes, hero image loading, narrow-screen overflow, contact saving, login,
lot creation/reload and API 404 handling. Screenshots and a JSON report are kept
in the foggara-browser-verification workflow artifact.

This is a tested operational extension, not completion of the entire long-term
national platform roadmap. Rust security core, PostGIS spatial services, a secure
IoT/OT gateway, payment/contracts, cross-organization marketplace permissions,
signed assurance, sovereign infrastructure, disaster recovery certification,
MFA/SSO, native mobile, automated privacy export/deletion and external agent
integrations are not implemented by this change.
