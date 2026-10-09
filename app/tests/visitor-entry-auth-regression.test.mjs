import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const app = read("../src/App.tsx");
const login = read("../src/pages/Login.tsx");
const expo = read("../src/pages/Expo.tsx");
const landing = read("../src/pages/FarmLanding.tsx");

test("visitor entry is optional, password-free and persists a visit before redirect", () => {
  assert.match(login, /name="guest_name"[^>]*maxLength=\{120\}/);
  assert.match(login, /name="guest_role"[^>]*maxLength=\{120\}/);
  assert.match(login, /api\.post<VisitResponse>\("\/expo\/visit"/);
  assert.match(login, /sessionStorage\.setItem\("fg_expo_visit_id"/);
  assert.match(login, /navigate\("\/expo",\s*\{ replace: true \}\)/);
  assert.match(login, /guestBusy/);
  assert.doesNotMatch(login, /name="guest_name"[^>]*\brequired\b/);
  assert.doesNotMatch(login, /name="guest_role"[^>]*\brequired\b/);
});

test("expo can welcome direct visitors but does not expose private workspace", () => {
  assert.match(app, /path="\/expo" element=\{<Expo\s*\/>\}/);
  assert.match(app, /path="\/login" element=\{<Login\s*\/>\}/);
  for (const route of ["/app", "/app/gis", "/app/agriculture", "/app/studio", "/app/vde", "/app/audit"]) {
    assert.ok(app.includes(`path="${route}" element={<Protected>`), route);
  }
  assert.match(app, /if \(!user\) return <Navigate to="\/login"/);
  assert.match(expo, /api\.post<VisitResponse>\("\/expo\/visit"/);
  assert.match(expo, /api\.post<ExpoStats\s*&\s*\{ feedback_id:/);
});

test("public homepage links to existing visitor entry and expo routes", () => {
  assert.match(landing, /to=\{user\?"\/app":"\/login"\}/);
  assert.ok(landing.includes('to="/expo"'));
  assert.ok(landing.includes('to="/presentation"'));
});
