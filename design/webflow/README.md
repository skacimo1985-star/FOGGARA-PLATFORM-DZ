# Webflow template source transfer

The actual Webflow Designer content has been captured from site `6ad253be00b94b8a57ed6c7e` into this branch.

## Captured
- `source/foggara-ar.json`, `source/foggara-fr.json`, `source/foggara-en.json`: complete accessible Designer element trees (text, class names, element nesting, attributes).
- `source/foggara-legal-*.json`: legal page trees.
- `source/styles.json`: 219 returned Webflow style definitions, base breakpoint.
- `build-static.mjs`: generate a local best-effort HTML/CSS preview from the captured source.

Run from the repository root:
```sh
node design/webflow/build-static.mjs
```
Open `design/webflow/static-preview/foggara-ar.html` in a browser after running.

## Important limitations
This is **not** Webflow's official HTML/CSS/JS ZIP export. The connected Webflow tool cannot export the full website. Snapshots lack complete HTML embeds, assets, component implementations, scripts, responsive overrides, site interactions and possible data bindings. Some CSS values reference Webflow asset variables and are intentionally excluded by the preview builder. The generated HTML is not production ready and must not replace the existing app.

To complete faithful transfer, obtain official Webflow exported code (if the site's plan permits it) and upload ZIP, or rebuild the approved design using these source snapshots together with downloaded licensed assets and responsive styles. Keep Auth/GIS/backend routes intact and test all three locales before review.

## Status
On separate branch only; no files in the running React/FastAPI application have been overwritten.
