import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
const app=read("../src/App.tsx");
const page=read("../src/pages/OasisRestoredLanding.tsx");
const css=read("../src/pages/oasis-original-landing.css");
const base=read("../src/pages/landing.css");

test("homepage restores the historical full-width oasis visual without the Moon template",()=>{
  assert.ok(app.includes('import("@/pages/OasisRestoredLanding")'));
  assert.ok(page.includes('className="fg-public fg-landing"'));
  assert.ok(page.includes('className="fg-landing-hero"'));
  assert.ok(page.includes('className="fg-oasis-image"'));
  assert.ok(page.includes('oasis-dawn-mobile.webp'));
  assert.ok(css.includes("min-height:720px"));
  assert.ok(css.includes("full-bleed")||css.includes("Full-bleed"));
  assert.equal(page.includes("fg-moon-landing"),false);
  assert.equal(css.includes("!important"),false);
  assert.ok(base.includes("fg-oasis-image"));
});

test("historical oasis and three additional illustrations exist as actual WEBP files",()=>{
  for(const asset of ["oasis-dawn.webp","oasis-dawn-mobile.webp","oasis-hero.webp","foggara-heritage-poster.webp","foggara-sprite.webp"]){
    assert.ok(page.includes(asset),asset);
    const b=readFileSync(new URL("../public/images/"+asset,import.meta.url));
    assert.equal(b.subarray(0,4).toString("ascii"),"RIFF",asset);
    assert.equal(b.subarray(8,12).toString("ascii"),"WEBP",asset);
  }
});

test("farm template services link to real routes while public Expo stays accessible",()=>{
  for(const route of ["/expo","/app/gis","/app/agriculture","/agriculture-services","/presentation"]){
    assert.ok(page.includes(route),route);
  }
  assert.ok(page.includes('id="farm-services"'));
  assert.ok(page.includes('id="oasis-gallery"'));
  assert.ok(page.includes('OasisCanvaPresentation lang={lang} compact'));
  assert.ok(page.includes("DAHXhRSdmV4"));
  assert.ok(!page.includes("<iframe"));
  assert.ok(css.includes("max-width:560px"));
  assert.ok(css.includes("fg-hero-qr-code img{width:116px"));
});
