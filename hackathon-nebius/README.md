# FOGGARA NEXUS — Hackathon demonstration (work in progress)

This isolated branch is for a reproducible **prototype**, not a claim that production WEFEH, MQTT, Modbus, TimescaleDB or field controls work.

## Scope
- Synthetic water and energy inputs only.
- Deterministic risk checks before any AI explanation.
- No actuation: outputs are advice, never commands.
- NVIDIA/Nebius call: **not yet implemented or verified**. Do not represent offline output as model inference.

## Submission verification checklist
1. Implement CLI demonstration, input schema, and automated tests.
2. Integrate Nebius Token Factory with a documented supported NVIDIA open model. Use environment variables for credentials; never commit keys.
3. Log model and prompt versions, data provenance and uncertainty.
4. Prove safety-gate behavior under bad input or unavailable model.
5. Record a real <=3 minute video showing the exact runnable code and live inference call.
6. Add license, setup commands, code URL and honest implementation status to Devpost.

See issue #232 for acceptance criteria. Preserve `main` until tests and review pass.
