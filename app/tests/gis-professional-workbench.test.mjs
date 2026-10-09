import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("FOGGARA GIS is an integrated map-first workspace and not a static marketing page",()=>{
  const page=read("../src/pages/PublicGis.tsx");
  const css=read("../src/pages/foggara-field-workbench.css");
  assert.ok(page.includes('className="fg-field-workspace"'));
  assert.ok(page.includes('className="fg-field-map-panel fg-public-gis-map"'));
  assert.ok(page.includes('className="fg-field-pane fg-field-setup"'));
  assert.ok(page.includes('className="fg-field-pane fg-field-insights"'));
  assert.ok(page.includes('NationalMap key={retry} sites={[]} wilayas={WILAYAS}'));
  assert.ok(page.includes('onDrawParcelBoundary={geometry=>change(geometry)}'));
  assert.ok(page.includes('onAnalysisSelectionChange={b=>change(b?rectanglePolygon(b):null)}'));
  assert.ok(page.includes('className="fg-public-gis-coordinate-entry"'));
  assert.ok(css.includes("grid-template-columns:clamp(275px,22.5vw,320px) minmax(0,1fr)"));
  assert.ok(css.includes(".fg-field-map-stage .fg-national-map-canvas"));
  assert.ok(css.includes("@media(max-width:730px)"));
  assert.ok(css.includes("prefers-reduced-motion"));
});

test("spectral index tabs and real acquisition IDs are passed to backend; no mock numbers",()=>{
  const p=read("../src/pages/PublicGis.tsx");
  const api=read("../backend/app/routers/expo.py");
  assert.ok(p.includes('const [index,setIndex]=useState<IndexKey>("ndvi")'));
  assert.ok(p.includes('setIndex("ndmi")'));
  assert.ok(p.includes('setIndex("ndvi")'));
  assert.ok(p.includes('scene_id:selectedSceneId'));
  assert.ok(p.includes('api.post<Preview>("/expo/satellite/ndvi-preview"'));
  assert.ok(p.includes("result?.indices?.[index]"));
  assert.ok(p.includes('result?.status==="NO_USABLE_SCENE"'));
  assert.ok(p.includes('typeof ndvi==="number"'));
  assert.ok(api.includes('index: Literal["ndvi", "ndmi"] = "ndvi"'));
  assert.ok(api.includes('features = [feature for feature in features if feature.get("id") == payload.scene_id]'));
  assert.ok(api.includes('plan = build_processing_plan(feature, payload.index)'));
  assert.ok(api.includes('geometry_wgs84=polygon'));
  assert.ok(api.includes('"geometry_mask_applied"'));
  assert.ok(api.includes('"persisted": False'));
});

test("quality, source and field limits must be disclosed and responsive",()=>{
  const p=read("../src/pages/PublicGis.tsx");
  assert.ok(p.includes('coverage*100')||p.includes('(coverage*100)'));
  assert.ok(p.includes('range?.min?.toFixed(3)'));
  assert.ok(p.includes('result?.scene?.datetime'));
  assert.ok(p.includes('v.indexNdmiNote'));
  assert.ok(p.includes('v.limitations'));
  assert.ok(p.includes('!rangeValid?v.invalidDate:v.pixelBudget'));
  assert.ok(p.includes('pixels<=1600&&rangeValid'));
  assert.ok(p.includes('v.estimated'));
  assert.ok(p.includes('saveFoggaraAoi(area)'));
});

test("workbench TSX parses as valid React TypeScript",()=>{
  const src=read("../src/pages/PublicGis.tsx");
  const res=ts.transpileModule(src,{fileName:"PublicGis.tsx",compilerOptions:{
    target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,
  },reportDiagnostics:true});
  const errors=(res.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,"\n")).join("\n"));
});
