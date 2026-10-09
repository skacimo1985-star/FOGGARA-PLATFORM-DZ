import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=readFileSync(new URL('../src/pages/Presentation.tsx',import.meta.url),'utf8');
const deck=readFileSync(new URL('../src/components/OasisCanvaPresentation.tsx',import.meta.url),'utf8');
const deckCss=readFileSync(new URL('../src/components/oasis-canva-presentation.css',import.meta.url),'utf8');

test('Presentation.tsx remains valid TSX',()=>{
  const result=ts.transpileModule(source,{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX},
    reportDiagnostics:true,fileName:'Presentation.tsx'
  });
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')).join('\n'));
});

test('presentation uses the shared supplied Oases Nexus deck',()=>{
  assert.ok(source.includes('OasisCanvaPresentation'));
  assert.ok(source.includes('<OasisCanvaPresentation lang={locale}/>'));
  assert.ok(deck.includes('FROM HERITAGE TO DIGITAL TWIN'));
  assert.ok(deck.includes('EVIDENCE BEFORE DECISION'));
  assert.ok(deck.includes('AGRITECH EXPO — LIVE DEMO'));
  assert.ok(deck.includes('ANCESTRAL WISDOM. MODERN DECISIONS.'));
});

test('deck mirrors the supplied visual language and uses existing platform media',()=>{
  assert.ok(deckCss.includes('--paper:#f1e8d5'));
  assert.ok(deckCss.includes('--ink:#171a17'));
  assert.ok(deckCss.includes('--forest:#1f5b43'));
  assert.ok(deckCss.includes('--clay:#b65a37'));
  assert.ok(deckCss.includes('/images/oasis-dawn.webp'));
  assert.ok(deckCss.includes('/images/oasis-hero.webp'));
  assert.ok(deckCss.includes('/images/user-oasis-hero.webp'));
  assert.equal(deckCss.includes('/images/foggara-video-frame-1.webp'),false);
  assert.equal(deckCss.includes('/images/foggara-video-frame-2.webp'),false);
  assert.ok(deckCss.includes('grid-template-columns:repeat(12'));
  assert.ok(deck.includes('className="ocp-media-image"'));
  assert.equal(deck.includes('src="/images/user-oasis-hero.webp"'),false);
  assert.ok(deck.includes('src="/images/oasis-dawn.webp"'));
  assert.ok(deckCss.includes('.ocp-media-image'));
});

test('decision matrix remains available below the presentation',()=>{
  assert.ok(source.includes('id="matrix"'));
  assert.ok(source.includes('evaluatePresentationMatrix'));
  assert.ok(source.includes('foggara-user-matrix.json'));
});
