import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import "./oasis-canva-presentation.css";

export type OasisCanvaLocale = "ar" | "fr" | "en";

type SlideKind =
  | "cover"
  | "heritage"
  | "foggara"
  | "cycle"
  | "nexus"
  | "platform"
  | "smart"
  | "evidence"
  | "action"
  | "services"
  | "expo"
  | "closing";

type Slide = {
  kind: SlideKind;
  title: string;
  body: string;
};

const slideCopy: Record<OasisCanvaLocale, Slide[]> = {
  en: [
    {kind:"cover",title:"FOGGARA-DZ",body:"FROM FIELD TO EVIDENCE TO DECISION"},
    {kind:"heritage",title:"FROM HERITAGE TO DIGITAL TWIN",body:"The ancestral logic of the foggara becomes a traceable digital model linking water, territory, measurements, evidence and action."},
    {kind:"foggara",title:"HOW THE FOGGARA WORKS",body:"SOURCE · CAPTURE · GALLERY · OUTLET · KASRIA · GARDENS"},
    {kind:"cycle",title:"THE FOGGARA-DZ OPERATING CYCLE",body:"OBSERVE · VERIFY · COMPUTE · INTERPRET · PROPOSE · ACT · LEARN"},
    {kind:"nexus",title:"WEFEH NEXUS",body:"WATER · ENERGY · FOOD · ECOSYSTEM · HEALTH"},
    {kind:"platform",title:"FOGGARA-DZ PLATFORM",body:"Evidence registry, spatial intelligence, nexus analysis and a decision workspace inside one operational environment."},
    {kind:"smart",title:"SMART AGRICULTURE DEMO",body:"Parcel intelligence, Sentinel-2, soil and water evidence, crop health, weather and irrigation guidance."},
    {kind:"evidence",title:"EVIDENCE BEFORE DECISION",body:"OBSERVED · VERIFIED · COMPUTED · INFERRED · PROPOSED"},
    {kind:"action",title:"FROM NEED TO ACTION",body:"ACTOR → NEED → DATA → ANALYSIS → EVIDENCE → DECISION → ACTION → MONITORING"},
    {kind:"services",title:"SIREP OASES — SERVICES & ECOSYSTEM",body:"Engineering, digital services, energy, agriculture, measurement, calibration, inspection and resource intelligence."},
    {kind:"expo",title:"AGRITECH EXPO — LIVE DEMO",body:"Explore the operational chain live and continue on your phone through the compact Expo QR."},
    {kind:"closing",title:"ANCESTRAL WISDOM. MODERN DECISIONS.",body:"FOGGARA-DZ · SIREP OASES NEXUS WEFEH-DZ"}
  ],
  fr: [
    {kind:"cover",title:"FOGGARA-DZ",body:"DU TERRAIN À LA PREUVE, DE LA PREUVE À LA DÉCISION"},
    {kind:"heritage",title:"DU PATRIMOINE AU JUMEAU NUMÉRIQUE",body:"La logique ancestrale de la foggara devient un modèle numérique traçable reliant eau, territoire, mesures, preuves et action."},
    {kind:"foggara",title:"COMMENT FONCTIONNE LA FOGGARA",body:"SOURCE · CAPTAGE · GALERIE · SORTIE · KASRIA · JARDINS"},
    {kind:"cycle",title:"LE CYCLE OPÉRATIONNEL FOGGARA-DZ",body:"OBSERVER · VÉRIFIER · CALCULER · INTERPRÉTER · PROPOSER · AGIR · APPRENDRE"},
    {kind:"nexus",title:"NEXUS WEFEH",body:"EAU · ÉNERGIE · ALIMENTATION · ÉCOSYSTÈME · SANTÉ"},
    {kind:"platform",title:"PLATEFORME FOGGARA-DZ",body:"Registre de preuves, intelligence spatiale, analyse nexus et espace de décision dans un même environnement opérationnel."},
    {kind:"smart",title:"DÉMO AGRICULTURE INTELLIGENTE",body:"Parcelles, Sentinel-2, preuves sol et eau, santé des cultures, météo et conseil d’irrigation."},
    {kind:"evidence",title:"LA PREUVE AVANT LA DÉCISION",body:"OBSERVÉ · VÉRIFIÉ · CALCULÉ · INFÉRÉ · PROPOSÉ"},
    {kind:"action",title:"DU BESOIN À L’ACTION",body:"ACTEUR → BESOIN → DONNÉES → ANALYSE → PREUVE → DÉCISION → ACTION → SUIVI"},
    {kind:"services",title:"SIREP OASES — SERVICES & ÉCOSYSTÈME",body:"Ingénierie, services numériques, énergie, agriculture, mesure, étalonnage, inspection et intelligence des ressources."},
    {kind:"expo",title:"AGRITECH EXPO — DÉMO LIVE",body:"Explorez la chaîne opérationnelle en direct et poursuivez sur mobile via le QR Expo compact."},
    {kind:"closing",title:"SAGESSE ANCESTRALE. DÉCISIONS MODERNES.",body:"FOGGARA-DZ · SIREP OASES NEXUS WEFEH-DZ"}
  ],
  ar: [
    {kind:"cover",title:"FOGGARA-DZ",body:"من الميدان إلى الدليل، ومن الدليل إلى القرار"},
    {kind:"heritage",title:"من التراث إلى التوأم الرقمي",body:"تتحول حكمة الفقارة إلى نموذج رقمي قابل للتتبع يربط الماء والمجال والقياسات والأدلة والتنفيذ."},
    {kind:"foggara",title:"كيف تعمل الفقارة",body:"المصدر · الالتقاط · النفق · المخرج · القصرية · البساتين"},
    {kind:"cycle",title:"دورة FOGGARA-DZ التشغيلية",body:"رصد · تحقق · حساب · تفسير · اقتراح · تنفيذ · تعلم"},
    {kind:"nexus",title:"NEXUS WEFEH",body:"المياه · الطاقة · الغذاء · النظام البيئي · الصحة"},
    {kind:"platform",title:"منصة FOGGARA-DZ",body:"سجل الأدلة والذكاء المكاني وتحليل الترابط ومساحة القرار داخل بيئة تشغيلية واحدة."},
    {kind:"smart",title:"ديمو الزراعة الذكية",body:"القطع وSentinel-2 وأدلة التربة والمياه وصحة المحاصيل والطقس وتوجيه الري."},
    {kind:"evidence",title:"الدليل قبل القرار",body:"OBSERVED · VERIFIED · COMPUTED · INFERRED · PROPOSED"},
    {kind:"action",title:"من الحاجة إلى الفعل",body:"فاعل → حاجة → بيانات → تحليل → دليل → قرار → تنفيذ → متابعة"},
    {kind:"services",title:"SIREP OASES — الخدمات والمنظومة",body:"الهندسة والخدمات الرقمية والطاقة والزراعة والقياس والمعايرة والتفتيش وذكاء الموارد."},
    {kind:"expo",title:"AGRITECH EXPO — ديمو حي",body:"استكشف السلسلة التشغيلية مباشرة وتابع من الهاتف عبر QR صغير خاص بالمعرض."},
    {kind:"closing",title:"حكمة موروثة. قرارات حديثة.",body:"FOGGARA-DZ · SIREP OASES NEXUS WEFEH-DZ"}
  ]
};

