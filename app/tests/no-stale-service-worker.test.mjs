import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sw=readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const main=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8');

test('public SPA documents are never cached by a service worker',()=>{
  assert.equal(sw.includes('cache.addAll('),false);
  assert.equal(sw.includes('caches.match("/"'),false);
  assert.equal(sw.includes('SHELL_CACHE'),false);
  assert.ok(sw.includes('self.skipWaiting()'));
});

test('legacy public shell cache is retired and deregistered',()=>{
  assert.ok(sw.includes('foggara-public-shell-'));
  assert.ok(sw.includes('caches.delete('));
  assert.ok(main.includes('getRegistrations()'));
  assert.ok(main.includes('reg.unregister()'));
  assert.ok(main.includes('caches.delete(key)'));
  assert.equal(main.includes('serviceWorker.register('),false);
});
