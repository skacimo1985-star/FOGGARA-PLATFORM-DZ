import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import "./oasis-canva-presentation.css";

export type OasisCanvaLocale = "ar" | "fr" | "en";

type Slide = {
  title:string;
  body?:string;
  kind:"terrain"|"satellite"|"water-soil"|"evidence"|"decision"|"ai"|"ecosystem"|"expo";
};

const slides:Slide[]=[
  {
    kind:"terrain",
    title:"DÉFINIR LE TERRAIN",
    body:"Dessiner ou sélectionner une zone d’intérêt. Le système calcule immédiatement coordonnées, surface, périmètre et contexte spatial."
  },
  {
    kind:"satellite",
    title:"OBSERVER PAR SATELLITE",
    body:"Sentinel-2 L2A révèle les dynamiques de végétation, d’humidité et de stress sur l’AOI sélectionnée."
  },
  {
    kind:"water-soil",
    title:"COMPRENDRE EAU, SOL ET CULTURES",
    body:"Les modules croisent mesures terrain, télédétection et modèles. Ils qualifient un état — jamais une certitude absolue."
  },
  {
    kind:"evidence",
    title:"PREUVE AVANT DÉCISION",
    body:"Chaque résultat porte son origine, sa date, sa méthode, son niveau de confiance et ses limites d’usage."
  },
  {
    kind:"decision",
    title:"DE L’ANALYSE À L’ARBITRAGE",
    body:"FOGGARA ne remplace pas la décision. Il rend les compromis lisibles, comparables et traçables."
  },
  {
    kind:"ai",
    title:"IA SOUVERAINE ET SERVICES",
    body:"Une IA locale d’assistance, documentée et contrôlable — au service des analystes, pas à la place de l’expertise."
  },
  {
    kind:"ecosystem",
    title:"UN ÉCOSYSTÈME NATIONAL",
    body:"Des acteurs reliés par les projets, les territoires, les preuves et les ressources — dans un cadre commun."
  },
  {
    kind:"expo",
    title:"DÉMO FOGGARA-DZ",
    body:"Venez tester la chaîne complète : du terrain à la preuve, de la preuve à l’arbitrage."
  }
];

const controlCopy={
  ar:{prev:"الصفحة السابقة",next:"الصفحة التالية",play:"تشغيل العرض",pause:"إيقاف العرض"},
  fr:{prev:"Page précédente",next:"Page suivante",play:"Lire le design",pause:"Mettre en pause"},
  en:{prev:"Previous page",next:"Next page",play:"Play design",pause:"Pause design"}
} as const;

function TerrainSlide({slide}:{slide:Slide}){
  return <div className="ocp-page ocp-page-dark ocp-page-terrain">
    <div className="ocp-copy">
      <h3>{slide.title}</h3>
      <p>{slide.body}</p>
      <div className="ocp-mini-block"><strong>AOI / PARCELLE</strong><span>Coordonnées · Surface · Périmètre</span><span>Occupation du sol · Voisinage · Bassin</span></div>
      <div className="ocp-expo-mark"><b>4<sup>ème</sup> édition</b><strong>13/14/15 OCTOBRE 2026</strong><span>SHERATON ANNABA</span></div>
    </div>
    <div className="ocp-visual ocp-visual-terrain"><div className="ocp-aoi-outline"/></div>
  </div>;
}

function SatelliteSlide({slide}:{slide:Slide}){
  return <div className="ocp-page ocp-page-paper ocp-page-satellite">
    <div className="ocp-copy">
      <h3>{slide.title}</h3>
      <p>{slide.body}</p>
      <div className="ocp-mini-block"><strong>SÉRIE TEMPORELLE</strong><span>Comparer les dates</span><span>Détecter les ruptures</span><span>Documenter l’incertitude</span></div>
    </div>
    <div className="ocp-satellite-board">
      <div className="ocp-sat-main"/>
      <div className="ocp-sat-stack"><i/><i/><i/><i/></div>
    </div>
  </div>;
}

function WaterSoilSlide({slide}:{slide:Slide}){
  return <div className="ocp-page ocp-page-dark ocp-page-water">
    <div className="ocp-water-image"/>
    <div className="ocp-copy">
      <h3>{slide.title}</h3>
      <p>{slide.body}</p>
      <div className="ocp-metric ocp-metric-green"><strong>EAU</strong><span>Disponibilité · qualité · pression</span></div>
      <div className="ocp-metric ocp-metric-clay"><strong>SOL</strong><span>Texture · salinité · humidité</span></div>
      <div className="ocp-metric ocp-metric-sand"><strong>CULTURES</strong><span>Vigueur · stress · phénologie</span></div>
    </div>
  </div>;
}

function EvidenceSlide({slide}:{slide:Slide}){
  const cards=[
    ["01","OBSERVÉ","Donnée brute, source et horodatage"],
    ["02","DÉRIVÉ","Indice ou calcul reproductible"],
    ["03","MODÉLISÉ","Hypothèses et incertitude explicites"],
    ["04","VALIDÉ POUR USAGE","Revue humaine et périmètre de décision"]
  ];
  return <div className="ocp-page ocp-page-paper ocp-page-evidence">
    <div className="ocp-copy"><h3>{slide.title}</h3><p>{slide.body}</p></div>
    <div className="ocp-evidence-grid">
      {cards.map(([n,t,b],i)=><article key={t} className={`ocp-evidence-card ocp-evidence-${i+1}`}><b>{n}</b><strong>{t}</strong><span>{b}</span></article>)}
    </div>
  </div>;
}