const controlCopy={
  ar:{prev:"الشريحة السابقة",next:"الشريحة التالية",play:"تشغيل العرض",pause:"إيقاف العرض"},
  fr:{prev:"Diapositive précédente",next:"Diapositive suivante",play:"Lire le design",pause:"Mettre en pause"},
  en:{prev:"Previous slide",next:"Next slide",play:"Play design",pause:"Pause design"}
} as const;

function CoverSlide({slide}:{slide:Slide}){
  return <div className="ocp-page ocp-page-cover">
    <div className="ocp-cover-shade"/>
    <div className="ocp-cover-copy">
      <span className="ocp-kicker" dir="ltr">SIREP OASES NEXUS WEFEH-DZ</span>
      <h3>{slide.title}</h3>
      <p>{slide.body}</p>
      <div className="ocp-cover-domains" dir="ltr"><span>WATER</span><span>ENERGY</span><span>FOOD</span><span>ECOSYSTEM</span><span>HEALTH</span></div>
    </div>
  </div>;
}

function HeritageSlide({slide}:{slide:Slide}){
  return <div className="ocp-page ocp-page-dark ocp-page-heritage">
    <div className="ocp-copy"><span className="ocp-kicker">02 / HERITAGE → DIGITAL TWIN</span><h3>{slide.title}</h3><p>{slide.body}</p></div>
    <div className="ocp-heritage-image"/>
    <div className="ocp-heritage-pipeline" dir="ltr"><span>FOGGARA</span><b>→</b><span>FIELD DATA</span><b>→</b><span>DIGITAL TWIN</span><b>→</b><span>EVIDENCE</span></div>
  </div>;
}

function FoggaraSlide({slide}:{slide:Slide}){
  const parts=["SOURCE","CAPTURE","GALLERY","OUTLET","KASRIA","GARDENS"];
  return <div className="ocp-page ocp-page-paper ocp-page-foggara">
    <div className="ocp-copy"><span className="ocp-kicker">03 / WATER HERITAGE</span><h3>{slide.title}</h3><p>{slide.body}</p></div>
    <div className="ocp-foggara-flow" dir="ltr">{parts.map((part,i)=><div key={part}><span>{String(i+1).padStart(2,"0")}</span><strong>{part}</strong>{i<parts.length-1&&<i>→</i>}</div>)}</div>
  </div>;
}

