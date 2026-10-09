# Third-party notices

The production UI bundles Tajawal and Hanken Grotesk through their Fontsource packages.
Both font families use the SIL Open Font License 1.1. The complete notices are shipped
with the application in `public/licenses/tajawal-OFL.txt` and
`public/licenses/hanken-grotesk-OFL.txt`, copied unmodified from the installed packages.
Font files are served locally; no requests to Google Fonts are required.

Application dependencies remain listed in `package.json` and its lockfile.
Backend dependencies are listed in `backend/requirements.txt`.
Pysolar is a GPL test-only comparison reference, as documented in the existing README;
it is not imported into production application code.

## Oasis landing illustration

`public/images/oasis-hero.webp` and `oasis-hero-mobile.webp` are optimized copies of an original image generated for this project using OpenAI Image Gen on 2026-10-04. The scene is a Sahara date-palm oasis with an irrigation channel, dunes and distant earthen buildings. It is not a sourced third-party photograph or a representation of an identified real site. The landing labels the illustration as AI-generated.

## User-supplied institutional artwork and presentation

`public/images/sirep-company-logo.png` and `sirep-wefeh-banner.png` are unchanged copies of the institution's images supplied for this redesign. `source-deck/slide-1.webp` through `slide-8.webp` are previews of the supplied eight-slide Oases Nexus WEFEH FOGGARA deck; the opaque orange fill on slide 2 was removed. `source-satellite.jpeg`, `source-field.jpeg` and `source-ecosystem.png` are original embedded media extracted from that deck. They retain their source ownership; this change does not license institutional artwork as open-source or claim these illustrations are platform measurements.

Existing open-source components remain independently attributed: MapLibre GL JS for maps, Rasterio for raster processing, and gmqtt for MQTT ingestion. No third-party product is relabelled as an institution-owned project.
