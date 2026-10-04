# Dependency security review — 2026-10-04

Runtime and full frontend dependency audits reject high/critical findings without exceptions. The build-only Tailwind 3 advisory chain (GHSA-vfj7-8cjw-p6xm) was removed from the lock by migrating to pinned Tailwind CSS and Vite plugin **4.3.3**, removing tailwindcss-animate/autoprefixer, and using the existing tw-animate-css package. No advisory suppression remains in the audit script.

The Vite plugin generates CSS from the existing JavaScript theme configuration. Custom colors now reference semantic CSS variables so dark theme applies to utility-based components. Existing radius values, small shadows and blur scales are preserved. Browser integration checks exercise existing public/protected workflows, AR/FR/EN, 390/768/1440px widths and analytics in both themes. CI retains backend pip-audit, Bandit and secret scanning.

Compatibility: Tailwind 4 supports Chrome 111+, Safari 16.4+, Firefox 128+. Older browsers are outside this release baseline. Sources: https://tailwindcss.com/docs/upgrade-guide and https://github.com/advisories/GHSA-vfj7-8cjw-p6xm .

Local npm audits reported zero vulnerabilities at verification time. This is a dated dependency result; it does not certify the whole platform or future dependency versions. Main bundle remains about 503 kB minified and emits Vite's 500 kB advisory warning.
