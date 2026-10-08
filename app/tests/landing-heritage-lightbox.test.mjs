import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const landing=readFileSync(new URL('../src/pages/Landing.tsx',import.meta.url),'utf8');

test('Landing remains valid TSX',()=>{
  const result=ts.transpileModule(landing,{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
    reportDiagnostics:true,fileName:'Landing.tsx'
  });
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
});

test('landing keeps exactly one primary presentation experience',()=>{
  assert.ok(landing.includes('<OasisCanvaPresentation lang={lang} compact/>'));
  assert.equal(landing.includes('id="heritage"'),false);
  assert.equal(landing.includes('heritageTitle'),false);
  assert.equal(landing.includes('heritageStrong'),false);
  assert.equal(landing.includes('heritageAction'),false);
});

test('duplicate heritage presentation and its lightbox are absent',()=>{
  assert.equal(landing.includes('fg-moon-heritage'),false);
  assert.equal(landing.includes('fg-foggara-visual-demo'),false);
  assert.equal(landing.includes('fg-heritage-lightbox'),false);
  assert.equal(landing.includes('foggara-heritage-poster.webp'),false);
  assert.equal(landing.includes('href="#heritage"'),false);
});
