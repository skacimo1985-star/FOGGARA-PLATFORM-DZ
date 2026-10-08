import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const landing=readFileSync(new URL('../src/pages/Landing.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/pages/heritage-landing.css',import.meta.url),'utf8');

test('landing keeps the rejected bilingual text card removed',()=>{
  assert.equal(landing.includes('fg-hero-bilingual'),false);
  assert.equal(landing.includes('Every resource connected. Every decision grounded.'),false);
});

test('reception hero is rebuilt around the oasis and SIREP OASES identity',()=>{
  assert.ok(css.includes('.fg-rebuilt-hero .fg-moon-hero-media-1{background-image:url("/images/user-oasis-hero.webp")'));
  assert.ok(css.includes('.fg-rebuilt-hero .fg-moon-hero-media-2{background-image:url("/images/foggara-video-frame-1.webp")'));
  assert.ok(css.includes('.fg-rebuilt-hero .fg-moon-hero-media-3{background-image:url("/images/oasis-dawn.webp")'));
  const heroStart=landing.indexOf('<section className="fg-moon-hero fg-lukas-hero fg-rebuilt-hero"');
  const heroEnd=landing.indexOf('<nav className="fg-lukas-domain-strip"',heroStart);
  const hero=landing.slice(heroStart,heroEnd);
  assert.ok(hero.includes('SIREP OASES'));
  assert.ok(hero.includes('FOGGARA-DZ'));
  assert.ok(hero.includes('NEXUS WEFEH'));
  assert.ok(hero.includes('index===0?"/images/user-oasis-hero.webp"'));
  assert.ok(hero.includes('index===1?"/images/foggara-video-frame-1.webp"'));
});

test('hero routes visitors through the optional Expo profile entry',()=>{
  assert.ok(landing.includes('to={user?"/app":"/login"}'));
  assert.ok(landing.includes('href="#about"'));
});
