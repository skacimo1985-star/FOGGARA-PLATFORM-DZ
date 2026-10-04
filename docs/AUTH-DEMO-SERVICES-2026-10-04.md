# Authentication, oasis landing, demo and services

The reported symptom was BAD_CREDENTIALS. Inspection found that registration normalized email while login did not, and login read React state rather than the final controls populated by password managers. Both paths are fixed. This does not establish the cause of the specific user's failure, reset their account or implement email recovery.

## Authentication

Email is trimmed/lowercased; passwords are not trimmed. Login reads named controls at submission, supports visibility/Caps Lock hints and clears fields without altering browser-saved passwords. Tokens remain memory-only. Auth requests allow 60 seconds for cold starts without automatic retries; the UI honors server cooldowns.

Credential POST bodies are capped at 16 KiB including chunked requests, with a 10-second read deadline. A per-worker admission cap defaults to two requests (maximum 16); overload receives 503 AUTH_BUSY and Retry-After: 5. Unrelated health/API paths bypass this pool. Existing bounded local limits run before DB access. Shared database HMAC client/route counters retain five registration attempts per 15 minutes and 30 on other credential paths, now with accurate remaining-window Retry-After and batched cleanup. Database failure fails closed with a generic 503.

Login no longer holds a row lock during password verification. A successful verification is followed by a locked re-read and hash/role comparison before issuing a token, preserving concurrent password-change safety.

## Public experience and catalog

The AR/FR/EN landing retains existing light/dark tokens and workflows. Its original AI-generated Sahara oasis illustration has optimized desktop/mobile WebP assets and an explicit generated-image caption; it is not a documentary photograph of an identified site.

`/demo` requires no account. It calculates synthetic seven-day water scenarios locally from hectares, millimetres, distribution efficiency and lift. Inputs are not persisted. Pump efficiency is explicitly assumed to be 65%; this simplified model is not field validation or authorization to irrigate. Production database demo seeding remains disabled.

Startup inserts seven authored SIREP offerings idempotently without fake customers, measurements, certificates or contracts. PostgreSQL advisory locking serializes concurrent seeders; existing operator edits are preserved. The public API exposes only non-demo offerings from the approved provider. Selecting an offering retains its query through login and selects the authenticated request form. Existing organization isolation governs requests.

Catalog scope remains subject to review, without an accreditation or delivery guarantee. Third-party identity, antivirus, billing, mail and AI providers are not represented as connected without configured credentials and validated integration.

## Verification and operations

Regression tests cover email normalization, DOM autofill, body limits, concurrency/slot recovery, limiter rejection before DB, durable signup cooldown, fail-closed database errors, catalog idempotency/filtering and request isolation. Frontend tests independently check hydraulic conversions, decision boundaries and invalid inputs. CI Chromium covers trilingual responsive landing/demo, oasis assets, blocked/reset decisions and autofill login/catalog selection. Hosted verification waits for the new image and seven offerings, rather than accepting the old healthy release.

These controls bound expensive credential work; they are not a volumetric DDoS guarantee. Admission is per worker. Verify proxy peer identity and sanitization before trusting forwarded headers; otherwise users sharing an upstream peer may share attempt limits. Review edge protection, capacity, monitoring, backup/recovery and client addressing before high traffic. The current free Render service may cold-start and is not high availability.
