import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../src/pages/Presentation.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/pages/presentation.css',import.meta.url),'utf8');

test('Presentation.tsx remains valid TSX',()=>{
  const result=ts.transpileModule(source,{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
    reportDiagnostics:true,fileName:'Presentation.tsx'
  });
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
});

test('oasis presentation uses the approved visual assets',()=>{
  assert.ok(source.includes('presentationPhotos=[10,8,6,1,11]'));
  assert.ok(source.includes('fp-oasis-hero-scene'));
  assert.ok(source.includes('FROM HERITAGE TO DIGITAL TWIN'));
  assert.ok(css.includes('/images/oasis-dawn.webp'));
  assert.ok(css.includes('/images/foggara-sprite.webp'));
});
