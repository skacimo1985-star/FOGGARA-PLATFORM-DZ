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

test('landing embeds the preferred Figma presentation composition',()=>{
  assert.ok(landing.includes('className="fg-figma-embed"'));
  assert.ok(landing.includes('fg-figma-embed-frame'));
  assert.ok(landing.includes('fg-figma-embed-thumbs'));
  assert.ok(landing.includes('heritageLabel:"HERITAGE FLOW"'));
  assert.ok(landing.includes('digitalLabel:"DIGITAL FLOW"'));
  assert.ok(css.includes('EMBEDDED FIGMA PRESENTATION'));
});

test('embedded Figma presentation keeps five synchronized stages',()=>{
  for(const marker of ['SOURCE / MOTHER GALLERY','KASRIA / WATER SHARING','SEGUIAS / DISTRIBUTION','PARCEL / AGRICULTURAL USE','EVIDENCE / MONITORING'])
    assert.ok(landing.includes(marker),marker);
  assert.ok(landing.includes('String(presentationSlide+1).padStart(2,"0")'));
  assert.ok(landing.includes('setPresentationSlide(index)'));
});

test('presentation stages link to real platform routes',()=>{
  for(const route of ['/presentation','/app/nexus','/app/gis','/app/agriculture','/app/review'])
    assert.ok(landing.includes(`to:"${route}"`)||landing.includes(`to:'${route}'`),route);
});
