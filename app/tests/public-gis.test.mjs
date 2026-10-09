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

test("FOGGARA visitor GIS has native drawing, live scenes and a real NDVI preview",()=>{
  const page=read("../src/pages/PublicGis.tsx");
  assert.ok(page.includes('NationalMap key={retry} sites={[]} wilayas={WILAYAS}'));
  assert.ok(page.includes('onDrawParcelBoundary={geometry=>change(geometry)}'));
  assert.ok(page.includes('onAnalysisSelectionChange={b=>change(b?rectanglePolygon(b):null)}'));
  assert.ok(page.includes('draftParcelBoundary={area}'));
  assert.ok(page.includes('/expo/satellite/scenes'));
  assert.ok(page.includes('api.post<Preview>("/expo/satellite/ndvi-preview"'));
  assert.ok(page.includes('NDVI'));
  assert.ok(page.includes('saveFoggaraAoi(area)'));
  assert.ok(page.includes('to={user?"/app/gis":"/login?mode=team"}'));
  assert.ok(page.includes('from:{pathname:"/app/gis"}'));
  assert.ok(!page.includes('https://www.openstreetmap.org/#map'));
  assert.ok(!page.includes('"/gis/operational-status"'));
  assert.ok(!page.includes('"/agriculture/parcels"'));
  for(const path of ["../public/vendor/maplibre-gl.mjs","../public/vendor/maplibre-gl-worker.mjs","../public/vendor/maplibre-gl-shared.mjs","../public/vendor/maplibre-gl.css"]){
    assert.ok(existsSync(new URL(path,import.meta.url)),path);
  }
});

test("a guest-drawn geometry passes into the protected FOGGARA workspace",()=>{
  const page=read("../src/pages/Gis.tsx");
  const handoff=read("../src/lib/foggara-aoi.ts");
  assert.ok(page.includes('readFoggaraAoi()'));
  assert.ok(page.includes('setDraftPolygon(pending)'));
  assert.ok(page.includes('setManualAnalysisBbox(box)'));
  assert.ok(page.includes('clearFoggaraAoi()'));
  assert.ok(page.includes('if (manualAnalysisBbox || draftPolygon || !activeProjectSiteId'));
  assert.ok(handoff.includes('FOGGARA_AOI_KEY="foggara_gis_aoi_v1"'));
  assert.ok(handoff.includes('sessionStorage.setItem'));
  assert.ok(handoff.includes('boundsOfPolygon(value:unknown)'));
  const login=read("../src/pages/Login.tsx");
  assert.ok(login.includes('new URLSearchParams(location.search).get("mode") === "team"'));
  assert.ok(login.includes('teamMode?"order-1 lg:order-1'));

  assert.ok(!handoff.includes('localStorage'));
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
