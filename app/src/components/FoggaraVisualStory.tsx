import {useState} from "react";
import {ChevronLeft, ChevronRight, Images} from "lucide-react";
import {getOasisPhoto} from "./oasisVisuals";
import "./foggara-visual-story.css";

type Locale = "ar" | "fr" | "en";
const heroPhotos = [
  {id:"oasis-palms-blue-sky",fallback:"/images/oasis-dawn.webp",label:{ar:"واحات الجزائر",fr:"Oasis algériennes",en:"Algerian oases"}},
  {id:"kasria-water-distribution",fallback:"/images/foggara-heritage-poster.webp",label:{ar:"القصرية وتوزيع المياه",fr:"Kasria et partage de l'eau",en:"Kasria water distribution"}},
  {id:"palm-oasis-kasria",fallback:"/images/oasis-hero.webp",label:{ar:"الفقارة بين النخيل",fr:"Foggara dans la palmeraie",en:"Foggara in the palm grove"}},
  {id:"sunset-over-oasis",fallback:"/images/oasis-dawn.webp",label:{ar:"غروب الشمس على الواحة",fr:"Coucher de soleil sur l'oasis",en:"Sunset above the oasis"}}
] as const;

const controls = {
  ar:{photo:"عرض الصورة",prev:"السابق",next:"التالي",story:"قصة فقارة التفاعلية",steps:"مراحل قصة المنصة"},
  fr:{photo:"Voir l'image",prev:"Précédent",next:"Suivant",story:"Histoire interactive de FOGGARA",steps:"Étapes de la présentation"},
  en:{photo:"View image",prev:"Previous",next:"Next",story:"FOGGARA interactive story",steps:"Presentation chapters"}
} as const;

type Chapter={id:string;eyebrow:string;title:string;body:string;details:string;photo:string;fallback:string};
const chapters:Record<Locale,Chapter[]>={
  ar:[
    {id:"heritage",eyebrow:"01 / التراث",title:"من حكمة الفقارة إلى المستقبل",body:"القصرية تعكس هندسة دقيقة لتقاسم مياه الواحات، وهي مصدر إلهام للمنصة.",details:"المورد ← البيانات ← المعرفة",photo:"kasria-water-distribution",fallback:"/images/foggara-heritage-poster.webp"},
    {id:"water",eyebrow:"02 / الماء والطاقة",title:"كل قطرة قرار قابل للقياس",body:"ربط الآبار والتدفقات والضخ والطاقة ونتائج القياس بمصادر بيانات قابلة للتحقق.",details:"المراقبة • القياس • الترشيد",photo:"traditional-kasria-outlets",fallback:"/images/oasis-hero.webp"},
    {id:"agri",eyebrow:"03 / الزراعة والمجال",title:"فهم الحقول من الأرض والفضاء",body:"القطع الزراعية والخرائط وصور Sentinel-2 والطقس والتحاليل في سياق مكاني متكامل.",details:"الخرائط • التربة • المحاصيل",photo:"oasis-palms-blue-sky",fallback:"/images/oasis-dawn.webp"},
    {id:"evidence",eyebrow:"04 / الدليل والقرار",title:"لا قرار دون مصدر واضح",body:"تمييز الرصد والتحقق والحساب والاستدلال والاقتراح مع تتبع المسؤولية ومنهجية القياس.",details:"الدليل ← التحليل ← القرار",photo:"oasis-irrigation-stream",fallback:"/images/foggara-sprite.webp"},
    {id:"nexus",eyebrow:"05 / FOGGARA-DZ",title:"الماء، الطاقة، الغذاء، البيئة والصحة",body:"منصة واحدة تربط الجهات والمشروعات والبيانات بالقرارات والمتابعة دون فقدان سلسلة الإثبات.",details:"WATER · ENERGY · FOOD · ECOSYSTEM · HEALTH",photo:"sunset-over-oasis",fallback:"/images/oasis-dawn.webp"}
  ],
  fr:[
    {id:"heritage",eyebrow:"01 / PATRIMOINE",title:"De la sagesse des foggaras à l'avenir",body:"La kasria illustre le partage maîtrisé de l'eau des oasis et inspire notre plateforme.",details:"RESSOURCE → DONNÉE → CONNAISSANCE",photo:"kasria-water-distribution",fallback:"/images/foggara-heritage-poster.webp"},
    {id:"water",eyebrow:"02 / EAU & ÉNERGIE",title:"Chaque goutte mérite une décision mesurable",body:"Relier puits, débits, pompage, énergie et mesures à des sources vérifiables.",details:"SURVEILLER · MESURER · OPTIMISER",photo:"traditional-kasria-outlets",fallback:"/images/oasis-hero.webp"},
    {id:"agri",eyebrow:"03 / AGRICULTURE & TERRITOIRE",title:"Comprendre les champs, du sol au satellite",body:"Parcelles, SIG, Sentinel-2, météo et analyses réunis dans leur contexte spatial.",details:"SIG · SOL · CULTURES",photo:"oasis-palms-blue-sky",fallback:"/images/oasis-dawn.webp"},
    {id:"evidence",eyebrow:"04 / PREUVE & DÉCISION",title:"Des décisions appuyées par des preuves",body:"Distinguer observation, vérification, calcul, inférence et proposition, avec traçabilité.",details:"PREUVE → ANALYSE → DÉCISION",photo:"oasis-irrigation-stream",fallback:"/images/foggara-sprite.webp"},
    {id:"nexus",eyebrow:"05 / FOGGARA-DZ",title:"Eau, énergie, alimentation, écosystème et santé",body:"Une plateforme reliant acteurs, projets et données aux décisions et au suivi.",details:"WATER · ENERGY · FOOD · ECOSYSTEM · HEALTH",photo:"sunset-over-oasis",fallback:"/images/oasis-dawn.webp"}
  ],
  en:[
    {id:"heritage",eyebrow:"01 / HERITAGE",title:"From ancestral water wisdom to the future",body:"The kasria represents precise oasis water sharing and inspires our platform.",details:"RESOURCE → DATA → KNOWLEDGE",photo:"kasria-water-distribution",fallback:"/images/foggara-heritage-poster.webp"},
    {id:"water",eyebrow:"02 / WATER & ENERGY",title:"Every drop deserves a measurable decision",body:"Connect wells, flows, pumping, energy and measurements to verifiable sources.",details:"MONITOR · MEASURE · OPTIMIZE",photo:"traditional-kasria-outlets",fallback:"/images/oasis-hero.webp"},
    {id:"agri",eyebrow:"03 / AGRICULTURE & LAND",title:"Understand the field, from soil to satellite",body:"Parcels, GIS, Sentinel-2 imagery, weather and analysis in spatial context.",details:"GIS · SOIL · CROPS",photo:"oasis-palms-blue-sky",fallback:"/images/oasis-dawn.webp"},
    {id:"evidence",eyebrow:"04 / EVIDENCE & DECISIONS",title:"Decisions grounded in traceable evidence",body:"Distinguish observed, verified, computed, inferred and proposed findings.",details:"EVIDENCE → ANALYSIS → DECISION",photo:"oasis-irrigation-stream",fallback:"/images/foggara-sprite.webp"},
    {id:"nexus",eyebrow:"05 / FOGGARA-DZ",title:"Water, energy, food, ecosystem and health",body:"One platform connecting actors, projects and data to decisions and monitoring.",details:"WATER · ENERGY · FOOD · ECOSYSTEM · HEALTH",photo:"sunset-over-oasis",fallback:"/images/oasis-dawn.webp"}
  ]
};

