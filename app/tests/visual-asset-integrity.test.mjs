import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sourceFiles=[
  '../src/pages/Landing.tsx',
  '../src/pages/heritage-landing.css',
  '../src/components/OasisCanvaPresentation.tsx',
  '../src/components/oasis-canva-presentation.css'
];

const source=sourceFiles
  .map(file=>readFileSync(new URL(file,import.meta.url),'utf8'))
  .join('\n');

test('production visual sources never reference the corrupt legacy frame files',()=>{
  assert.equal(source.includes('foggara-video-frame-1.webp'),false);
  assert.equal(source.includes('foggara-video-frame-2.webp'),false);
});

test('critical production WebP assets have a valid RIFF/WEBP signature',()=>{
  for(const asset of ['oasis-dawn.webp','oasis-hero.webp','foggara-heritage-poster.webp','foggara-sprite.webp']){
    const bytes=readFileSync(new URL('../public/images/'+asset,import.meta.url));
    assert.equal(bytes.subarray(0,4).toString('ascii'),'RIFF',asset+' RIFF');
    assert.equal(bytes.subarray(8,12).toString('ascii'),'WEBP',asset+' WEBP');
    assert.ok(bytes.length>8_000,asset+' size');
  }
});

test('visual layout contains production-safe fallbacks and bounded hero type',()=>{
  assert.ok(source.includes('PRODUCTION_VISUAL_INTEGRITY_2026_10_09'));
  assert.ok(source.includes('PROFESSIONAL_TYPE_SCALE_2026_10_09'));
  assert.ok(source.includes('PROFESSIONAL_DECK_TYPE_SCALE_2026_10_09'));
  assert.ok(source.includes('font-size:clamp(58px,5.6vw,96px)!important'));
  assert.ok(source.includes('font-size:clamp(34px,3.8vw,58px)!important'));
  assert.ok(source.includes('white-space:nowrap'));
  assert.ok(source.includes('background:#173023 url("/images/oasis-dawn.webp")'));
  assert.ok(source.includes('dir={lang==="ar"?"rtl":"ltr"}'));
});


test('Canva original is linked; interactive presentation remains visible without an iframe',()=>{
  const landing=readFileSync(new URL('../src/pages/Landing.tsx',import.meta.url),'utf8');
  assert.equal(landing.includes('DAHXhnIEguc/view?embed'),false);
  assert.equal(landing.includes('<iframe'),false);
  assert.ok(landing.includes('<OasisCanvaPresentation lang={lang} compact/>'));
  assert.ok(landing.includes('DAHXhRSdmV4'));
  assert.equal(landing.includes('setHeroSlide'),false);
  assert.ok(source.includes('CANVA_SOURCE_HERO_2026_10_09'));
});

test('distinct service visuals and accessible closing section are included',()=>{
  const css=readFileSync(new URL('../src/pages/visual-repairs.css',import.meta.url),'utf8');
  const landing=readFileSync(new URL('../src/pages/Landing.tsx',import.meta.url),'utf8');
  const presentation=readFileSync(new URL('../src/pages/Presentation.tsx',import.meta.url),'utf8');
  assert.ok(css.includes('.fg-offer-1 .fg-moon-offer-mark'));
  assert.ok(css.includes('.fg-offer-2 .fg-moon-offer-mark'));
  assert.ok(css.includes('.fg-offer-3 .fg-moon-offer-mark'));
  assert.ok(css.includes('color: #eef9ef!important'));
  assert.ok(css.includes('padding: clamp(28px,4vw,60px)'));
  assert.ok(landing.includes('fg-canva-source-note'));
  assert.ok(presentation.includes('fp-native-deck-visible'));
  assert.equal(presentation.includes('DAHXhnIEguc'),false);
  assert.equal(presentation.includes('<iframe'),false);
});
