import test from "node:test";
import assert from "node:assert/strict";
import { polygonAreaHectares, polygonBoundingBox } from "../src/lib/geojson-area.ts";

const outer=[[0,0],[1,0],[1,1],[0,1],[0,0]];
const hole=[[0.25,0.25],[0.75,0.25],[0.75,0.75],[0.25,0.75],[0.25,0.25]];
const polygon=(coordinates)=>({type:"Polygon",coordinates});

test("WGS84 1-degree polygon has positive plausible approximate hectares",()=>{
 const area=polygonAreaHectares(polygon([outer]));
 assert.ok(area>1_230_000 && area<1_250_000);
});

test("interior hole is deducted regardless of ring winding",()=>{
 const original=polygonAreaHectares(polygon([outer]));
 const minusHole=polygonAreaHectares(polygon([outer,hole]));
 assert.ok(minusHole>0 && minusHole<original);
 assert.ok(Math.abs(minusHole-polygonAreaHectares(polygon([outer,[...hole].reverse()])))<0.001);
});

test("malformed, unclosed or out of-range coordinates fail closed",()=>{
 for(const geometry of [
   polygon([[[0,0],[1,0],[1,1],[0,1]]]),
   polygon([[[0,0],[181,0],[1,1],[0,0]]]),
   polygon([[[0,0],[NaN,0],[1,1],[0,0]]]),
   polygon([]),
 ]) {
   assert.equal(polygonAreaHectares(geometry),0);
   assert.equal(polygonBoundingBox(geometry),null);
 }
});

test("exterior bbox is returned as [west,south,east,north]",()=>{
 assert.deepEqual(polygonBoundingBox(polygon([outer,hole])),[0,0,1,1]);
});
