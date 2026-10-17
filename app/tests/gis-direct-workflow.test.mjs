import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("GIS analysis works on a selected AOI without project or seeded sites",()=>{
  const s=read("../src/pages/Gis.tsx");
  const match=s.match(/const simpleAnalysisReady = Boolean\(([\s\S]*?)\n  \);/);
  assert.ok(match,"simple mode availability must be declared");
  assert.doesNotMatch(match[1],/activeProjectId/);
  assert.match(match[1],/currentRasterBudget.allowed/);
  assert.match(match[1],/selectedParcelId \|\| manualAnalysisBbox/);
  assert.match(s,/api\.get<FieldIntelligenceStudy>\(\x60\/remote-sensing\/studies\/field-intelligence/);
  assert.match(s,/\{!activeProjectId \? \(/);
  assert.match(s,/\) : null\}\s*<div className="fg-gis-simple-controls">/);
  assert.ok(s.includes('WGS84 BBOX:'));
});

test("field polygons can be drawn and saved before a parcel or project exists",()=>{
  const page=read("../src/pages/Gis.tsx");
  const map=read("../src/components/NationalMap.tsx");
  assert.match(map,/\{onDrawParcelBoundary \? \(/);
  assert.doesNotMatch(map,/\{selectedParcelId && onDrawParcelBoundary \? \(/);
  assert.match(page,/setDraftPolygon\(geometry\)/);
  assert.ok(page.includes('draftParcelBoundary={draftPolygon}'));
  assert.ok(map.includes('draftParcelBoundary?: { type: "Polygon"'));
  assert.ok(map.includes('id: -1'));
  assert.ok(map.includes('parcelId > 0'));
  assert.match(page,/polygonBoundingBox\(geometry\)/);
  assert.match(page,/boundary_geojson: draftPolygon \?\? bboxPolygon\(manualAnalysisBbox\)/);
  assert.match(page,/polygonAreaHectares\(draftPolygon\)/);
  assert.match(page,/api\.post<ParcelRecord>\("\/agriculture\/parcels"/);
  assert.match(page,/site_id: activeProjectSiteId/);
  assert.ok(read("../src/pages/gis-direct-workflow.css").includes("fg-gis-db-diagnostics"));
});

test("organization GIS diagnostics report real database state, not a synthetic count",()=>{
  const page=read("../src/pages/Gis.tsx");
  const python=read("../backend/app/routers/explore.py");
  assert.ok(page.includes('"/gis/operational-status"'));
  assert.ok(page.includes('gisStatus.organization.parcels'));
  assert.ok(page.includes('gisStatus.database.engine'));
  assert.ok(python.includes('@router.get("/gis/operational-status")'));
  assert.ok(python.includes('Depends(get_current_user)'));
  assert.ok(python.includes('model.org_id == user.org_id'));
  assert.ok(python.includes('db.get_bind().dialect.name'));
  assert.ok(python.includes('"provider_online_verified": False'));
});

test("MIT Turf-style WGS84 polygon hectares give realistic reproducible geometry",async()=>{
  const src=read("../src/lib/geojson-area.ts");
  assert.match(src, /(?:Turf\.js[^\n]*MIT|@turf\/area[^\n]*MIT|MIT[^\n]*Turf\.js)/i, "expected Turf.js MIT license attribution");
  const parsed=ts.transpileModule(src,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022},
    reportDiagnostics:true,fileName:"geojson-area.ts"
  });
  const errors=(parsed.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
  assert.deepEqual(errors,[]);
  const m=await import("data:text/javascript;base64,"+Buffer.from(parsed.outputText).toString("base64"));
  const point=(a,b)=>[a,b];
  const full={type:"Polygon",coordinates:[[point(2.8695,33.7995),point(2.8705,33.7995),point(2.8705,33.8005),point(2.8695,33.8005),point(2.8695,33.7995)]]};
  const half={type:"Polygon",coordinates:[[point(2.8695,33.7995),point(2.87,33.7995),point(2.87,33.8005),point(2.8695,33.8005),point(2.8695,33.7995)]]};
  const a=m.polygonAreaHectares(full),b=m.polygonAreaHectares(half);
  assert.ok(a>0.9&&a<1.2,"expected ~1ha actual Algerian coordinate rectangle");
  assert.ok(b>0.4&&b<a);
  assert.ok(Math.abs(b/a-0.5)<0.01);
  assert.deepEqual(m.polygonBoundingBox(full),[2.8695,33.7995,2.8705,33.8005]);
});
