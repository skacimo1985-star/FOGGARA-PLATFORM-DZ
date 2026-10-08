import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const deckCss=readFileSync(new URL('../src/components/oasis-canva-presentation.css',import.meta.url),'utf8');
const landingCss=readFileSync(new URL('../src/pages/heritage-landing.css',import.meta.url),'utf8');

test('Canva presentation image switching is fade-only with no scale zoom',()=>{
  assert.ok(deckCss.includes('@keyframes ocpFade'));
  assert.equal(/@keyframes ocpFade[\s\S]*?scale\(/.test(deckCss),false);
});

test('landing hero image switching is fade-only with no scale zoom',()=>{
  const start=landingCss.indexOf('.fg-moon-hero-media');
  const end=landingCss.indexOf('.fg-moon-hero-overlay',start);
  const hero=landingCss.slice(start,end);
  assert.equal(hero.includes('scale('),false);
  assert.ok(landingCss.includes('@keyframes fgMoonHeroFade'));
});
