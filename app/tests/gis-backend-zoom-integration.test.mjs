import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const read=p=>readFileSync(new URL(p,import.meta.url),"utf8");

test("shared MapLibre zoom controls provide zoom+, zoom- and fit-to-field on every route",()=>{
  const map=read("../src/components/NationalMap.tsx");
  const css=read("../src/pages/command-center.css");
  assert.ok(map.includes('mapRef.current?.zoomIn({ duration: 250 })'));
  assert.ok(map.includes('mapRef.current?.zoomOut({ duration: 250 })'));
  assert.ok(map.includes('const zoomToArea = () =>'));
  assert.ok(map.includes('mapRef.current?.fitBounds([[w,s],[e,n]]'));
  assert.ok(map.includes('disabled={engineState !== "ready" || !analysisSelectionBbox}'));
  assert.ok(map.includes('aria-label="Zoom level"'));
  assert.ok(map.includes('new ResizeObserver('));
  assert.ok(map.includes('resizeObserver?.disconnect()'));
  assert.ok(css.includes('.fg-map-zoom-toolbar{position:absolute;'));
});

test("FOGGARA organization GIS reads genuine tenant data and saves boundaries in the backend",()=>{
  const page=read("../src/pages/PublicGis.tsx");
  assert.ok(page.includes('api.get<SavedField[]>("/agriculture/parcels")'));
  assert.ok(page.includes('api.get<OperationalStatus>("/gis/operational-status")'));
  assert.ok(page.includes('parcelBoundaries={mappedFeatures}'));
  assert.ok(page.includes('onSelectParcel={selectSavedField}'));
  assert.ok(page.includes('api.post<SavedField>("/agriculture/parcels"'));
  assert.ok(page.includes('boundary_geojson:area,site_id:null,stage:"initial"'));
  assert.ok(page.includes('setSavedFieldId(saved.id)'));
  assert.ok(page.includes('await loadWorkspace()'));
  assert.ok(page.includes('!user||!area||!bbox||!fieldName.trim()||!fieldCrop.trim()'));
  assert.ok(page.includes('savedFieldId!==null'));
  assert.ok(page.includes('savedFields.filter(p=>!p.archived)'));
});

test("stored fields use polygon-clipped full organization backend while guests keep bounded public preview",()=>{
  const page=read("../src/pages/PublicGis.tsx");
  const backend=read("../backend/app/routers/remote_sensing_catalog.py");
  assert.ok(page.includes('if(user&&savedFieldId!==null)'));
  assert.ok(page.includes('api.get<SavedParcelStudy>(`/remote-sensing/studies/field-intelligence?'));
  assert.ok(page.includes('params.set("scene_id",selectedSceneId)'));
  assert.ok(page.includes('api.post<Preview>("/expo/satellite/ndvi-preview"'));
  assert.ok(page.includes('pixels<=(user&&savedFieldId!==null?250_000:1600)'));
  assert.ok(backend.includes('AgriParcel.org_id == _user.org_id'));
  assert.ok(backend.includes('raw_bbox, geometry, sample_geometry, _fingerprint = _analysis_target(parcel)'));
  assert.ok(backend.includes('geometry_wgs84=geometry'));
  assert.ok(backend.includes('"PARCEL_MASK_MISSING"'));
  assert.ok(backend.includes('feature.get("id") == scene_id'));
  assert.ok(backend.includes('"geometry_mask_applied": bool(spectral.get("mask", {}).get("geometry_mask_applied"))'));
});

test("live preview has a suitable satellite timeout without extending ordinary requests",()=>{
  const api=read("../src/lib/api.ts");
  assert.ok(api.includes('const isPublicRasterPreview = path === "/expo/satellite/ndvi-preview"'));
  assert.ok(api.includes('const isLongRunningStudy = path.startsWith("/remote-sensing/studies/") || isPublicRasterPreview'));
  assert.ok(api.includes('const DEFAULT_TIMEOUT_MS = 20_000'));
  assert.ok(api.includes('120_000'));
});

test("one-tap map analysis and responsive backend field management are wired",()=>{
  const page=read("../src/pages/PublicGis.tsx"),css=read("../src/pages/foggara-field-workbench.css");
  assert.ok(page.includes('className="fg-field-map-analyze"'));
  assert.ok(page.includes('onClick={()=>void preview()}'));
  assert.ok(page.includes('ref={resultsRef}'));
  assert.ok(page.includes('resultsRef.current?.scrollIntoView'));
  assert.ok(page.includes('className="fg-field-db-list"'));
  assert.ok(page.includes('className="fg-field-db-save"'));
  assert.ok(css.includes('.fg-field-db-list'));
  assert.ok(css.includes('.fg-field-map-analyze'));
});

test("changed GIS TypeScript and TSX sources remain parseable",()=>{
  for(const file of ["../src/pages/PublicGis.tsx","../src/components/NationalMap.tsx","../src/lib/api.ts"]){
    const text=read(file),tsx=file.endsWith("tsx");
    const t=ts.transpileModule(text,{fileName:file,compilerOptions:{
      module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,
      jsx:tsx?ts.JsxEmit.ReactJSX:ts.JsxEmit.None,
    },reportDiagnostics:true});
    const errors=(t.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
    assert.deepEqual(errors.map(x=>ts.flattenDiagnosticMessageText(x.messageText," ")),[],file);
  }
});
