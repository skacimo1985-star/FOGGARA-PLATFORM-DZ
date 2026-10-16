# API QA Portfolio | Postman + Python

**Author:** MAHROUG ERRAS BELKACEM  
**Type:** Independent learning and QA demonstration, not paid client work.  
**Purpose:** Show reproducible API functional checks and honest test reporting.

This material lives on a **separate GitHub branch** and makes **no change to FOGGARA-DZ main**.

## Artifacts
- `postman/API_QA_Demo.postman_collection.json`: 3 example requests to public Postman Echo test endpoints, with assertions
- `scripts/response_checks.py`: Python helper for explicit HTTP/JSON checks
- `tests/test_response_checks.py`: seven deterministic, offline unit tests
- `UPWORK_COPY.md`: proposed portfolio entry for Upwork

## Run offline

```bash
python -m unittest discover -s upwork-portfolio/api-qa/tests -v
```

These unit tests operate only on synthetic response data. **They do not make network requests** and do not prove uptime, security, or any live API behavior.

## Try in Postman
Import `postman/API_QA_Demo.postman_collection.json`. Review the GET requests, then explicitly run them in Postman. Current live execution status: **not verified**.

## Evidence boundary
- Locally verified: seven Python unit tests passed (16 Oct 2026).
- Prepared but not executed here: live Postman Echo HTTP scenarios.
- No claim of third-party client work, paid contracts, security certification, or production testing.

## Scope for future client services
Any actual API test requires documented authorization, permitted endpoints, expected behavior and agreed delivery. Keep contracts and payments **on Upwork** when a client is found through Upwork.
