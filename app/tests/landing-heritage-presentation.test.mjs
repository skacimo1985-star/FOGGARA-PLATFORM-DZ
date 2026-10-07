import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const landing=readFileSync(new URL('../src/pages/Landing.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/pages/heritage-landing.css',import.meta.url),'utf8');

test('Landing.tsx remains syntactically valid TSX',()=>{
  const result=ts.transpileModule(landing,{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
    reportDiagnostics:true,
    fileName:'Landing.tsx'
  });
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
});

test('oasis remains the only rotating hero visual',()=>{
  assert.ok(css.includes('.fg-moon-hero-media-1,'));
  assert.ok(css.includes('.fg-moon-hero-media-2,'));
  assert.ok(css.includes('.fg-moon-hero-media-3{'));
  assert.ok(css.includes('background-image:url("/images/oasis-dawn.webp")'));
  const heroBlock=css.slice(css.indexOf('.fg-moon-hero-media-1'),css.indexOf('.fg-moon-hero-overlay'));
  assert.equal(heroBlock.includes('foggara-sprite.webp'),false);
});

test('heritage presentation keeps five explainable interactive states',()=>{
  for(const marker of [
    'SOURCE / MOTHER GALLERY',
    'KASRIA / WATER SHARING',
    'SEGUIAS / DELIVERY',
    'PARCEL / AGRICULTURAL USE',
    'EVIDENCE / FIELD MEMORY'
  ]) assert.ok(landing.includes(marker),marker);
  for(const marker of ['heritageSlide','heritagePlaying','heritageFullscreen','Previous heritage slide','Next heritage slide'])
    assert.ok(landing.includes(marker),marker);
  assert.ok(css.includes('.fg-heritage-progress'));
  assert.ok(css.includes('.fg-heritage-presentation.is-fullscreen'));
});

test('national identity and evidence chain remain visible',()=>{
  assert.ok(landing.includes('ALGERIAN NATIONAL INTEGRATED PLATFORM'));
  assert.ok(landing.includes('DATA → EVIDENCE → DECISION → MONITORING'));
  assert.ok(landing.includes('SIREP OASES NEXUS WEFEH-DZ'));
});


test('dedicated presentation page uses the same national visual language',()=>{
  const presentation=readFileSync(new URL('../src/pages/Presentation.tsx',import.meta.url),'utf8');
  const presentationCss=readFileSync(new URL('../src/pages/presentation.css',import.meta.url),'utf8');
  const result=ts.transpileModule(presentation,{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
    reportDiagnostics:true,
    fileName:'Presentation.tsx'
  });
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
  assert.ok(presentation.includes('ALGERIAN NATIONAL INTEGRATED PLATFORM'));
  assert.ok(presentation.includes('presentationPhotos=[10,8,6,1,11]'));
  assert.ok(presentationCss.includes('/images/oasis-dawn.webp'));
  assert.ok(presentationCss.includes('/images/foggara-sprite.webp'));
  assert.ok(presentationCss.includes('FOGGARA-DZ NATIONAL PRESENTATION THEME'));
});
