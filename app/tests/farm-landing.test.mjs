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
    assert.ok(page.includes(asset)||read("../src/components/OasisPhotoGallery.tsx").includes(asset),asset);
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
  assert.ok(page.includes('<OasisPhotoGallery lang={lang}/>'));
  assert.ok(page.includes('OasisCanvaPresentation lang={lang} compact siteSevenSlides'));
  assert.ok(page.includes("DAHXhRSdmV4"));
  const deck=read("../src/components/OasisCanvaPresentation.tsx");
  assert.ok(deck.includes("[0,2,4,5,6,9,11]"));
  assert.ok(deck.includes("siteSevenSlides"));
  assert.ok(!page.includes("<iframe"));
  assert.ok(css.includes("max-width:560px"));
  assert.ok(css.includes("fg-hero-qr-code img{width:116px"));
});

test("seven-slide presentation avoids cut-off closing titles and random service tiles",()=>{
  const deckCss=read("../src/components/oasis-canva-presentation.css");
  const deck=read("../src/components/OasisCanvaPresentation.tsx");
  assert.ok(deckCss.includes("Screenshot regression 2026-10-09"));
  assert.match(deckCss,/\.ocp \.ocp-page-closing\{[^}]*display:flex;/);
  assert.match(deckCss,/\.ocp \.ocp-page-closing \.ocp-closing-copy\{[^}]*position:relative;/);
  assert.match(deckCss,/\.ocp \.ocp-page-closing \.ocp-closing-copy h3\{[^}]*font-size:clamp\(28px,4\.2cqw,54px\)!important;/);
  assert.match(deckCss,/\.ocp \.ocp-page-services \.ocp-services-cloud\{[^}]*display:grid;/);
  assert.match(deckCss,/\.ocp \.ocp-page-services \.ocp-services-cloud span\{[^}]*position:static;/);
  assert.ok(deckCss.includes("grid-template-columns:repeat(2,minmax(0,1fr))"));
  assert.ok(deck.includes("SIREP OASES · SERVICES"));
  assert.ok(deck.includes("FOGGARA-DZ · NEXUS WEFEH"));
});

test("restored gallery uses a bounded three-image layout with neutral poster background",()=>{
  assert.match(css,/\.os-public-shell \.fg-landing > section\.fg-restored-gallery/);
  assert.match(css,/\.fg-landing \.fg-restored-gallery h2\{/);
  assert.ok(css.includes("width:min(1180px,calc(100% - 48px))"));
  assert.ok(css.includes("object-fit:contain;"));
  assert.ok(css.includes("background:#e9e5d8"));
  assert.ok(css.includes("width:min(100%,1080px)"));
  assert.ok(css.includes("height:600px"));
});

test("curated gallery auto-discovers only real binary photos and keeps old fallback",()=>{
  const manifest=read("../src/components/oasisVisuals.ts");
  const gallery=read("../src/components/OasisPhotoGallery.tsx");
  const deck=read("../src/components/OasisCanvaPresentation.tsx");
  const galleryCss=read("../src/components/oasis-photo-gallery.css");
  assert.ok(manifest.includes('import.meta.glob("../assets/oasis-gallery/*.webp"'));
  assert.equal((manifest.match(/\{id:"/g)||[]).length,13);
  assert.ok(gallery.includes("availableOasisPhotos.length ? availableOasisPhotos : fallback"));
  assert.ok(gallery.includes('aria-pressed={filter===option}'));
  assert.ok(gallery.includes("loading=\"lazy\""));
  assert.ok(gallery.includes("AI-generated or AI-edited illustrations"));
  assert.ok(deck.includes('getOasisPhoto("sunset-over-oasis")'));
  assert.ok(deck.includes('getOasisPhoto("kasria-water-distribution")'));
  assert.ok(deck.includes('getOasisPhoto("oasis-palm-reflection")'));
  assert.ok(galleryCss.includes("grid-template-columns:repeat(3,minmax(0,1fr))"));
});
