# Dependency security review — 2026-10-03

Backend lock auditing and application Bandit checks are mandatory. Frontend runtime dependencies use `npm audit --omit=dev --audit-level=high` without exceptions.

The full frontend audit currently identifies GHSA-vfj7-8cjw-p6xm (CVE-2026-93687): stack exhaustion in braces <=3.0.3. The authoritative advisory, updated 2026-10-02, states no patched version is available:
https://github.com/advisories/GHSA-vfj7-8cjw-p6xm

A temporary exception expires **2026-10-17 00:00 UTC**. The audited chain is braces → chokidar/micromatch/fast-glob → Tailwind CSS 3 / tailwindcss-animate. All six entries are development dependencies in the committed lockfile. They process repository-owned source patterns during build; the deployed application serves prebuilt assets, never user-supplied Tailwind/glob patterns, and ships no frontend node_modules or Node build server. CI must build only reviewed repository source; untrusted patterns can still crash a build.

`app/scripts/audit-dependencies.mjs` rejects runtime high/critical findings, unknown advisories, affected runtime lock entries, a reported available fix, malformed/error audit responses, or an expired exception. No npm advisory is globally ignored. Low/moderate findings remain visible in npm output and require normal maintenance.

This is a documented residual build risk, not a claim of zero vulnerabilities. Replace the exception when a patch is available, or perform a separately reviewed Tailwind 4 migration with visual regressions checked. Tailwind 4 changes browser support, CSS directives and utility scales, so an automatic major update is inappropriate during this integration.