function DecisionSlide({slide}:{slide:Slide}){
  const cols=[
    ["CONTRAINTES",["Eau disponible","Énergie","Sol · santé"]],
    ["SCÉNARIOS",["Allocation","Cultures","Horizon temporel"]],
    ["DÉCISION",["Impact WEFEH","Risque","Justification"]]
  ] as const;
  return <div className="ocp-page ocp-page-dark ocp-page-decision">
    <div className="ocp-copy"><h3>{slide.title}</h3><p>{slide.body}</p></div>
    <div className="ocp-decision-row">{cols.map(([title,items],index)=><article key={title}><strong>{title}</strong>{items.map(item=><span key={item}>{item}</span>)}{index<2&&<i/>}</article>)}</div>
  </div>;
}

function AiSlide({slide}:{slide:Slide}){
  return <div className="ocp-page ocp-page-paper ocp-page-ai">
    <div className="ocp-copy"><h3>{slide.title}</h3><p>{slide.body}</p></div>
    <div className="ocp-ai-stack">
      <span>INTERFACES MÉTIER</span>
      <span>SERVICES GÉOSPATIAUX · MODÈLES WEFEH</span>
      <span>IA LOCALE · RAG DOCUMENTAIRE</span>
      <span>DONNÉES SOUVERAINES</span>
    </div>
  </div>;
}

function EcosystemSlide({slide}:{slide:Slide}){
  return <div className="ocp-page ocp-page-dark ocp-page-ecosystem">
    <div className="ocp-copy"><h3>{slide.title}</h3><p>{slide.body}</p></div>
    <div className="ocp-network">
      <strong>FOGGARA-DZ<br/>BIEN COMMUN</strong>
      <span className="n1">INSTITUTIONS</span><span className="n2">TERRITOIRES</span><span className="n3">RECHERCHE</span><span className="n4">AGRICULTEURS</span><span className="n5">ENTREPRISES</span>
      <i className="l1"/><i className="l2"/><i className="l3"/><i className="l4"/><i className="l5"/>
    </div>
  </div>;
}

function ExpoSlide({slide}:{slide:Slide}){
  return <div className="ocp-page ocp-page-dark ocp-page-expo">
    <div className="ocp-copy">
      <div className="ocp-expo-badge">AGRI<br/>TECH<br/><b>EXPO</b></div>
      <h3>{slide.title}</h3>
      <p>{slide.body}</p>
      <strong className="ocp-company">EURL SIREP OASES NEXUS WEFEH_DZ</strong>
      <span className="ocp-stand">RENCONTRONS-NOUS AU STAND B02</span>
      <small>DÉMONSTRATIONS · PILOTES · PARTENARIATS</small>
    </div>
    <div className="ocp-expo-image"/>
  </div>;
}

function SlideView({slide}:{slide:Slide}){
  if(slide.kind==="terrain")return <TerrainSlide slide={slide}/>;
  if(slide.kind==="satellite")return <SatelliteSlide slide={slide}/>;
  if(slide.kind==="water-soil")return <WaterSoilSlide slide={slide}/>;
  if(slide.kind==="evidence")return <EvidenceSlide slide={slide}/>;
  if(slide.kind==="decision")return <DecisionSlide slide={slide}/>;
  if(slide.kind==="ai")return <AiSlide slide={slide}/>;
  if(slide.kind==="ecosystem")return <EcosystemSlide slide={slide}/>;
  return <ExpoSlide slide={slide}/>;
}

export function OasisCanvaPresentation({lang,compact=false}:{lang:OasisCanvaLocale;compact?:boolean}){
  const [index,setIndex]=useState(0);
  const [playing,setPlaying]=useState(true);
  const controls=controlCopy[lang];

  useEffect(()=>{
    if(!playing||window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)return;
    const timer=window.setInterval(()=>setIndex(value=>(value+1)%slides.length),6500);
    return()=>window.clearInterval(timer);
  },[playing]);

  const progress=useMemo(()=>((index+1)/slides.length)*100,[index]);

  return <section className={`ocp ocp-source-design ${compact?"ocp-compact":""}`} aria-label="Oases Nexus WEFEH">
    <div className="ocp-stage">
      <div key={index} className="ocp-slide-shell"><SlideView slide={slides[index]}/></div>
      <div className="ocp-source-mark"><span>OASES NEXUS WEFEH</span><b dir="ltr">{String(index+1).padStart(2,"0")} / 08</b></div>
    </div>

    <div className="ocp-footer-controls">
      <button type="button" aria-label={controls.prev} onClick={()=>setIndex(value=>(value+slides.length-1)%slides.length)}><ChevronLeft size={18}/></button>
      <div className="ocp-page-tabs" aria-label="Oases Nexus WEFEH pages">
        {slides.map((slide,i)=><button key={slide.title} type="button" className={i===index?"active":""} aria-label={slide.title} aria-current={i===index?"true":undefined} onClick={()=>setIndex(i)}><span>{String(i+1).padStart(2,"0")}</span></button>)}
      </div>
      <button type="button" className="ocp-play" aria-label={playing?controls.pause:controls.play} onClick={()=>setPlaying(value=>!value)}>{playing?<Pause size={16}/>:<Play size={16}/>}</button>
      <button type="button" aria-label={controls.next} onClick={()=>setIndex(value=>(value+1)%slides.length)}><ChevronRight size={18}/></button>
    </div>
    <div className="ocp-progress" aria-hidden="true"><i style={{width:`${progress}%`}}/></div>
  </section>;
}
