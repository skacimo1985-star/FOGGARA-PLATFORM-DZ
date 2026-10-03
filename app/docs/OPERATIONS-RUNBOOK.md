# FOGGARA-DZ RC1 operations runbook

Status: procedure prepared; hosted recovery and incident exercises are NOT completed.

## Release boundary

Deploy a reviewed commit from release/expo-2026-rc1 to staging only until RELEASE-CANDIDATE.md is satisfied. Preserve the last known working application image and its compatible migration revision. CI success is not production approval.

The existing app/Dockerfile.prod builds the frontend and Rust engine and runs FastAPI as an unprivileged user. Use an external PostgreSQL database; the runtime must use ENV=prod, a newly generated JWT_SECRET, and a DATABASE_URL using the installed psycopg driver (postgresql+psycopg://). Do not copy CI signing values into hosting secrets. Set TOKEN_TTL_HOURS=2 for the pilot. Same-origin frontend/API needs no additional CORS origins.

The entrypoint runs migrations before starting the server. Use one staging instance until migration coordination is explicitly implemented. Review migration effects and capture a recoverable backup before deploying schema changes. Do not run automatic downgrades against operational data.

## Staging acceptance

- Verify /api/health returns HTTP 200 and db=up on the actual HTTPS origin.
- Confirm database restart and application redeploy retain records and evidence attachments.
- Verify no-store on authenticated responses, attachment downloads, nosniff, frame restrictions and CSP on the actual origin.
- Test two separate organizations and two separately approved external Data Room guests; exercise revoked grants and withdrawn disclosures.
- Check Arabic RTL, French and English on mobile and desktop, keyboard navigation and login/logout behavior.
- Verify authentication throttling with the real proxy topology. Do not trust arbitrary forwarded client-IP headers.
- Verify actual workloads before promising response times or availability.
- Use synthetic demonstration data until hosting/data governance is approved.

## Incident response

1. Assign one incident owner and record UTC times, affected release, scope, and evidence references. Avoid copying credentials or sensitive documents into tickets.
2. Preserve relevant audit entries and sanitized operational logs before making changes. Audit rows in the application database are not an independent tamper-proof archive.
3. For a Data Room disclosure incident, an authorized reviewer revokes the relevant grant or withdraws disclosure; close the room when broader containment is needed. Verify the affected guest receives 404 for file downloads. Already downloaded copies cannot be remotely recalled.
4. For compromised signing credentials, rotate JWT_SECRET in the hosting secret store and restart every application instance. Existing tokens become invalid. Password changes invalidate that user's tokens through the credential fingerprint; an administrative password recovery flow still requires implementation and review.
5. Rotate any affected database/provider credential at its issuer, update the hosting secret, and verify health. Removing a string from Git does not revoke a credential.
6. Deploy the reviewed fix, replay the relevant regression tests, and validate actual access restrictions before reopening the affected capability.
7. Record cause, affected scope, containment, recovery evidence and follow-up owner. Determine notification obligations from verified applicable law and the actual incident; this document sets no assumed legal deadline.

## Backup and restore acceptance

- Assign a backup owner, location, retention and recovery targets before admitting operational records. Choose storage permitted for the dataset's sensitivity.
- Use PostgreSQL-native consistent backups or an appropriate managed backup facility. Encrypt backups and restrict access; keep credentials outside source code, shell history and reports.
- Include EvidenceFile binary content stored in PostgreSQL in the recovery scope. Also retain the matching release revision and the secret-recovery procedure separately.
- Restore into an isolated new database first. Never exercise restore commands against the active database.
- Validate migration revision, representative record counts, foreign-key integrity, evidence SHA-256 hashes, organization isolation and Data Room authorization in the restored instance.
- Measure actual backup age and restore duration, record the result, and compare it with approved recovery targets before declaring recovery readiness.

## Current open gates

Hosted TLS/header verification, real proxy throttling, browser/accessibility review, backup/restore exercise, load testing, sovereign hosting, and incident exercise remain pending. Render Free is for a pilot, not production availability; its free PostgreSQL expires after 30 days and has no managed backups. Do not provision it as durable production storage.

References checked 2026-10-01: https://render.com/docs/free ; https://owasp.org/projects/asvs ; repository SECURITY-BASELINE.md and RELEASE-CANDIDATE.md.
