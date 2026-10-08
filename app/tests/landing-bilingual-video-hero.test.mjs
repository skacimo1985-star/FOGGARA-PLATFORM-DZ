import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const landing=readFileSync(new URL('../src/pages/Landing.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/pages/heritage-landing.css',import.meta.url),'utf8');

test('landing keeps the rejected bilingual text card removed',()=>{
  assert.equal(landing.includes('fg-hero-bilingual'),false);
  assert.equal(landing.includes('Every resource connected. Every decision grounded.'),false);
});

test('video-derived oasis frames remain available for visual storytelling',()=>{
  assert.ok(css.includes('/images/foggara-video-frame-1.webp'));
  assert.ok(css.includes('/images/foggara-video-frame-2.webp'));
});

test('hero remains connected to real routes',()=>{
  assert.ok(landing.includes('to={user?"/app":"/expo"}'));
  assert.ok(landing.includes('href="#about"'));
});
