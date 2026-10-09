# FOGGARA — optional curated user visuals

Place the **actual binary WebP images** from the conversation media package directly in this folder.

The React source at `app/src/components/oasisVisuals.ts` uses Vite's `import.meta.glob` to include only committed binary assets. The website keeps its existing 3-image gallery when no curated assets are present, avoiding broken image links.

## Curated file names (13)

- kasria-earth-channels.webp
- palm-oasis-kasria.webp
- kasria-water-distribution.webp
- oasis-irrigation-stream.webp
- traditional-kasria-outlets.webp
- rock-kasria-detail.webp
- palm-kasria-alternate.webp
- oasis-palms-blue-sky.webp
- oasis-palm-reflection.webp
- sunset-over-oasis.webp
- oasis-rock-pool.webp
- sahara-desert-rocks.webp
- sahara-cultural-scene.webp

## Rights and provenance

AI-assisted illustrative media provided by the user. These are not verified photographs of an identified site. Do not use as measured or inspected engineering evidence. The historic-plaque and AI-location-sign images have unverified writing and are excluded; `mountain-oasis-pool.webp` contains a photographer credit/watermark and is withheld from automatic publication pending permission.

## Integration and verification

The `foggara_oasis_site_assets.zip` handoff archive contains the 13 optimized files in **this exact directory**. Extract its contents into the repository root, commit as binary files to the feature branch, then run `cd app && npm ci && node --test tests/farm-landing.test.mjs && npm run build`. Only merge and deploy after all expected image assets and tests are present.
