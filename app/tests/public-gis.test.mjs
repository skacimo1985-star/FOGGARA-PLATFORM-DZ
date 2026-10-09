import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import ts from "typescript";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("public GIS route loads without sign-in; operational organization GIS stays isolated",()=>{
  const app=read("../src/App.tsx");
  assert.ok(app.includes('const PublicGis = lazy(() => import("@/pages/PublicGis"))'));
  assert.ok(app.includes('<Route path="/gis" element={<PublicGis />} />'));
  assert.ok(app.includes('<Route path="/app/gis" element={<GisAccess />} />'));
  assert.match(app, /function GisAccess\(\)[\s\S]*?return user\?<Gis\/>:<Navigate to="\/gis" replace\/>/);
  assert.ok(app.includes('if (!user) return <Navigate to="/login" replace'));
});

test("GIS guest view uses existing open source MapLibre without private API requests",()=>{
  const page=read("../src/pages/PublicGis.tsx");
  assert.ok(page.includes('NationalMap key={retry} sites={[]} wilayas={WILAYAS}'));
  assert.ok(page.includes('onViewportChange={setViewport}'));
  assert.ok(page.includes('to={user?"/app/gis":"/login"}'));
  assert.ok(page.includes('from:{pathname:"/app/gis"}'));
  assert.equal(page.includes('api.get('),false);
  assert.equal(page.includes('api.post('),false);
  assert.ok(page.includes('https://www.openstreetmap.org'));
  assert.ok(page.includes('lang==="ar"?"rtl":"ltr"'));
  for(const path of ["../public/vendor/maplibre-gl.mjs","../public/vendor/maplibre-gl-worker.mjs","../public/vendor/maplibre-gl-shared.mjs","../public/vendor/maplibre-gl.css"]){
    assert.ok(existsSync(new URL(path,import.meta.url)),path);
  }
});

test("public GIS navigation is visible from oasis homepage and existing protected links work",()=>{
  const landing=read("../src/pages/OasisRestoredLanding.tsx");
  assert.ok(landing.includes('to:user?"/app/gis":"/gis"'));
  assert.ok(landing.includes('to={to==="/app/gis"&&!user?"/gis":to}'));
  const css=read("../src/pages/public-gis.css");
  assert.ok(css.includes(".fg-public-gis-map"));
  assert.ok(css.includes("@media(max-width:800px)"));
});

test("PublicGis.tsx remains valid React TypeScript JSX",()=>{
  const code=read("../src/pages/PublicGis.tsx");
  const result=ts.transpileModule(code,{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
    reportDiagnostics:true,fileName:"PublicGis.tsx"
  });
  const errors=(result.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,"\n")).join("\n"));
});
