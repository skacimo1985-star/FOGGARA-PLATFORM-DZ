# FOGGARA-DZ — Integrated Nexus product baseline

FOGGARA-DZ is the Algerian integrated platform for sustainable resource management and production, developed by EURL SIREP Oasis Nexus WEFEH. The product boundary is Water, Energy, Food, Ecosystem and Health. Agriculture is one intelligence layer in this system.

The defining relationship is resource → measurement → rule → actor → decision → action → evidence. Source provenance and human responsibility remain visible throughout. The Digital Kasria represents this common organizing core. Its interface animation is an architectural illustration, never a live flow measurement.

## This implementation

- A new trilingual public landing page presents the integrated platform, evidence, decisions and controlled collaboration.
- The authenticated workspace uses grouped navigation for core/projects, analysis/decisions, and assurance/collaboration. A global language control and RTL/LTR layout remain consistent.
- The workspace fetches the current organization's projects, declared Nexus resources, sites and decisions. Search and domain selection filter actual projects. Counts include synthetic records when those are present; individual synthetic projects remain labeled DEMO.
- Selecting a project loads its evidence relationships. Measurements, evidence and actions retain their recorded provenance; matrix calculations and linked proposed decisions extend that graph without claiming causality.
- The decision studio creates persisted comparisons across any subset of the five domains. Users declare criteria, units, minimize/maximize objectives, weights, optional hard bounds, alternatives, numeric values, scenario context and optional reviewed evidence sources.
- Hard violations exclude alternatives before scoring. Feasible options are min–max normalized by criterion and scored by weighted sum. All-equal feasible values contribute equally. No feasible alternatives means no ranking. The algorithm version, complete inputs, results and SHA-256 fingerprint are stored and auditable. Scores are relative comparisons, not probabilities or engineering certifications; changing the alternative set can change the ranking.
- A human selects a feasible alternative and gives a reason and risk level. The server creates a PROPOSED general decision with its calculation evidence and transition record. Existing separation-of-duties and review/authorization rules continue to govern the subsequent lifecycle. No equipment commands are issued. Referenced evidence is rechecked when proposing a decision.

## Boundaries relative to the target definition

| Target capability | Current state | Additional implementation required |
|---|---|---|
| Water assets, allocations, decisions | Existing operational domain | Live field adapters and installation-specific interlocks |
| Nexus resources | Five-domain declaration register | Rich energy, ecosystem and One Health domain models |
| Water/soil intelligence | Source-linked measurements and soil records | Full sample custody, laboratory methods and water-quality assessment profiles |
| Satellite/crop/weather | Imported reviewed observations, NDVI/LSWI and weather records | Provider ingestion, geospatial raster processing, calibrated moisture models and monitoring jobs |
| Spatial twin | Authorized site coordinates and resource relationships | PostGIS geometries, MapLibre layers and permissions for spatial data |
| IoT | Existing deterministic simulator and ingestion/validation APIs | MQTT/Modbus/OPC-UA bridges, edge provisioning and operational telemetry |
| Dynamic matrices | Persisted generic declared comparisons and proposal lifecycle | Domain-specific physical optimizers, uncertainty propagation and calibrated decision models |
| Sovereign AI/RAG/agents | Architectural target; no AI inference configured | Local model service, permission-filtered retrieval, guarded tools, evaluation and auditing |
| Data Rooms | Approved access, selected reviewed documents, Q&A, revocation and audit | Verified legal identities, retention policy and enterprise document controls |
| Commercial/technical assurance | Evidence-backed reconciliation and metrology | Contract extraction, external system connectors and calibrated anomaly detection |
| Readiness/matching | Explained rules and declared capability matching | Locally validated sector policies, certified capabilities and financing models |
| Mobile | Responsive installable PWA | Native Android/iOS packaging, store release and notification infrastructure |
| Terminology and multilingual data | Shared UI dictionaries; standardized measurement labels localized | Versioned terminology registry and human-reviewed multilingual document/data content |
| Expo workflow | Organizations, needs/offers, services, Data Rooms | Exhibitor/visitor-specific profiles, QR onboarding, consented media and follow-up workflow |
| Sovereign production | Self-hostable application with PostgreSQL requirement | Algerian hosting, identity provider, object storage, TLS, operational monitoring and recovery validation |

The initial general matrix implementation does not calculate physical irrigation requirements or certify laboratory results. It compares numeric scenario inputs declared by users. A linked reviewed document records provenance; it does not certify every input assumption. Legal or safety limits must be supplied and reviewed by the competent party.

The infrastructure and integrations above are explicit remaining work. The redesigned interface does not label unconfigured providers or AI services as operational.
