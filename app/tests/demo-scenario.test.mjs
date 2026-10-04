import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../src/lib/demo-scenario.ts',import.meta.url),'utf8');
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {calculateDemo,DEMO_WATER}=await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
test('irrigation units and pumping energy reconcile with independent physical calculation',()=>{
 const r=calculateDemo(1,8,.8,35,120);
 assert.equal(r.demandM3,100);
 assert.equal(r.balanceM3,20);
 assert.equal(r.blocked,false);
 assert.ok(Math.abs(r.energyKwh-14.673076923076923)<1e-10);
});
test('water constraint blocks excess while equality remains feasible',()=>{
 assert.equal(calculateDemo(1,8,.8,35,DEMO_WATER.stress[6]).blocked,true);
 assert.equal(calculateDemo(1,8,.8,35,100).blocked,false);
});
test('invalid or unbounded inputs produce no plausible result',()=>{
 for(const args of [[0,8,.8,35,120],[1,8,0,35,120],[1,8,1.1,35,120],[1,51,.8,35,120],[101,8,.8,35,120],[1,8,.8,-1,120],[1,8,.8,301,120],[NaN,8,.8,35,120],[1,8,.8,35,-1]])assert.equal(calculateDemo(...args),null);
 assert.equal(calculateDemo(1,8,.8,0,120).energyKwh,0);
});
