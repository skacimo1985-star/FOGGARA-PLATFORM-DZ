import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const source = readFileSync(new URL('../src/lib/pagination.ts', import.meta.url), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { collectPages } = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
test('follows server page count despite a smaller server page size', async () => {
  const requested = [];
  const result = await collectPages(async page => { requested.push(page); return { page, pages: 3, items: [page] }; });
  assert.deepEqual(result, [1, 2, 3]); assert.deepEqual(requested, [1, 2, 3]);
});
test('does not return partial results after network failure', async () => {
  await assert.rejects(collectPages(async page => { if (page === 2) throw new Error('offline'); return { page, pages: 2, items: [1] }; }), /offline/);
});
test('bounds excessive page walks and rejects malformed responses', async () => {
  await assert.rejects(collectPages(async page => ({ page, pages: 3, items: [] }), 2), /page limit/);
  await assert.rejects(collectPages(async () => ({ page: 1, pages: Infinity, items: [] })), /Invalid/);
  await assert.rejects(collectPages(async () => ({ page: 2, pages: 2, items: [] })), /Invalid/);
});
test('empty collections terminate after one request', async () => {
  let calls = 0;
  assert.deepEqual(await collectPages(async page => { calls++; return { page, pages: 1, items: [] }; }), []);
  assert.equal(calls, 1);
});
