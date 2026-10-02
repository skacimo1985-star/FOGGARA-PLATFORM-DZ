# FOGGARA deployment

The latest Kimi package is integrated with additional fixes for preserving Git
files, PowerShell URL parsing/secret cleanup, a strict rate-limiter key capacity,
and ESM-compatible Vite configuration.

## Render + existing Supabase

- Deploy `main` using `render.yaml`, free web plan, Frankfurt.
- Set `DATABASE_URL` privately in Render, using the existing `foggara-dz`
  Supabase project's **session pooler** URI, port 5432, with `sslmode=require`.
  Never commit the URI or paste a password into a chat.
- `ENV=prod`, `SEED_DEMO=false`; JWT and one-time setup secrets are generated
  in hosting settings. No demo users are created.
- Startup runs Alembic and seeds only the default indicator, then starts FastAPI.
- Verify `/api/health` reports `db=up` and the expected Alembic revision.
- Create the first administrator with `/api/setup/bootstrap` using the
  `X-Setup-Key` header privately; remove `SETUP_KEY` after setup.

## Database boundary

This application authenticates through FastAPI and its own user table, not
Supabase browser Auth. The 39 public tables now have RLS enabled and direct
table grants to `anon` and `authenticated` revoked following owner approval.
The owner/backend connection retains access. The idempotent SQL is in
`app/scripts/secure-supabase.sql`; it is not run automatically on startup.
Apply corresponding protections when adding tables in future migrations.

## Limits and verification

`TRUST_PROXY_HEADERS` now defaults to false in every environment. This Render
configuration explicitly enables it and relies on Render sanitizing the first
X-Forwarded-For address. Keep the backend behind that proxy. The key count is
bounded by `RL_MAX_KEYS`; requests from new addresses fail closed at capacity
until a window expires. Limits remain per process, not shared across workers.

The Kimi package's 81 tests passed locally on SQLite. Additional limiter tests
are included. GitHub CI runs Python 3.12 tests and migrations on PostgreSQL 17.
A local frontend production build passed using Vite's native config loader.
PowerShell scripts passed syntax parsing; a real Windows backup/restore drill
has not been completed. Do not interpret this as full production acceptance.

Remaining functional work includes real IoT, VDE and member invitations.
Some lookup selectors still load only their first 500 records, and the home
view uses a bounded project list. Their aggregation/lookup behavior needs further
work for larger datasets. The app bundle also has a size warning.
