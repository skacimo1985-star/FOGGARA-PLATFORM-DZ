import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const landing=readFileSync(new URL('../src/pages/Landing.tsx',import.meta.url),'utf8');
const css=readFileSync(new URL('../src/pages/heritage-landing.css',import.meta.url),'utf8');

test('institutional landing keeps a four-image visual story',()=>{
  for(const asset of [
    '/images/user-heritage-digital-twin.webp',
    '/images/user-oases-nexus-wefeh.webp',
    '/images/foggara-video-frame-2.webp',
    '/images/user-oasis-hero.webp',
    '/images/foggara-video-frame-1.webp'
  ]){
    assert.ok(landing.includes(asset),asset);
  }
  assert.ok(landing.includes('fg-global-visual-heritage'));
  assert.ok(landing.includes('fg-global-visual-evidence'));
  assert.ok(landing.includes('fg-agriculture-template-story'));
});

test('company capabilities remain visible in all supported languages',()=>{
  assert.ok(landing.includes('INGÉNIERIE'));
  assert.ok(landing.includes('DIGITAL SERVICES'));
  assert.ok(landing.includes('الخدمات الرقمية'));
  assert.ok(landing.includes('fg-global-capabilities'));
});

test('expo QR remains outside the hero composition',()=>{
  const heroStart=landing.indexOf('<section className="fg-moon-hero fg-lukas-hero"');
  const heroEnd=landing.indexOf('<nav className="fg-lukas-domain-strip"',heroStart);
  const hero=landing.slice(heroStart,heroEnd);
  assert.equal(hero.includes('expo-qr.svg'),false);
});

test('expo QR stays compact and demo routes remain actionable',()=>{
  assert.ok(landing.includes('width="64" height="64"'));
  assert.ok(landing.includes('to={user?"/app":"/login"}'));
  assert.ok(css.includes('grid-template-columns:64px 1fr'));
  assert.ok(css.includes('.fg-global-demo{grid-template-columns:1fr}'));
  assert.ok(css.includes('.fg-global-demo-modules'));
  for(const route of ['/login','/expo','/agriculture-services','/presentation']){
    assert.ok(landing.includes(route),route);
  }
});
