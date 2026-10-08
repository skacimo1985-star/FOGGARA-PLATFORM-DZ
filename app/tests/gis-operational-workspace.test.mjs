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
