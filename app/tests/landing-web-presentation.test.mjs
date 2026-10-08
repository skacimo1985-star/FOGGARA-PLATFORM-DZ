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

test('landing embeds the supplied Oases Nexus WEFEH presentation',()=>{
  assert.ok(landing.includes('OasisCanvaPresentation'));
  assert.ok(landing.includes('<OasisCanvaPresentation lang={lang} compact/>'));
  assert.ok(landing.includes('OASES NEXUS WEFEH / FOGGARA-DZ'));
  assert.ok(deck.includes('DÉFINIR LE TERRAIN'));
  assert.ok(deck.includes('DÉMO FOGGARA-DZ'));
});

test('presentation preserves the eight-page structure of the supplied design',()=>{
  const markers=[
    'DÉFINIR LE TERRAIN',
    'OBSERVER PAR SATELLITE',
    'COMPRENDRE EAU, SOL ET CULTURES',
    'PREUVE AVANT DÉCISION',
    'DE L’ANALYSE À L’ARBITRAGE',
    'IA SOUVERAINE ET SERVICES',
    'UN ÉCOSYSTÈME NATIONAL',
    'DÉMO FOGGARA-DZ'
  ];
  for(const marker of markers) assert.ok(deck.includes(marker),marker);
  assert.ok(deck.includes('13/14/15 OCTOBRE 2026'));
  assert.ok(deck.includes('RENCONTRONS-NOUS AU STAND B02'));
});

test('supplied design presentation autoplays with user controls',()=>{
  assert.ok(deck.includes('const [playing,setPlaying]=useState(true)'));
  assert.ok(deck.includes('window.setInterval(()=>setIndex'));
  assert.ok(deck.includes('6500'));
  assert.ok(deck.includes('slides.length'));
});

test('landing uses one presentation experience without duplicate heritage lightbox',()=>{
  assert.ok(landing.includes('fg-lukas-hero'));
  assert.ok(landing.includes('fg-global-presentation'));
  assert.equal((landing.match(/<OasisCanvaPresentation/g)||[]).length,1);
  assert.equal(landing.includes('id="heritage"'),false);
});
