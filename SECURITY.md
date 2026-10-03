# Security policy and release boundary

FOGGARA-DZ handles private organizational, project, measurement and evidence records. Report a suspected vulnerability privately to the repository owner; do not publish credentials, tokens, personal documents or infrastructure coordinates in an issue. No dedicated public security contact or response SLA has been configured.

Implemented safeguards include organization/object checks, current database roles, password-hash-bound JWTs, expiring hashed invitation tokens, selective document disclosure and revocation, evidence review, audit events, bounded file types/sizes and comparison-engine input/time limits. Internal decision references must resolve inside the current organization. Docker build context excludes local databases, credentials, caches and compiled developer artifacts.

Runtime/development dependency locks are scanned in CI. A clean advisory scan means no known findings in the scanned versions at that time; it does not prove software free of vulnerabilities. Rust forbids unsafe code in the comparison core and does not issue equipment commands. Raw imported satellite/sensor data and human declarations must never be labeled laboratory or certified measurements without evidence.

Before production release, complete independent application/tenant/file/export penetration testing, identity/access reviews, MFA and account suspension, individual-session revocation, distributed account/IP abuse controls, trusted proxy configuration, network segmentation, infrastructure encryption/keys, backup restoration, monitoring and incident exercises. Validate document malware handling, retention and rights procedures. Field-control enablement needs installation-specific deterministic interlocks and OT assessment.

Production secret/PostgreSQL/HTTPS-origin guards do not create a sovereign deployment. Actual Algerian hosting, legal/DPO procedures and sector responsibilities must be demonstrated separately. See app/docs/LEGAL_SOURCE_REGISTER.md and app/NEXUS_BLUEPRINT.md. This project has no security or legal certification claim.
