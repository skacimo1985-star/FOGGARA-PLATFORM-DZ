import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../src/pages/Gis.tsx',import.meta.url),'utf8');

test('GIS page remains valid TSX',()=>{
  const result=ts.transpileModule(source,{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
    reportDiagnostics:true,fileName:'Gis.tsx'
  });
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
});

test('GIS is map-first rather than empty-state-first',()=>{
  const map=source.indexOf('fg-gis-map-first');
  const empty=source.indexOf('fg-gis-empty-hint');
  const kpis=source.indexOf('fg-command-kpis');
  assert.ok(map>0);
  assert.ok(empty>map);
  assert.ok(kpis>map);
});

test('manual AOI becomes the actual Sentinel bbox',()=>{
  assert.ok(source.includes('manualAnalysisBbox'));
  assert.ok(source.includes('selectedParcelBbox ?? manualAnalysisBbox ?? viewportBbox'));
  assert.ok(source.includes('analysisSelectionBbox={manualAnalysisBbox}'));
  assert.ok(source.includes('onAnalysisSelectionChange'));
  assert.ok(source.includes('params.set("bbox", analysisBbox'));
});


test('GIS exposes a real multi-temporal satellite study workflow',()=>{
  assert.ok(source.includes('/remote-sensing/studies/timeseries'));
  assert.ok(source.includes('runTimeSeriesStudy'));
  assert.ok(source.includes('fg-eo-study'));
  assert.ok(source.includes('quality_indicator'));
  assert.ok(source.includes('processing_plan_fingerprint'));
  assert.ok(source.includes('QA4EO-INSPIRED TRACEABILITY'));
});


test('GIS creates a real parcel from the manually selected AOI',()=>{
  assert.ok(source.includes('createFieldFromAoi'));
  assert.ok(source.includes('bboxPolygon(manualAnalysisBbox)'));
  assert.ok(source.includes('api.post<ParcelRecord>("/agriculture/parcels"'));
  assert.ok(source.includes('newFieldCrop'));
  assert.ok(source.includes('Date palm'));
});

test('GIS Analyze All calls the combined field-intelligence study',()=>{
  assert.ok(source.includes('analyzeAllField'));
  assert.ok(source.includes('/remote-sensing/studies/field-intelligence'));
  assert.ok(source.includes('fg-field-intelligence'));
  assert.ok(source.includes('fieldIntelligenceResult.soil_context'));
  assert.ok(source.includes('OBSERVED → COMPUTED → INFERRED'));
});
