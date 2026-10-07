import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync(
  new URL("../src/features/agriculture/EvidenceAssessmentPanel.tsx", import.meta.url),
  "utf8",
);
const agriculture = readFileSync(
  new URL("../src/features/agriculture/Agriculture.tsx", import.meta.url),
  "utf8",
);

test("soil and water service results expose evidence provenance rather than bare values", () => {
  assert.match(panel, /measurement_sources/);
  assert.match(panel, /measured_at/);
  assert.match(panel, /evidence_status/);
  assert.match(panel, /decision_status/);
  assert.match(panel, /derived_metrics/);
  assert.match(panel, /limitations/);
  assert.match(panel, /references/);
});

test("recorded soil observations are visibly distinct from verified measurements", () => {
  assert.match(agriculture, /soil_provenance/);
  assert.match(agriculture, /AGRICULTURE_OBSERVATIONS/);
  assert.match(panel, /Verified measurement/);
  assert.match(panel, /Agriculture observation/);
});

test("missing evidence remains an explicit unavailable state", () => {
  assert.match(panel, /Insufficient evidence/);
  assert.match(panel, /VERIFIED_WATER_MEASUREMENTS_REQUIRED/);
  assert.match(panel, /PROJECT_WATER_RESOURCE_REQUIRED/);
});
