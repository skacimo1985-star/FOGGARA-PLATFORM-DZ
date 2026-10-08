import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const landing=readFileSync(new URL('../src/pages/Landing.tsx',import.meta.url),'utf8');
const deck=readFileSync(new URL('../src/components/OasisCanvaPresentation.tsx',import.meta.url),'utf8');

test('Landing remains syntactically valid TSX',()=>{
  const result=ts.transpileModule(landing,{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
    reportDiagnostics:true,fileName:'Landing.tsx'
  });
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
});

test('landing embeds the shared Canva oasis presentation',()=>{
  assert.ok(landing.includes('OasisCanvaPresentation'));
  assert.ok(landing.includes('<OasisCanvaPresentation lang={lang} compact/>'));
  assert.ok(deck.includes('FOGGARA-DZ · CANVA PRESENTATION'));
  assert.ok(deck.includes('SMART AGRICULTURE DEMO'));
  assert.ok(deck.includes('AGRITECH EXPO'));
});

test('Canva sequence preserves the 12-slide platform story',()=>{
  const markers=['01 · FOGGARA-DZ','02 · HERITAGE','03 · SYSTEM LOGIC','04 · OPERATING CYCLE','05 · WEFEH','06 · PLATFORM','07 · SMART AGRICULTURE','08 · ASSURANCE','09 · WORKFLOW','10 · SIREP OASES','11 · AGRITECH EXPO','12 · CLOSING'];
  for(const marker of markers) assert.ok(deck.includes(marker),marker);
});


test('Canva presentation autoplays on the landing with fade-only transitions',()=>{
  assert.ok(deck.includes('const [playing,setPlaying]=useState(true)'));
  assert.ok(deck.includes('window.setInterval(()=>setIndex'));
  assert.ok(deck.includes('6500'));
  assert.equal(deck.includes('setPlaying(false)'),false);
});


test('landing uses one global platform narrative without duplicate presentation',()=>{
  assert.ok(landing.includes('fg-lukas-hero'));
  assert.ok(landing.includes('fg-lukas-domain-strip'));
  assert.ok(landing.includes('fg-global-operating'));
  assert.ok(landing.includes('fg-global-visual-stage'));
  assert.ok(landing.includes('fg-global-services'));
  assert.ok(landing.includes('fg-global-presentation'));
  assert.ok(landing.includes('OBSERVED'));
  assert.ok(landing.includes('VERIFIED'));
  assert.ok(landing.includes('COMPUTED'));
  assert.ok(landing.includes('INFERRED'));
  assert.ok(landing.includes('PROPOSED'));
  assert.equal((landing.match(/<OasisCanvaPresentation/g)||[]).length,1);
  assert.equal(landing.includes('fg-lukas-image-rail'),false);
  assert.equal(landing.includes('fg-platform-spine'),false);
  assert.equal(landing.includes('id="heritage"'),false);
});
