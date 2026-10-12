import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const source=readFileSync(new URL("../src/lib/gis-request-scope.ts",import.meta.url),"utf8");
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const exports={};new Function("exports",js)(exports);

test("late satellite responses cannot replace results after a field, scene or date change",async()=>{
  const scope=exports.createGisRequestScope();
  let releaseOld;
  const oldResponse=new Promise(resolve=>{releaseOld=resolve;});
  const oldLease=scope.capture();
  const shown=[];
  const pending=oldResponse.then(value=>{if(oldLease())shown.push(value);});
  scope.invalidate();
  const current=scope.capture();
  if(current())shown.push("current field");
  releaseOld("old field");await pending;
  assert.deepEqual(shown,["current field"]);
  assert.equal(oldLease(),false);assert.equal(current(),true);
});

test("logging out invalidates a workspace lease without affecting another workspace",()=>{
  const first=exports.createGisRequestScope(),second=exports.createGisRequestScope();
  const beforeLogout=first.capture(),other=second.capture();
  first.invalidate();
  assert.equal(beforeLogout(),false);assert.equal(other(),true);
});
