/**
 * Reconstruct static HTML/CSS previews from Webflow Designer snapshots.
 * Run: node design/webflow/build-static.mjs
 * This is a best-effort static reconstruction, not an official Webflow code export.
 * Source is kept unchanged in design/webflow/source.
 */
import fs from "node:fs";
import path from "node:path";

const base = path.dirname(new URL(import.meta.url).pathname);
const src = path.join(base, "source");
const dist = path.join(base, "static-preview");
fs.mkdirSync(dist, { recursive: true });
const data = JSON.parse(fs.readFileSync(path.join(src, "styles.json"), "utf8"));
const esc = (s) => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const styles = (data.styles ?? []).map(s=>{
  const props = s.properties?.base?.properties ?? {};
  if (!Object.keys(props).length || !s.selector) return "";
  const css = Object.entries(props).filter(([k,v])=>typeof v==="string" && !v.includes("@img_") && !v.includes("@var_")).map(([k,v])=>`${k}:${v};`).join("");
  return css ? `${s.selector}{${css}}` : "";
}).filter(Boolean).join("\n");
fs.writeFileSync(path.join(dist,"webflow-base.css"),styles);

const tagMap = {Body:"main",Block:"div",Heading:"h2",Paragraph:"p",TextBlock:"div",Text:"span",String:null,Link:"a",LinkBlock:"a",Button:"button",Image:"img",List:"ul",ListItem:"li",Section:"section",Container:"div",HtmlEmbed:"div",FormForm:"form",FormTextInput:"input",FormTextarea:"textarea",FormButton:"button",Nav:"nav",ComponentInstance:"div"};
const voidTags = new Set(["img","input","hr","br"]);
function render(n){
 if(n.type==="String")return esc(n.text);
 const tag=n.tag || tagMap[n.type] || "div";
 const attrs={...(n.attributes||{})};
 if(n.classes?.length)attrs.class=n.classes.join(" ");
 if(n.type==="ComponentInstance")attrs["data-webflow-component"]="component-not-exported";
 if(tag==="a"&&!attrs.href)attrs.href="#";
 const attr=Object.entries(attrs).filter(([k,v])=>/^(class|id|href|src|alt|dir|lang|role|title|tabindex|aria-[a-z-]+|data-[a-z-]+)$/.test(k)&&typeof v==="string"&&!/^(javascript:|data:)/i.test(v)).map(([k,v])=>` ${k}="${esc(v)}"`).join("");
 if(voidTags.has(tag))return `<${tag}${attr}>`;
 return `<${tag}${attr}>${(n.children||[]).map(render).join("")}</${tag}>`;
}
for(const locale of ["ar","fr","en","legal-ar","legal-fr","legal-en"]){
 const f=path.join(src,`foggara-${locale}.json`);
 const snapshot=JSON.parse(fs.readFileSync(f,"utf8"));
 const lang=locale.endsWith("ar")?"ar":locale.endsWith("fr")?"fr":"en";
 const dir=lang==="ar"?"rtl":"ltr";
 const html=`<!doctype html><html lang="${lang}" dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FOGGARA-DZ ${locale}</title><link rel="stylesheet" href="./webflow-base.css"></head><body>${render(snapshot.tree)}</body></html>`;
 fs.writeFileSync(path.join(dist,`foggara-${locale}.html`),html);
}
console.log("Generated 6 static previews. Check missing images, components and interactions before using in production.");
