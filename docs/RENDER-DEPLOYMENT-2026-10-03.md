# Render deployment — 2026-10-03

Target: https://dashboard.render.com/web/srv-db0fs9e0tbcc73flq3o0
Public URL: https://foggara-platform-dz-4.onrender.com
Repository: skacimo1985-star/FOGGARA-PLATFORM-DZ
Service: FOGGARA-PLATFORM-DZ-4, Docker, Frankfurt, free, one instance.
Root directory: app/; Dockerfile: Dockerfile.production; build context: .

The initial deployment at integration 26ce525 failed at startup because JWT_SECRET used the forbidden development default. Fresh cryptographic signing and separate bootstrap keys were configured directly in Render, without committing or printing them. Existing DATABASE_URL and other variables were preserved. ENV=prod, SEED_DEMO=false, TOKEN_TTL_HOURS=2, same-origin CORS and disabled implicit proxy trust are explicit.

Docker's default command now uses the existing production entrypoint: upgrade Alembic, ensure the default non-demo indicator, then start Uvicorn on Render's PORT. The container healthcheck uses the same port. Explicit Compose migration/worker command overrides remain supported.

A GitHub-hosted check waits for the final live schema revision int20261003s1, then checks public/login/register/SPA pages, compiled JavaScript, security headers, unauthenticated API denial and invalid-login denial. It creates no production account or business record. Actual successful user login requires the owner to create an organization account through /register.

Read-only preflight of the connected Supabase project found revision d4e5f6a7b8c9 and zero users, organizations and projects. This does not assert that a full backup has been taken. Integration migration paths were tested in disposable PostgreSQL before rollout.

The supplied service currently follows codex/reviewed-integration-2026-10-03 and auto-deploys its commits. The Render connector can inspect services, configure environment variables and trigger deployment, but exposes no existing-service update for branch, healthCheckPath or Docker settings. After the reviewed PR is merged, select main in this service's Dashboard settings and /api/health as its health check. No duplicate paid resource was created.

The web service has no separately provisioned operations worker. The durable queue/worker is tested in Compose; hosting a persistent worker is still required for queued jobs and freshness monitoring. Free Render web services can sleep and are not an always-on production SLA. External LLM/feed integration, full new-screen translation, live credentials/backups and main branch protection retain the documented limitations.

Final deployed SHA, deployment status and hosted-check evidence are recorded in the PR conversation after verification.
