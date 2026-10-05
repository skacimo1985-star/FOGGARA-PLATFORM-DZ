# FOGGARA-DZ Copilot Instructions

Follow the production engineering instructions in [AGENTS.md](../AGENTS.md).

Key principles:
- The existing repository is the source of truth. Inspect before modifying.
- Never recreate an already implemented working capability.
- No direct modification of `main`. All changes through pull requests.
- Tests before merge. Small, reviewable changes.
- No secrets in source, commits, logs, or documentation.
- Preserve organization isolation, authorization boundaries, and evidence provenance.
- AI outputs must not silently become verified engineering facts.
- Maintain Arabic RTL, French, and English UI compatibility.
- Respect OBSERVED / VERIFIED / COMPUTED / INFERRED / PROPOSED evidence states.
- Preserve deterministic behavior for calculations, simulations, and safety interlocks.
- Use conventional commit messages.
