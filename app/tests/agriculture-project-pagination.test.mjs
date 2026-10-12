import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("agriculture reads paginated project records as Page<ProjectRef> rather than an array", () => {
  const agriculture = read("../src/features/agriculture/Agriculture.tsx");
  const backend = read("../backend/app/routers/core.py");
  assert.match(backend, /@router\.get\("\/projects", response_model=Page\[ProjectOut\]\)/);
  assert.ok(agriculture.includes("api.get<{items:ProjectRef[]}>('/projects')"));
  assert.ok(agriculture.includes("setProjects(pr.items)"));
  assert.ok(agriculture.includes("const contextProject=pr.items.find("));
  assert.ok(!agriculture.includes("setProjects(pr);"));
  const result = ts.transpileModule(agriculture, {
    fileName: "Agriculture.tsx",
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    reportDiagnostics: true,
  });
  assert.equal((result.diagnostics ?? []).filter(d => d.category === ts.DiagnosticCategory.Error).length, 0);
});
