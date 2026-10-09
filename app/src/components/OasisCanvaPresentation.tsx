import { useEffect, useState } from "react";
import { Link } from "react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./oasis-canva-presentation.css";

export type OasisCanvaLocale = "ar" | "fr" | "en";

const slides = [
  {to:"/app/gis",ar:"تحديد المجال",fr:"DÉFINIR LE TERRAIN",en:"DEFINE THE FIELD"},
  {to:"/app/agriculture",ar:"الرصد بالأقمار الصناعية",fr:"OBSERVER PAR SATELLITE",en:"OBSERVE BY SATELLITE"},
  {to:"/agriculture-services",ar:"فهم المياه والتربة والمحاصيل",fr:"COMPRENDRE EAU, SOL ET CULTURES",en:"UNDERSTAND WATER, SOIL AND CROPS"},
  {to:"/app/projects",ar:"الدليل قبل القرار",fr:"PREUVE AVANT DÉCISION",en:"EVIDENCE BEFORE DECISION"},
  {to:"/app/nexus",ar:"من التحليل إلى المفاضلة",fr:"DE L’ANALYSE À L’ARBITRAGE",en:"FROM ANALYSIS TO DECISION"},
  {to:"/app/agriculture",ar:"الذكاء الاصطناعي السيادي والخدمات",fr:"IA SOUVERAINE ET SERVICES",en:"SOVEREIGN AI AND SERVICES"},
  {to:"/app/org",ar:"منظومة وطنية",fr:"UN ÉCOSYSTÈME NATIONAL",en:"A NATIONAL ECOSYSTEM"},
  {to:"/expo",ar:"نلتقي في الجناح B02",fr:"RENCONTRONS-NOUS AU STAND B02",en:"MEET US AT STAND B02"},
] as const;

const controls = {
  ar:{prev:"الشريحة السابقة",next:"الشريحة التالية",open:"استكشف القسم",nav:"اختر شريحة",source:"العرض الأصلي للمؤسسة · 8 شرائح · تم تصحيح الغطاء البرتقالي في الشريحة الثانية"},
  fr:{prev:"Diapositive précédente",next:"Diapositive suivante",open:"Explorer la rubrique",nav:"Choisir une diapositive",source:"Présentation originale · 8 diapositives · Masque orange de la diapositive 2 corrigé"},
  en:{prev:"Previous slide",next:"Next slide",open:"Explore this section",nav:"Choose a slide",source:"Original company presentation · 8 slides · Orange overlay on slide 2 corrected"},
};

export function OasisCanvaPresentation({lang="fr",compact=false}:{lang?:OasisCanvaLocale;compact?:boolean}) {
  const [index,setIndex] = useState(0);
  const current = slides[index];
  const copy = controls[lang];
  useEffect(()=>{
    const next = new Image();
    next.src = `/images/source-deck/slide-${(index+1)%slides.length+1}.webp`;
  },[index]);
  const move = (delta:number)=>setIndex(value=>(value+delta+slides.length)%slides.length);
  return <section className={`ocp ocp-source ${compact?"ocp-compact":""}`} lang={lang} dir={lang==="ar"?"rtl":"ltr"} aria-label="FOGGARA-DZ">
    <figure className="ocp-source-frame">
      <img className="ocp-source-image" src={`/images/source-deck/slide-${index+1}.webp`} alt={current[lang]} width="1536" height="864" loading="lazy"/>
      <figcaption className="ocp-source-caption">
        <div aria-live="polite"><span>{index+1} / {slides.length}</span><h3>{current[lang]}</h3></div>
        <Link to={current.to}>{copy.open} <span aria-hidden="true">↗</span></Link>
      </figcaption>
    </figure>
    <div className="ocp-source-controls">
      <button type="button" aria-label={copy.prev} onClick={()=>move(-1)}><ChevronLeft/></button>
      <nav aria-label={copy.nav}>{slides.map((slide,i)=><button type="button" key={slide.en} aria-label={slide[lang]} aria-current={index===i?"step":undefined} onClick={()=>setIndex(i)}>{i+1}</button>)}</nav>
      <button type="button" aria-label={copy.next} onClick={()=>move(1)}><ChevronRight/></button>
    </div>
    <p className="ocp-source-note">{copy.source}</p>
  </section>;
}
