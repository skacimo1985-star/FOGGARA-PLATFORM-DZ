# FOGGARA self-hosted CI (Windows)

This path is a controlled fallback when GitHub-hosted runners cannot be allocated.
It does not replace the full Linux/PostgreSQL/production release gate.

## Security boundary

- Repository: `skacimo1985-star/FOGGARA-PLATFORM-DZ` only.
- Runner label: `foggara-ci` in addition to `self-hosted`, `Windows`, `X64`.
- The workflow is manual or owner-triggered through `selfhosted-verify/**` branches.
- The registration token is short-lived and must stay on the local machine.
- Do not paste registration tokens, PATs, passwords, database URLs, or private keys into issues, PRs, chat, source files, or logs.
- The verification workflow does not require repository Actions secrets.

## One-time runner setup

1. Open the repository runner page:
   `https://github.com/skacimo1985-star/FOGGARA-PLATFORM-DZ/settings/actions/runners/new`
2. Select Windows / x64 and copy only the temporary registration token.
3. On the Windows machine, from a trusted clone of this repository, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-self-hosted-windows-runner.ps1
```

4. The script prompts for the temporary token with hidden input, downloads the latest official `actions/runner` Windows x64 release, registers the runner with the `foggara-ci` label, zeroes the in-memory token buffer, and starts the runner.
5. Keep the runner terminal open while verification is executing.

## Current verification queue

The branch `selfhosted-verify/pr79` contains `.github/self-hosted-target.txt` pointing to the reviewed head of PR #79. Its workflow run remains queued until a matching `foggara-ci` Windows x64 self-hosted runner comes online.

## What the Windows fallback verifies

- Python source compilation.
- No repository-stored legacy demo credential literal.
- No Python literal assignment to `DEMO_PASSWORD`.
- `pip-audit` for locked backend dependencies.
- Bandit scan of backend application code.
- Targeted bootstrap, national-wilaya and agriculture tests on disposable SQLite.
- Frontend install, typecheck, lint, tests, build and locked dependency audit.
- Rust tests and clippy when Rust is installed; optionally fail if Rust is required.

## What still requires the full release gate

The Linux CI remains authoritative for PostgreSQL 16 migrations, snapshot recovery, tenant isolation under PostgreSQL, browser/Chromium smoke, Docker production-stack verification, and the complete backend suite. Do not describe a release as fully verified solely from this fallback workflow.

## Shutdown

When verification is complete, stop the runner with Ctrl+C. Do not leave a personal workstation runner permanently online unless it is isolated and intentionally managed as CI infrastructure.
