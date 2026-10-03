# FOGGARA-DZ

Algerian WEFEH production and decision-support platform by SIREP Oasis Nexus WEFEH. The React/Vite application, FastAPI API, PostgreSQL migrations and Rust comparison engine are under [app/](app/).

Development and verification are organized through GitHub branches, pull requests and GitHub Actions. Main is the reference branch; changes are reviewed before merging.

The reviewed integration combines project/evidence workflows, agriculture, versioned WEFEH evaluations, production lots, durable jobs, GIS, telemetry, simulation and permissioned Data Rooms. Decisions have explicit human review and authorization. Calculations and proposals are labelled with their provenance.

- [Component and branch review](docs/INTEGRATION-REVIEW-2026-10-03.md)
- [Production stack and feature boundaries](docs/OPERATIONS.md)
- [Requested main protection and permission limitation](docs/MAIN-PROTECTION.md)
- [Dependency security review](docs/DEPENDENCY-SECURITY.md)
- [Application configuration](app/README.md)

A running production deployment is not established by a successful build alone. Live hosting/database configuration and the remaining release boundaries are listed in the review. No production accounts or credentials are embedded in the repository.
