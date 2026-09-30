# FOGGARA-DZ

Algerian WEFEH operational platform by SIREP Oasis Nexus WEFEH. The repository contains the React/Vite web application and FastAPI backend under [`app/`](app/).

## Run locally on Windows without Docker

Requirements: Python 3.12+ and Node.js 20+ on `PATH`.

```powershell
cd app
.\run-local.bat
```

This starts the development backend with SQLite and the web app. Open `http://localhost:3000`; the API health check is `http://localhost:8000/api/health`. The seeded records are synthetic and marked DEMO. This local mode is for evaluation, not production.

For PostgreSQL, migrations, tests, production configuration, architecture notes, and current feature boundaries, see [`app/README.md`](app/README.md).
