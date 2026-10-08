import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const landing=readFileSync(new URL('../src/pages/Landing.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/pages/heritage-landing.css',import.meta.url),'utf8');

test('bilingual video hero keeps approved FOGGARA definition and quote',()=>{
  assert.ok(landing.includes('FOGGARA-DZ is an Algerian integrated decision and evidence platform'));
  assert.ok(landing.includes('FOGGARA-DZ منصة جزائرية متكاملة للقرار والأدلة'));
  assert.ok(landing.includes('Every resource connected. Every decision grounded.'));
  assert.ok(landing.includes('كل مورد مترابط، وكل قرار يستند إلى دليل.'));
});

test('hero switches between frames extracted from the supplied oasis video',()=>{
  assert.ok(css.includes('/images/foggara-video-frame-1.webp'));
  assert.ok(css.includes('/images/foggara-video-frame-2.webp'));
  assert.ok(landing.includes('fg-video-story-strip'));
  assert.ok(landing.includes('SOURCE'));
  assert.ok(landing.includes('KASRIA'));
  assert.ok(landing.includes('FLOW'));
});

test('hero remains connected to existing routes instead of fake CTAs',()=>{
  assert.ok(landing.includes('to={user?"/app":"/expo"}'));
  assert.ok(landing.includes('href="#about"'));
});
