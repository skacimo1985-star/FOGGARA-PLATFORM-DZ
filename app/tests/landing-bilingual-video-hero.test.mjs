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
  assert.ok(css.includes('.fg-rebuilt-hero .fg-moon-hero-media-1{background-image:url("/images/oasis-dawn.webp")'));
  assert.ok(css.includes('.fg-rebuilt-hero .fg-moon-hero-media-2{background-image:url("/images/oasis-hero.webp")'));
  assert.ok(css.includes('.fg-rebuilt-hero .fg-moon-hero-media-3{background-image:url("/images/oasis-dawn.webp")'));
  assert.match(css,/\.fg-moon-hero-media\s*\{[^}]*z-index\s*:\s*0\s*;/s);
  assert.match(css,/\.fg-moon-hero-overlay\s*\{[^}]*z-index\s*:\s*1\s*;/s);
  assert.doesNotMatch(css,/\.fg-moon-hero-media\s*\{[^}]*z-index\s*:\s*-3\s*;/s);
  const heroStart=landing.indexOf('<section className="fg-moon-hero fg-lukas-hero fg-rebuilt-hero"');
  const heroEnd=landing.indexOf('<nav className="fg-lukas-domain-strip"',heroStart);
  const hero=landing.slice(heroStart,heroEnd);
  assert.ok(hero.includes('SIREP OASES'));
  assert.ok(hero.includes('FOGGARA-DZ'));
  assert.ok(hero.includes('NEXUS WEFEH'));
  assert.ok(hero.includes('fg-moon-hero-media-1'));
  assert.equal(hero.includes('fg-lukas-thumbs'),false);
  assert.equal(hero.includes('fg-moon-arrow'),false);
  assert.match(css,/\.fg-moon-landing \.fg-rebuilt-hero \.fg-moon-hero-media-1\s*\{[^}]*oasis-dawn\.webp/s);
  assert.match(css,/\.fg-rebuilt-foggara\s*\{[^}]*white-space\s*:\s*nowrap\s*;/s);
});

test('hero routes visitors through the optional Expo profile entry',()=>{
  assert.ok(landing.includes('to={user?"/app":"/login"}'));
  assert.ok(landing.includes('href="#about"'));
});
