import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/pages/Gis.tsx", import.meta.url),
  "utf8",
);
const mapSource = readFileSync(
  new URL("../src/components/NationalMap.tsx", import.meta.url),
  "utf8",
);

test("GIS can select parcels that do not yet have mapped boundaries", () => {
  assert.match(source, /api\.get<ParcelRecord\[]>\("\/agriculture\/parcels"\)/);
  assert.match(source, /value=\{selectedParcelId \?\? ""\}/);
  assert.match(source, /setSelectedParcelId/);
});

test("parcel boundary workspace supports server-validated GeoJSON import", () => {
  assert.match(source, /extractPolygonGeometry/);
  assert.match(source, /accept="\.geojson,\.json,application\/geo\+json,application\/json"/);
  assert.match(source, /boundary_geojson: geometry/);
});

test("parcel boundaries can be exported or explicitly cleared", () => {
  assert.match(source, /application\/geo\+json/);
  assert.match(source, /foggara-parcel-/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /boundary_geojson: null/);
});

test("map wording supports first-time boundary drawing", () => {
  assert.match(mapSource, /Draw boundary/);
  assert.match(mapSource, /Dessiner la limite/);
  assert.match(mapSource, /ارسم حدود القطعة/);
});
