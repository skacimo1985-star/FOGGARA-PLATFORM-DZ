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
  assert.ok(deck.includes('FROM HERITAGE TO DIGITAL TWIN'));
  assert.ok(deck.includes('AGRITECH EXPO — LIVE DEMO'));
  assert.ok(deck.includes('ANCESTRAL WISDOM. MODERN DECISIONS.'));
});

test('presentation preserves the complete twelve-slide FOGGARA Nexus structure',()=>{
  const markers=[
    'FOGGARA-DZ',
    'FROM HERITAGE TO DIGITAL TWIN',
    'HOW THE FOGGARA WORKS',
    'THE FOGGARA-DZ OPERATING CYCLE',
    'WEFEH NEXUS',
    'FOGGARA-DZ PLATFORM',
    'SMART AGRICULTURE DEMO',
    'EVIDENCE BEFORE DECISION',
    'FROM NEED TO ACTION',
    'SIREP OASES — SERVICES & ECOSYSTEM',
    'AGRITECH EXPO — LIVE DEMO',
    'ANCESTRAL WISDOM. MODERN DECISIONS.'
  ];
  for(const marker of markers) assert.ok(deck.includes(marker),marker);
  assert.ok(deck.includes('13 / 14 / 15 OCTOBER 2026'));
  assert.ok(deck.includes('SHERATON ANNABA'));
  assert.ok(deck.includes('/expo-qr.svg'));
  assert.ok(deck.includes('String(slides.length).padStart(2,"0")'));
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
