import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("wilaya registry is canonical and complete", () => {
  const registry = JSON.parse(
    readFileSync(new URL("../reference/wilayas.json", import.meta.url), "utf8"),
  );

  assert.equal(registry.length, 69);
  assert.deepEqual(
    new Set(registry.map((row) => row.code)),
    new Set(Array.from({ length: 69 }, (_, index) => String(index + 1).padStart(2, "0"))),
  );

  for (const key of ["ar", "fr", "en"]) {
    assert.equal(new Set(registry.map((row) => row[key])).size, 69);
  }
});

test("frontend adapter imports the canonical JSON instead of duplicating entries", () => {
  const adapter = readFileSync(
    new URL("../src/lib/wilayas.ts", import.meta.url),
    "utf8",
  );

  assert.match(adapter, /reference\/wilayas\.json/);
  assert.doesNotMatch(adapter, /\{\s*code:\s*["']/);
});