function CycleSlide({slide}:{slide:Slide}){
  const steps=["OBSERVE","VERIFY","COMPUTE","INTERPRET","PROPOSE","ACT","LEARN"];
  return <div className="ocp-page ocp-page-dark ocp-page-cycle">
    <div className="ocp-copy"><span className="ocp-kicker">04 / OPERATING CYCLE</span><h3>{slide.title}</h3><p>{slide.body}</p></div>
    <div className="ocp-cycle" dir="ltr"><strong>FOGGARA-DZ</strong>{steps.map((step,i)=><span key={step} className={"s"+(i+1)}>{step}</span>)}</div>
  </div>;
}

function NexusSlide({slide}:{slide:Slide}){
  const domains=["WATER","ENERGY","FOOD","ECOSYSTEM","HEALTH"];
  return <div className="ocp-page ocp-page-paper ocp-page-nexus">
    <div className="ocp-copy"><span className="ocp-kicker">05 / WEFEH</span><h3>{slide.title}</h3><p>{slide.body}</p></div>
    <div className="ocp-nexus" dir="ltr"><strong>KASRIA<br/>NEXUS</strong>{domains.map((domain,i)=><span key={domain} className={"n"+(i+1)}>{domain}</span>)}</div>
  </div>;
}

function PlatformSlide({slide}:{slide:Slide}){
  const blocks=[["01","EVIDENCE REGISTRY"],["02","SPATIAL INTELLIGENCE"],["03","NEXUS ANALYSIS"],["04","DECISION WORKSPACE"]];
  return <div className="ocp-page ocp-page-dark ocp-page-platform">
    <div className="ocp-copy"><span className="ocp-kicker">06 / PLATFORM</span><h3>{slide.title}</h3><p>{slide.body}</p></div>
    <div className="ocp-platform-grid" dir="ltr">{blocks.map(([n,label])=><article key={label}><b>{n}</b><strong>{label}</strong></article>)}</div>
  </div>;
}

function SmartSlide({slide}:{slide:Slide}){
  const cards=[["SATELLITE","Sentinel-2 · NDVI · EVI · SAVI"],["SOIL & WATER","pH · EC · salinity · evidence"],["CROP","health · stress · stage"],["WEATHER & IRRIGATION","15-day forecast · ET₀ · advisory"]];
  return <div className="ocp-page ocp-page-paper ocp-page-smart">
    <div className="ocp-copy"><span className="ocp-kicker">07 / SMART AGRICULTURE</span><h3>{slide.title}</h3><p>{slide.body}</p></div>
    <div className="ocp-smart-grid">{cards.map(([title,body],i)=><article key={title} className={"c"+(i+1)}><strong>{title}</strong><span>{body}</span></article>)}</div>
  </div>;
}

function EvidenceSlide({slide}:{slide:Slide}){
  const cards=[
    ["01","OBSERVED","Raw field or source observation"],
    ["02","VERIFIED","Reviewed and accepted evidence"],
    ["03","COMPUTED","Reproducible calculated result"],
    ["04","INFERRED","Model-based interpretation"],
    ["05","PROPOSED","Recommendation awaiting decision"]
  ];
  return <div className="ocp-page ocp-page-dark ocp-page-evidence-full">
    <div className="ocp-copy"><span className="ocp-kicker">08 / EVIDENCE</span><h3>{slide.title}</h3><p>{slide.body}</p></div>
    <div className="ocp-evidence-five" dir="ltr">{cards.map(([n,t,b])=><article key={t}><b>{n}</b><strong>{t}</strong><span>{b}</span></article>)}</div>
  </div>;
}

function ActionSlide({slide}:{slide:Slide}){
  const steps=["ACTOR","NEED","DATA","ANALYSIS","EVIDENCE","DECISION","ACTION","MONITORING"];
  return <div className="ocp-page ocp-page-paper ocp-page-action">
    <div className="ocp-copy"><span className="ocp-kicker">09 / NEED → ACTION</span><h3>{slide.title}</h3><p>{slide.body}</p></div>
    <div className="ocp-action-flow" dir="ltr">{steps.map((step,i)=><div key={step}><span>{String(i+1).padStart(2,"0")}</span><strong>{step}</strong></div>)}</div>
  </div>;
}

function ServicesSlide({slide}:{slide:Slide}){
  const services=["ENGINEERING","DIGITAL SERVICES","ENERGY","AGRICULTURE","MEASUREMENT","CALIBRATION","INSPECTION"];
  return <div className="ocp-page ocp-page-dark ocp-page-services">
    <div className="ocp-copy"><span className="ocp-kicker">10 / SIREP OASES</span><h3>{slide.title}</h3><p>{slide.body}</p></div>
    <div className="ocp-services-cloud" dir="ltr">{services.map((service,i)=><span key={service} className={"s"+(i+1)}>{service}</span>)}</div>
  </div>;
}

