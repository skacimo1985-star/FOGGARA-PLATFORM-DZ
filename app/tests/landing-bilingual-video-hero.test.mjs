import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const landing=readFileSync(new URL('../src/pages/Landing.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/pages/heritage-landing.css',import.meta.url),'utf8');

test('landing keeps the rejected bilingual text card removed',()=>{
  assert.equal(landing.includes('fg-hero-bilingual'),false);
  assert.equal(landing.includes('Every resource connected. Every decision grounded.'),false);
});

test('reception hero opens with the oasis image',()=>{
  const start=css.indexOf('.fg-moon-hero-media-1{');
  const end=css.indexOf('.fg-moon-hero-overlay{',start);
  const heroMedia=css.slice(start,end);
  assert.ok(heroMedia.includes('/images/oasis-hero.webp'));
  assert.ok(heroMedia.includes('/images/oasis-dawn.webp'));
  assert.equal(heroMedia.includes('foggara-sprite'),false);
  const heroStart=landing.indexOf('<section className="fg-moon-hero fg-lukas-hero"');
  const heroEnd=landing.indexOf('<nav className="fg-lukas-domain-strip"',heroStart);
  assert.ok(landing.slice(heroStart,heroEnd).includes('index===0?"/images/oasis-hero.webp"'));
});

test('hero routes visitors through the optional Expo profile entry',()=>{
  assert.ok(landing.includes('to={user?"/app":"/login"}'));
  assert.ok(landing.includes('href="#about"'));
});
