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
  assert.ok(deck.includes('RENCONTRONS-NOUS AU STAND B02'));
});

test('presentation preserves all eight supplied slides in source order',()=>{
  const markers=['DÉFINIR LE TERRAIN','OBSERVER PAR SATELLITE','COMPRENDRE EAU, SOL ET CULTURES','PREUVE AVANT DÉCISION','DE L’ANALYSE À L’ARBITRAGE','IA SOUVERAINE ET SERVICES','UN ÉCOSYSTÈME NATIONAL','RENCONTRONS-NOUS AU STAND B02'];
  let previous=-1;
  for(const marker of markers){const index=deck.indexOf(marker);assert.ok(index>previous,marker);previous=index;}
  assert.equal((deck.match(/\{to:/g)||[]).length,8);
  for(let i=1;i<=8;i++){
    const bytes=readFileSync(new URL('../public/images/source-deck/slide-'+i+'.webp',import.meta.url));
    assert.equal(bytes.subarray(0,4).toString(),'RIFF');
    assert.equal(bytes.subarray(8,12).toString(),'WEBP');
  }
});

test('source slides support manual accessible navigation without autoplay',()=>{
  assert.ok(deck.includes('aria-current={index===i?"step":undefined}'));
  assert.ok(deck.includes('aria-live="polite"'));
  assert.ok(deck.includes('onClick={()=>move(-1)}'));
  assert.ok(deck.includes('onClick={()=>move(1)}'));
  assert.equal(deck.includes('setInterval'),false);
});

test('landing uses one presentation experience without duplicate heritage lightbox',()=>{
  assert.ok(landing.includes('fg-lukas-hero'));
  assert.ok(landing.includes('fg-global-presentation'));
  assert.equal((landing.match(/<OasisCanvaPresentation/g)||[]).length,1);
  assert.equal(landing.includes('id="heritage"'),false);
});
