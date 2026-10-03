# Requested main protection

Status on 2026-10-03: **not applied**. Repository metadata reports administrative access, but the connected managed GitHub App rejects the protection endpoint with HTTP 403 `Resource not accessible by integration`. The connector does not expose administration writes. Repository-level metadata is not proof that this integration can manage branch protection.

For the `main` branch, an administrator should configure:
- Require a pull request before merging.
- Require successful checks: `backend`, `frontend`, `security`, `rust`, `production-container`.
- Require branches to be up to date before merging.
- Require conversation resolution.
- Apply the rules to administrators; prohibit force pushes and branch deletion.
- A solo maintainer can initially use zero mandatory approvals while retaining the PR and check requirements; require one independent approval when a second trusted reviewer exists.
- Restrict bypass actors to a deliberate emergency-only policy.

The API payload in `.github/main-protection.requested.json` is a reviewable requested configuration, **not an active rule**. Private-repository plan restrictions may also apply; these have not been verified. No token was requested or copied, and no direct writes to main were performed.
