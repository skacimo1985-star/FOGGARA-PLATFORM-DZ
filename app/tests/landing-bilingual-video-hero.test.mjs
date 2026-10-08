import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const landing=readFileSync(new URL('../src/pages/Landing.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/pages/heritage-landing.css',import.meta.url),'utf8');

test('landing keeps the rejected bilingual text card removed',()=>{
  assert.equal(landing.includes('fg-hero-bilingual'),false);
  assert.equal(landing.includes('Every resource connected. Every decision grounded.'),false);
});

test('reception hero switches between clear oasis images only',()=>{
  const start=css.indexOf('.fg-moon-hero-media-1{');
  const end=css.indexOf('.fg-moon-hero-overlay{',start);
  const heroMedia=css.slice(start,end);
  assert.ok(heroMedia.includes('/images/oasis-dawn.webp'));
  assert.ok(heroMedia.includes('/images/oasis-hero.webp'));
  assert.equal(heroMedia.includes('foggara-video-frame'),false);
  assert.equal(heroMedia.includes('foggara-sprite'),false);
});

test('hero routes visitors through the optional Expo profile entry',()=>{
  assert.ok(landing.includes('to={user?"/app":"/login"}'));
  assert.ok(landing.includes('href="#about"'));
});
