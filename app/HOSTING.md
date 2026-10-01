# Hosting preparation — Render Free + Supabase Free

Status: deployment configuration prepared; resources NOT yet provisioned. The connectors for both providers must be connected before provisioning. Do not upgrade either plan or add paid capacity without user authorization.

## Concrete deployment

1. Select the user's intended Supabase **Free** project, preferably dedicated to FOGGARA. Confirm the current project and billing tier before writes. Never reset or replace an existing project.
2. Use its PostgreSQL **session pooler** connection (IPv4-compatible) with `sslmode=require` for this persistent Python service. Use the returned hostname/port verbatim. The provider's actual certificate can be configured for `verify-full` later. Never place the URL/password in Git, browser variables or chat.
3. Set `DATABASE_SCHEMA=foggara`. Startup creates the schema and removes access for PUBLIC and Supabase anon/authenticated roles. Keep this schema outside Supabase Data API exposed schemas; disable the Data API entirely for a dedicated backend-only project if appropriate.
4. Provision the Render **free** Docker web service from the existing private GitHub repo, using root `app`, Dockerfile `Dockerfile.prod` and the existing development branch. The root `render.yaml` records this configuration, disables automatic deployments and generates JWT_SECRET on the provider. Set DATABASE_URL through secret configuration.
5. Startup prepares the private schema and applies Alembic migrations. Production demo seeding is forbidden. FastAPI serves the built React frontend and `/api` on the same HTTPS origin. No cross-origin public API is needed.
6. Provision a real admin only after the database is reachable, through `python -m app.bootstrap_admin` in a trusted console (if available), or an equivalent authorized secure database operation. Never expose a bootstrap endpoint or use a demo password. Do not assume free Render instances provide shell access; confirm available provider capabilities at provisioning time.
7. Verify `/api/health`, unauthenticated denial, real admin login, create/reload a parcel and evidence, cross-organization isolation, TLS and backup/export before calling the deployment operational.

## Free-tier limitations checked 2026-10-01

- Render free web services idle after 15 minutes; a cold start is expected. This is a pilot, not guaranteed always-on production.
- Render free PostgreSQL expires after 30 days; do not provision it for persistent FOGGARA records.
- Supabase Free includes 500 MB database quota and may pause low-activity projects after seven days. Confirm the user's current quota and availability before creation.
- No automatic backup/restore reliability is claimed. Arrange and test a backup before real operational use.
- This cloud pilot does not satisfy the final Algerian-sovereign architecture. Restrict it to approved non-sensitive pilot data.

Sources:
- https://render.com/docs/free
- https://render.com/docs/blueprint-spec
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/free-project-pausing
- https://supabase.com/docs/guides/database/connecting-to-postgres
- https://supabase.com/docs/guides/api/securing-your-api
