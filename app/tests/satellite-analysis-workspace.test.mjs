import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const sentinel=readFileSync(new URL('../src/features/agriculture/ParcelSentinel.tsx',import.meta.url),'utf8');
const agriculture=readFileSync(new URL('../src/features/agriculture/Agriculture.tsx',import.meta.url),'utf8');
const i18n=readFileSync(new URL('../src/features/agriculture/i18n.ts',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/features/agriculture/agriculture.css',import.meta.url),'utf8');

for (const [name,source] of [['ParcelSentinel.tsx',sentinel],['Agriculture.tsx',agriculture]]) {
  test(`${name} remains valid TSX`,()=>{
    const result=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},reportDiagnostics:true,fileName:name});
    const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
    assert.equal(errors.length,0,errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
  });
}

test('satellite analysis is a first-class agriculture workspace',()=>{
  assert.ok(agriculture.includes("'satellite'"));
  assert.ok(agriculture.includes("satelliteAnalysis"));
  assert.ok(agriculture.includes("section==='satellite'"));
  assert.ok(i18n.includes("Analyse satellite"));
  assert.ok(i18n.includes("تحليل الأقمار الصناعية"));
});

test('Sentinel UI renders authenticated true-color and derived-index imagery',()=>{
  assert.ok(sentinel.includes('/remote-sensing/true-color.png'));
  assert.ok(sentinel.includes('/remote-sensing/preview.png'));
  assert.ok(sentinel.includes('api.getBlob'));
  assert.ok(sentinel.includes('fg-satellite-visuals'));
  assert.ok(css.includes('.fg-satellite-visuals'));
});

test('Sentinel UI exposes real raster statistics and acquisition metadata',()=>{
  for(const marker of ['statistics.mean','statistics.median','statistics.min','statistics.max','valid_fraction','cloud_cover_pct','effective_source_resolution_m'])
    assert.ok(sentinel.includes(marker),marker);
});
