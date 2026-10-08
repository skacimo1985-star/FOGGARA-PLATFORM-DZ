import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const landing=readFileSync(new URL('../src/pages/Landing.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/pages/heritage-landing.css',import.meta.url),'utf8');

test('Landing remains valid TSX',()=>{
  const result=ts.transpileModule(landing,{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
    reportDiagnostics:true,fileName:'Landing.tsx'
  });
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
});

test('heritage poster opens in an in-page accessible lightbox',()=>{
  assert.ok(landing.includes('fg-heritage-poster-trigger'));
  assert.ok(landing.includes('foggara-heritage-poster.webp'));
  assert.ok(landing.includes('role="dialog"'));
  assert.ok(landing.includes('aria-modal="true"'));
  assert.ok(landing.includes('event.key==="Escape"'));
  assert.ok(css.includes('.fg-heritage-lightbox'));
  assert.ok(css.includes('cursor:zoom-in'));
});

test('documentary demo images use the same viewer behavior',()=>{
  assert.ok(landing.includes('fg-heritage-thumb-trigger'));
  assert.ok(landing.includes('kind:"sprite"'));
  assert.ok(css.includes('.fg-heritage-lightbox-sprite'));
});
