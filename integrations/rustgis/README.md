# RustGIS integration experiment (NOT a deployment)

Upstream: https://github.com/opengeos/RustGIS
Pinned candidate: v0.3.0 (2026-10-16)
License: Apache-2.0 — preserve LICENSE and notices if redistributing code.

## Integration decision
FOGGARA remains the React/Vite + FastAPI application. RustGIS is an optional, isolated geospatial processor, not a replacement for the existing GIS route, PostGIS storage, authentication or evidence workflow.

## Local upstream clone
```bash
git clone --branch v0.3.0 --depth 1 https://github.com/opengeos/RustGIS.git vendor/RustGIS
```
Avoid committing the copied upstream tree into the FOGGARA repository until the dependencies, size, security, license notices and maintenance burden are reviewed. A separate checkout, Git submodule, or a pinned package is preferable to an uncontrolled source copy.

## Preferred first integration: Python engine
Create a separate virtual environment compatible with the published rustgis wheels, then:
```bash
python -m pip install rustgis==0.3.0
```
Proof of concept (run on sample data, **not** production data):
```python
import rustgis
s = rustgis.Session(sample=True)
print(s.layers())
print(s.tools()[:5])
```
Check wheel availability on the exact runtime platform before adding to application dependencies. The API server must run heavy GIS commands in bounded background jobs, validate requested operations, restrict file/URL access, and track provenance. No RustGIS calls should run on import or affect existing endpoints.

## Acceptance tests
1. Load a synthetic or public GeoJSON parcel and verify geographic area with a separately computed baseline and explicit CRS.
2. Display generated data or images through an existing protected FOGGARA endpoint.
3. Verify error containment, cancellation, CPU/memory limits, unsafe path/URL restrictions.
4. Check Arabic/French/English user-facing messaging in FOGGARA.
5. Ensure unchanged GIS, Auth, backend and frontend test suites still pass.
6. Preserve the evidence classification: computed results are COMPUTED and carry inputs, version and method.

## Separate optional browser experiment
The upstream `apps/rustgis-web` is a WASM app. Treat embedding as an isolated experiment with CSP/postMessage origin checks. Do not equate iframe rendering with a fully integrated GIS system.

**Status:** investigation branch prepared; RustGIS has NOT been installed, vendored, tested or deployed in this repository.
