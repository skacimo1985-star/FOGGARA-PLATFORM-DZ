import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../src/lib/api.ts',import.meta.url),'utf8');

test('EO studies receive a bounded long-running timeout',()=>{
  assert.ok(source.includes('path.startsWith("/remote-sensing/studies/")'));
  assert.ok(source.includes('? 120_000'));
});