function ExpoSlide({slide}:{slide:Slide}){
  return <div className="ocp-page ocp-page-expo-full">
    <div className="ocp-expo-full-image"/>
    <div className="ocp-expo-full-shade"/>
    <div className="ocp-copy">
      <span className="ocp-kicker" dir="ltr">11 / AGRITECH EXPO ANNABA 2026</span>
      <h3>{slide.title}</h3>
      <p>{slide.body}</p>
      <div className="ocp-expo-date" dir="ltr"><strong>13 / 14 / 15 OCTOBER 2026</strong><span>SHERATON ANNABA</span></div>
    </div>
    <div className="ocp-expo-qr-small"><img src="/expo-qr.svg" alt="FOGGARA Expo QR"/><span>LIVE DEMO</span></div>
  </div>;
}

function ClosingSlide({slide}:{slide:Slide}){
  return <div className="ocp-page ocp-page-closing">
    <div className="ocp-closing-shade"/>
    <div className="ocp-closing-copy"><span className="ocp-kicker">12 / FOGGARA-DZ</span><h3>{slide.title}</h3><p>{slide.body}</p></div>
  </div>;
}

function SlideView({slide}:{slide:Slide}){
  if(slide.kind==="cover")return <CoverSlide slide={slide}/>;
  if(slide.kind==="heritage")return <HeritageSlide slide={slide}/>;
  if(slide.kind==="foggara")return <FoggaraSlide slide={slide}/>;
  if(slide.kind==="cycle")return <CycleSlide slide={slide}/>;
  if(slide.kind==="nexus")return <NexusSlide slide={slide}/>;
  if(slide.kind==="platform")return <PlatformSlide slide={slide}/>;
  if(slide.kind==="smart")return <SmartSlide slide={slide}/>;
  if(slide.kind==="evidence")return <EvidenceSlide slide={slide}/>;
  if(slide.kind==="action")return <ActionSlide slide={slide}/>;
  if(slide.kind==="services")return <ServicesSlide slide={slide}/>;
  if(slide.kind==="expo")return <ExpoSlide slide={slide}/>;
  return <ClosingSlide slide={slide}/>;
}

export function OasisCanvaPresentation({lang,compact=false}:{lang:OasisCanvaLocale;compact?:boolean}){
  const [index,setIndex]=useState(0);
  const [playing,setPlaying]=useState(true);
  const controls=controlCopy[lang];
  const slides=slideCopy[lang];

  useEffect(()=>{
    setIndex(0);
  },[lang]);

  useEffect(()=>{
    if(!playing||window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)return;
    const timer=window.setInterval(()=>setIndex(value=>(value+1)%slides.length),6500);
    return()=>window.clearInterval(timer);
  },[playing,slides.length]);

  const progress=useMemo(()=>((index+1)/slides.length)*100,[index,slides.length]);

  return <section className={`ocp ocp-source-design ${compact?"ocp-compact":""}`} aria-label="FOGGARA-DZ Nexus">
    <div className="ocp-stage">
      <div key={`${lang}-${index}`} className="ocp-slide-shell"><SlideView slide={slides[index]}/></div>
      <div className="ocp-source-mark"><span>FOGGARA-DZ NEXUS</span><b dir="ltr">{String(index+1).padStart(2,"0")} / {String(slides.length).padStart(2,"0")}</b></div>
    </div>

    <div className="ocp-footer-controls">
      <button type="button" aria-label={controls.prev} onClick={()=>setIndex(value=>(value+slides.length-1)%slides.length)}><ChevronLeft size={18}/></button>
      <div className="ocp-page-tabs" aria-label="FOGGARA-DZ Nexus slides">
        {slides.map((slide,i)=><button key={`${slide.kind}-${i}`} type="button" className={i===index?"active":""} aria-label={slide.title} aria-current={i===index?"true":undefined} onClick={()=>setIndex(i)}><span>{String(i+1).padStart(2,"0")}</span></button>)}
      </div>
      <button type="button" className="ocp-play" aria-label={playing?controls.pause:controls.play} onClick={()=>setPlaying(value=>!value)}>{playing?<Pause size={16}/>:<Play size={16}/>}</button>
      <button type="button" aria-label={controls.next} onClick={()=>setIndex(value=>(value+1)%slides.length)}><ChevronRight size={18}/></button>
    </div>
    <div className="ocp-progress" aria-hidden="true"><i style={{width:`${progress}%`}}/></div>
  </section>;
}