export function OasisHeroMedia({lang}:{lang:Locale}){
  const [active,setActive]=useState(0);
  const photo=heroPhotos[active];
  return <>
    <div className="fg-hero-media" aria-hidden="true">
      <img src={getOasisPhoto(photo.id)??photo.fallback} alt="" fetchPriority="high" decoding="async"/>
    </div>
    <div className="fg-hero-photo-picker" role="group" aria-label={controls[lang].photo}>
      {heroPhotos.map((item,index)=><button type="button" key={item.id}
        className={active===index?"fg-hero-photo-choice selected":"fg-hero-photo-choice"}
        onClick={()=>setActive(index)} aria-pressed={active===index}
        aria-label={controls[lang].photo+": "+item.label[lang]}>
        <img src={getOasisPhoto(item.id)??item.fallback} alt="" loading="lazy" decoding="async"/>
        <span>{item.label[lang]}</span>
      </button>)}
    </div>
  </>;
}

export function FoggaraStoryPresentation({lang}:{lang:Locale}){
  const [index,setIndex]=useState(0);
  const slides=chapters[lang];
  const slide=slides[index];
  return <div className="fg-story" lang={lang} dir={lang==="ar"?"rtl":"ltr"} role="region" aria-label={controls[lang].story}>
    <div className="fg-story-stage">
      <img key={slide.photo} className="fg-story-background" src={getOasisPhoto(slide.photo)??slide.fallback} alt="" decoding="async"/>
      <div className="fg-story-body" aria-live="polite">
        <span className="fg-story-eyebrow">{slide.eyebrow}</span>
        <h3>{slide.title}</h3>
        <p>{slide.body}</p>
        <span className="fg-story-detail" dir="auto">{slide.details}</span>
      </div>
      <div className="fg-story-counter" dir="ltr">{String(index+1).padStart(2,"0")} / {String(slides.length).padStart(2,"0")}</div>
    </div>
    <div className="fg-story-controls">
      <button type="button" onClick={()=>setIndex(x=>(x+slides.length-1)%slides.length)} aria-label={controls[lang].prev}><ChevronLeft size={19}/></button>
      <div className="fg-story-chapters" role="group" aria-label={controls[lang].steps}>
        {slides.map((item,i)=><button type="button" key={item.id} aria-current={i===index?"step":undefined} className={i===index?"active":""} onClick={()=>setIndex(i)}><span dir="ltr">0{i+1}</span><span>{item.eyebrow.replace(/^\d+\s*\/\s*/,"")}</span></button>)}
      </div>
      <button type="button" onClick={()=>setIndex(x=>(x+1)%slides.length)} aria-label={controls[lang].next}><ChevronRight size={19}/></button>
    </div>
  </div>;
}
