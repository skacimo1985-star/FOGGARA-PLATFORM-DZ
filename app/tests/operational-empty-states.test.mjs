import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const emptyState = readFileSync(
  new URL("../src/components/OperationalEmptyState.tsx", import.meta.url),
  "utf8",
);
const projects = readFileSync(
  new URL("../src/pages/Projects.tsx", import.meta.url),
  "utf8",
);
const gis = readFileSync(
  new URL("../src/pages/Gis.tsx", import.meta.url),
  "utf8",
);
const water = readFileSync(
  new URL("../src/pages/Water.tsx", import.meta.url),
  "utf8",
);

test("operational empty state exposes actions instead of placeholder text", () => {
  assert.match(emptyState, /PRODUCTION \/ REAL DATA/);
  assert.match(emptyState, /ActionControl/);
  assert.match(emptyState, /<Link to=\{action\.to\}>/);
});

test("projects guide an empty organization into real setup or first project creation", () => {
  assert.match(projects, /OperationalEmptyState/);
  assert.match(projects, /sites\.length === 0/);
  assert.match(projects, /to: "\/app\/setup"/);
  assert.match(projects, /setShowForm\(true\)/);
});

test("GIS first-run keeps the national map but guides users to create real geography", () => {
  assert.match(gis, /data !== null && data\.length === 0 && parcels\.length === 0/);
  assert.match(gis, /to: "\/app\/setup"/);
  assert.match(gis, /to: "\/app\/agriculture"/);
  assert.match(gis, /Sentinel-2/);
});

test("water setup does not render unusable infrastructure forms without a site", () => {
  assert.match(water, /sites\.length === 0/);
  assert.match(water, /d && sites\.length > 0 &&/);
  assert.match(water, /to: "\/app\/setup"/);
});
