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

## MapLibre GL JS

FOGGARA-DZ uses MapLibre GL JS 6.11.2 for client-side geospatial rendering.
MapLibre GL JS is licensed under the BSD 3-Clause License. The application bundles
it locally through the reviewed npm lockfile; the P1 GIS workspace does not require
a proprietary external map SDK or browser geolocation.

Source: https://github.com/maplibre/maplibre-gl-js
License: BSD-3-Clause
