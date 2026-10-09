import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
const page=readFileSync(new URL("../src/pages/FarmLanding.tsx",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/pages/farm-landing.css",import.meta.url),"utf8");

test("public homepage uses isolated farm landing instead of legacy Moon template",()=>{
  assert.ok(app.includes('import("@/pages/FarmLanding")'));
  assert.ok(page.includes('className="fml-page"'));
  assert.equal(page.includes("fg-moon-landing"),false);
  assert.equal(page.includes("iframe"),false);
});
test("hero and content use three distinct verified local image assets",()=>{
  const used=[
    'oasis-dawn.webp',
    'foggara-heritage-poster.webp',
    'foggara-sprite.webp'
  ];
  for(const asset of used){
    assert.ok((page+css).includes(asset),asset);
    const b=readFileSync(new URL("../public/images/"+asset,import.meta.url));
    assert.equal(b.subarray(0,4).toString("ascii"),"RIFF",asset);
    assert.equal(b.subarray(8,12).toString("ascii"),"WEBP",asset);
  }
  assert.ok(css.includes("fml-service-1"));
  assert.ok(css.includes("fml-service-2"));
  assert.ok(css.includes("fml-service-3"));
  assert.equal(css.includes("!important"),false);
});
test("RTL, responsive bounds and direct working platform links",()=>{
  assert.ok(page.includes('dir={locale==="ar"?"rtl":"ltr"}'));
  assert.ok(css.includes("@media(max-width:450px)"));
  assert.ok(css.includes("font-size:clamp(52px,6.4vw,92px)"));
  assert.ok(css.includes("overflow-x:clip"));
  for(const route of ["/expo","/presentation","/app/gis","/app/agriculture","/app/studio","/agriculture-services"]){
    assert.ok(page.includes(route),route);
  }
  assert.ok(page.includes('api.get<{counts:Counts}>("/expo/demo-data")'));
});
