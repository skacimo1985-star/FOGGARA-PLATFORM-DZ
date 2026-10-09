import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/pages/farm-landing.css", import.meta.url), "utf8");

test("oasis hero keeps photograph below overlay and text in one isolated stack", () => {
  assert.match(css, /\.fml-hero\{[^}]*isolation:isolate/);
  assert.match(css, /\.fml-hero-image\{[^}]*z-index:0;/);
  assert.match(css, /\.fml-hero-shade\{[^}]*z-index:1;/);
  assert.match(css, /\.fml-hero-content\{[^}]*z-index:2;/);
  assert.match(css, /\.fml-hero-caption\{[^}]*z-index:2;/);
  assert.doesNotMatch(css, /\.fml-hero-(?:image|shade)\{[^}]*z-index:-/);
});

test("hero title wraps instead of clipping and no important declarations are required", () => {
  assert.match(css, /\.fml-hero h1\{[^}]*overflow-wrap:anywhere;[^}]*white-space:normal/);
  assert.match(css, /@media\(max-width:450px\)/);
  assert.doesNotMatch(css, /!important/);
});
