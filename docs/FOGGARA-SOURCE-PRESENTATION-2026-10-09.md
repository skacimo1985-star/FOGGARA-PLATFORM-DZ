# Presentation source and integration — 2026-10-09

The visitor-facing eight-stage presentation at `/#oasis-presentation` (also available at `/presentation`) is a web-native adaptation of the user-uploaded PowerPoint **Oases Nexus WEFEH — FOGGARA-DZ.pptx** (8 slides, widescreen). It replaces the homepage section previously headed “Patrimoine des oasis et ingénierie des ressources” / “صور من تراث الواحات وهندسة الموارد”.

It preserves the slide sequence and substantive points:

1. DÉFINIR LE TERRAIN — AOI, parcelle, coordonnées, surface, périmètre, occupation du sol
2. OBSERVER PAR SATELLITE — Sentinel-2 L2A, séries temporelles, incertitude
3. COMPRENDRE EAU, SOL ET CULTURES — terrain, télédétection, modèles, état non certain
4. PREUVE AVANT DÉCISION — observé, dérivé, modélisé, validé pour usage
5. DE L’ANALYSE À L’ARBITRAGE — contraintes, scénarios, décision WEFEH
6. IA SOUVERAINE ET SERVICES — interfaces métier, géospatial, RAG local, données souveraines
7. UN ÉCOSYSTÈME NATIONAL — institutions, recherche, agriculteurs, entreprises, territoires
8. RENCONTRONS-NOUS AU STAND B02 — démonstration, pilotes, partenariats (source claim from PowerPoint; confirm stand number with exhibitor before public distribution)

## Visual assets and evidence

Photographs/illustrations in the new deck are existing, optimized user-supplied WebP files committed under `app/src/assets/oasis-gallery/`. Visuals are AI-assisted **illustrations**, never imagery from an observed Sentinel-2 acquisition or field-verified photo. The satellite segment does not claim that the accompanying oasis photographs are satellite observations. Real spatial/satellite functionality remains linked to the operational GIS and authorized workflows.

The source presentation contains some overlapping typographic elements, so its written material is adapted into responsive web slides with the same dark/cream palette, forest-green, clay and warm-gold accents. These are not pixel captures of the PowerPoint.

## Navigation

- Homepage `#oasis-gallery` continues to resolve at the same position for existing links, but the standalone gallery section is gone.
- Main anchor: `#oasis-presentation`.
- Full-screen route `/presentation` uses the same `FoggaraSourceDeck` component.
- The expo slide links to the public `/expo` experience.

The previous separate gallery and five-chapter deck components are retained as reusable code but no longer rendered in these routes. No backend, database, authorization or tenancy modifications.
