import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const landing=readFileSync(new URL('../src/pages/Landing.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/pages/heritage-landing.css',import.meta.url),'utf8');

test('Landing remains syntactically valid TSX',()=>{
  const result=ts.transpileModule(landing,{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
    reportDiagnostics:true,fileName:'Landing.tsx'
  });
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
});

test('hero no longer contains the rejected bilingual text card',()=>{
  assert.equal(landing.includes('fg-hero-bilingual'),false);
  assert.equal(landing.includes('Every resource connected. Every decision grounded.'),false);
});

test('Canva and Figma deck is translated into a native six-stage product presentation',()=>{
  assert.ok(landing.includes('id="presentation"'));
  assert.ok(landing.includes('FOGGARA-DZ / PLATFORM PRESENTATION'));
  assert.ok(landing.includes('FROM HERITAGE TO DIGITAL TWIN'));
  assert.ok(landing.includes('WATER · ENERGY · FOOD · ECOSYSTEM · HEALTH'));
  assert.ok(landing.includes('OBSERVED → VERIFIED → COMPUTED → INFERRED → PROPOSED'));
  assert.ok(landing.includes('presentationSlide'));
  assert.ok(css.includes('.fg-web-presentation-shell'));
  assert.ok(css.includes('.fg-web-presentation-tabs'));
});

test('presentation links to real operational routes',()=>{
  for(const route of ['/presentation','/app/studio','/app/nexus','/app','/app/agriculture','/app/review'])
    assert.ok(landing.includes(`to:"${route}"`)||landing.includes(`to:'${route}'`),route);
});
