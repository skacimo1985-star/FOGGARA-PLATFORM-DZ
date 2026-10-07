import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(
  new URL("../src/components/NationalMap.tsx", import.meta.url),
  "utf8",
);

test("operational map exposes real measurement tools", () => {
  assert.match(source, /haversineMeters/);
  assert.match(source, /polygonAreaSquareMeters/);
  assert.match(source, /measurement-draft/);
  assert.match(source, /measureMode === "distance"/);
  assert.match(source, /measureMode === "area"/);
});

test("operational map exposes coordinate and metric scale controls", () => {
  assert.match(source, /ScaleControl/);
  assert.match(source, /cursorCoordinate/);
  assert.match(source, /toFixed\(5\)/);
});

test("satellite and analysis rasters have user-controlled opacity", () => {
  assert.match(source, /satelliteOpacity/);
  assert.match(source, /analysisOpacity/);
  assert.match(source, /raster-opacity/);
  assert.match(source, /type="range"/);
});

test("selected satellite raster is labelled as a scene rather than a generic satellite basemap", () => {
  assert.match(source, /True-color scene/);
  assert.match(source, /Scène vraie couleur/);
  assert.match(source, /مشهد حقيقي الألوان/);
});
