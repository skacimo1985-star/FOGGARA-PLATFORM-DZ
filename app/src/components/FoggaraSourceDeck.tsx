import {useState} from "react";
import {Link} from "react-router";
import {ChevronLeft, ChevronRight, ExternalLink, Images} from "lucide-react";
import {getOasisPhoto, oasisVisuals} from "./oasisVisuals";
import "./foggara-source-deck.css";

/**
 * Editorial, mobile-readable adaptation of the user's eight-slide PowerPoint:
 * "Oases Nexus WEFEH — FOGGARA-DZ.pptx" (2026-10-09).
 * The order and substantive claims are preserved; source slide artwork/text
 * overlapping in PowerPoint is not reproduced as broken screenshot media.
 * Curated images are AI-assisted illustrations, not observed field evidence.
 */
type Locale="ar"|"fr"|"en";
type TextSlide={title:string;summary:string;points:string[];label:string};
type Slide={id:string;photos:readonly string[];fallback:string;theme:"dark"|"paper";kicker:string};
const sourceSlides:readonly Slide[]=[
  {id:"terrain",photos:["kasria-earth-channels","sahara-desert-rocks"],fallback:"/images/oasis-hero.webp",theme:"dark",kicker:"01 / AOI"},
  {id:"satellite",photos:["oasis-palms-blue-sky","oasis-palm-reflection"],fallback:"/images/oasis-dawn.webp",theme:"paper",kicker:"02 / SENTINEL-2"},
  {id:"water-soil-crops",photos:["oasis-irrigation-stream","palm-oasis-kasria"],fallback:"/images/oasis-hero.webp",theme:"dark",kicker:"03 / WEFEH"},
  {id:"evidence",photos:["traditional-kasria-outlets","rock-kasria-detail"],fallback:"/images/foggara-heritage-poster.webp",theme:"paper",kicker:"04 / EVIDENCE"},
  {id:"arbitration",photos:["kasria-water-distribution","kasria-earth-channels"],fallback:"/images/oasis-hero.webp",theme:"dark",kicker:"05 / DECISION"},
  {id:"sovereign-ai",photos:["sunset-over-oasis","oasis-palms-blue-sky"],fallback:"/images/oasis-dawn.webp",theme:"paper",kicker:"06 / AI"},
  {id:"ecosystem",photos:["oasis-palm-reflection","oasis-rock-pool"],fallback:"/images/oasis-hero.webp",theme:"dark",kicker:"07 / ACTORS"},
  {id:"expo",photos:["sahara-cultural-scene","sunset-over-oasis"],fallback:"/images/oasis-dawn.webp",theme:"paper",kicker:"08 / AGRITECH"}
];
const slides:Record<Locale,readonly TextSlide[]>={
  fr:[
    {title:"DÉFINIR LE TERRAIN",summary:"Dessiner ou sélectionner une zone d’intérêt. Le système calcule coordonnées, surface, périmètre et contexte spatial.",label:"AOI / PARCELLE",points:["Coordonnées · Surface · Périmètre","Occupation du sol · Voisinage · Bassin"]},
    {title:"OBSERVER PAR SATELLITE",summary:"Sentinel-2 L2A révèle les dynamiques de végétation, d’humidité et de stress sur l’AOI sélectionnée.",label:"SÉRIE TEMPORELLE",points:["Comparer les dates","Détecter les ruptures","Documenter l’incertitude"]},
    {title:"COMPRENDRE EAU, SOL ET CULTURES",summary:"Les modules croisent mesures terrain, télédétection et modèles. Ils qualifient un état — jamais une certitude absolue.",label:"ANALYSE CROISÉE",points:["EAU — Disponibilité · qualité · pression","SOL — Texture · salinité · humidité","CULTURES — Vigueur · stress · phénologie"]},
    {title:"PREUVE AVANT DÉCISION",summary:"Chaque résultat porte son origine, sa date, sa méthode, son niveau de confiance et ses limites d’usage.",label:"TRAÇABILITÉ",points:["01 OBSERVÉ — Donnée brute, source et horodatage","02 DÉRIVÉ — Indice ou calcul reproductible","03 MODÉLISÉ — Hypothèses et incertitude explicites","04 VALIDÉ POUR USAGE — Revue humaine et périmètre de décision"]},
    {title:"DE L’ANALYSE À L’ARBITRAGE",summary:"FOGGARA ne remplace pas la décision. Il rend les compromis lisibles, comparables et traçables.",label:"CONTRAINTES → SCÉNARIOS → DÉCISION",points:["CONTRAINTES — Eau disponible · Énergie · Sol · santé","SCÉNARIOS — Allocation · Cultures · Horizon temporel","DÉCISION — Impact WEFEH · Risque · Justification"]},
    {title:"IA SOUVERAINE ET SERVICES",summary:"Une IA locale d’assistance, documentée et contrôlable — au service des analystes, pas à la place de l’expertise.",label:"ARCHITECTURE DE SERVICES",points:["Interfaces métier","Services géospatiaux · Modèles WEFEH","IA locale · RAG documentaire","Données souveraines"]},
    {title:"UN ÉCOSYSTÈME NATIONAL",summary:"Des acteurs reliés par les projets, les territoires, les preuves et les ressources — dans un cadre commun.",label:"FOGGARA-DZ · BIEN COMMUN",points:["Institutions · Recherche","Agriculteurs · Entreprises · Territoires"]},
    {title:"RENCONTRONS-NOUS AU STAND B02",summary:"Démo FOGGARA-DZ : venez tester la chaîne complète, du terrain à la preuve, de la preuve à l’arbitrage.",label:"DÉMONSTRATIONS · PILOTES · PARTENARIATS",points:["EURL SIREP OASES NEXUS WEFEH_DZ","AGRITECH EXPO · ANNABA · 13–15 OCTOBRE 2026"]}
  ],
  ar:[
    {title:"تحديد المجال",summary:"ارسم أو اختر منطقة اهتمام. يحسب النظام الإحداثيات والمساحة والمحيط والسياق المكاني.",label:"منطقة الاهتمام / القطعة",points:["الإحداثيات · المساحة · المحيط","الغطاء الأرضي · الجوار · الحوض"]},
    {title:"الرصد بالأقمار الصناعية",summary:"تُظهر بيانات Sentinel-2 L2A ديناميكيات الغطاء النباتي والرطوبة والإجهاد في المجال المحدد.",label:"سلسلة زمنية",points:["مقارنة تواريخ الرصد","كشف التغيرات والانقطاعات","توثيق عدم اليقين"]},
    {title:"فهم المياه والتربة والمحاصيل",summary:"تجمع الوحدات بين قياسات الميدان والاستشعار عن بعد والنماذج. وتصف الحالة دون ادعاء اليقين المطلق.",label:"تحليل متعدد المصادر",points:["الماء — التوفر · الجودة · الضغط","التربة — القوام · الملوحة · الرطوبة","المحاصيل — الحيوية · الإجهاد · النمو"]},
    {title:"الدليل قبل القرار",summary:"لكل نتيجة مصدر وتاريخ وطريقة ومستوى ثقة وحدود للاستعمال.",label:"سلسلة الإثبات",points:["01 مرصود — بيانات أولية ومصدر وتاريخ","02 مشتق — مؤشر أو حساب قابل لإعادة الإنتاج","03 مُنمذج — فرضيات وحدود عدم يقين صريحة","04 معتمد للاستعمال — مراجعة بشرية ونطاق القرار"]},
    {title:"من التحليل إلى المفاضلة",summary:"لا تحل FOGGARA محل متخذ القرار، بل توضح البدائل وتتيح مقارنتها وتتبع أسبابها.",label:"قيود ← سيناريوهات ← قرار",points:["القيود — المياه المتاحة · الطاقة · التربة · الصحة","السيناريوهات — التخصيص · المحاصيل · الأفق الزمني","القرار — أثر WEFEH · المخاطر · المبررات"]},
    {title:"ذكاء اصطناعي سيادي وخدمات",summary:"ذكاء محلي مساعد وموثق وقابل للضبط، يخدم المحللين ولا يحل محل الخبرة.",label:"طبقات الخدمات",points:["واجهات مهنية متخصصة","خدمات مكانية · نماذج WEFEH","ذكاء محلي · استرجاع معرفي RAG","بيانات سيادية"]},
    {title:"منظومة وطنية مترابطة",summary:"أطراف تتصل عبر المشاريع والمناطق والأدلة والموارد ضمن إطار مشترك.",label:"FOGGARA-DZ · مصلحة مشتركة",points:["المؤسسات · البحث العلمي","الفلاحون · الشركات · الأقاليم"]},
    {title:"نلتقي في الجناح B02",summary:"عرض FOGGARA-DZ: جرّب سلسلة العمل الكاملة من الميدان إلى الدليل ومن الدليل إلى المفاضلة.",label:"عروض تطبيقية · مشاريع تجريبية · شراكات",points:["EURL SIREP OASES NEXUS WEFEH_DZ","AGRITECH EXPO · عنابة · 13–15 أكتوبر 2026"]}
  ],
  en:[
    {title:"DEFINE THE TERRAIN",summary:"Draw or select an area of interest. The system computes coordinates, area, perimeter and spatial context.",label:"AOI / PARCEL",points:["Coordinates · Area · Perimeter","Land cover · Neighbours · Catchment"]},
    {title:"OBSERVE BY SATELLITE",summary:"Sentinel-2 L2A reveals vegetation, moisture and stress dynamics over the selected AOI.",label:"TIME SERIES",points:["Compare acquisition dates","Detect changes and breaks","Document uncertainty"]},
    {title:"UNDERSTAND WATER, SOIL AND CROPS",summary:"Modules combine field measurements, remote sensing and models. They describe a condition — never absolute certainty.",label:"CROSS-DOMAIN ANALYSIS",points:["WATER — Availability · quality · pressure","SOIL — Texture · salinity · moisture","CROPS — Vigor · stress · phenology"]},
    {title:"EVIDENCE BEFORE DECISION",summary:"Each result carries its source, date, method, confidence level and limits of use.",label:"TRACEABLE EVIDENCE",points:["01 OBSERVED — Raw data, source and timestamp","02 DERIVED — Reproducible index or calculation","03 MODELLED — Explicit assumptions and uncertainty","04 VALIDATED FOR USE — Human review and decision scope"]},
    {title:"FROM ANALYSIS TO ARBITRATION",summary:"FOGGARA does not replace human decisions. It makes trade-offs readable, comparable and traceable.",label:"CONSTRAINTS → SCENARIOS → DECISION",points:["CONSTRAINTS — Water · energy · soil · health","SCENARIOS — Allocation · crops · time horizon","DECISION — WEFEH impact · risks · justification"]},
    {title:"SOVEREIGN AI AND SERVICES",summary:"Documented, controllable local AI supports analysts without replacing their expertise.",label:"SERVICE ARCHITECTURE",points:["Professional interfaces","Geospatial services · WEFEH models","Local AI · Document RAG","Sovereign data"]},
    {title:"A NATIONAL ECOSYSTEM",summary:"Actors connected through projects, territories, evidence and resources within a shared framework.",label:"FOGGARA-DZ · SHARED INFRASTRUCTURE",points:["Institutions · Research","Farmers · Companies · Territories"]},
    {title:"MEET US AT STAND B02",summary:"FOGGARA-DZ demo: experience the full path from the field to evidence and from evidence to arbitration.",label:"DEMOS · PILOTS · PARTNERSHIPS",points:["EURL SIREP OASES NEXUS WEFEH_DZ","AGRITECH EXPO · ANNABA · 13–15 OCTOBER 2026"]}
  ]
};
const UI={
  fr:{title:"Présentation interactive FOGGARA-DZ",prev:"Diapositive précédente",next:"Diapositive suivante",choose:"Choisir une diapositive",image:"Illustration",note:"Images illustratives, non preuves terrain. Le contenu suit les 8 diapositives du support fourni.",expo:"Accéder à la démo"},
  ar:{title:"العرض التفاعلي لمنصة فقارة",prev:"الشريحة السابقة",next:"الشريحة التالية",choose:"اختر شريحة",image:"صورة توضيحية",note:"الصور توضيحية وليست قياسات ميدانية موثقة. المحتوى يتبع الشرائح الثماني في العرض المرفق.",expo:"الدخول إلى العرض التطبيقي"},
  en:{title:"FOGGARA-DZ interactive presentation",prev:"Previous slide",next:"Next slide",choose:"Choose a slide",image:"Illustration",note:"Images are illustrative, not verified field evidence. Content follows the eight supplied slides.",expo:"Open the live demo"}
} as const;
export function FoggaraSourceDeck({lang}:{lang:Locale}){
  const [index,setIndex]=useState(0);
  const frame=sourceSlides[index],slide=slides[lang][index],ui=UI[lang];
  const go=(next:number)=>setIndex((next+sourceSlides.length)%sourceSlides.length);
  const sourcePhotos=frame.photos.map(id=>{
    const meta=oasisVisuals.find(p=>p.id===id);
    return {id,alt:meta?.alt[lang]??ui.image,src:getOasisPhoto(id)??frame.fallback};
  });
  return <section className="fg-source-deck" aria-label={ui.title} dir={lang==="ar"?"rtl":"ltr"} lang={lang}
    onKeyDown={e=>{if(e.target!==e.currentTarget)return;if(e.key==="ArrowRight"){e.preventDefault();go(index+(lang==="ar"?-1:1));}if(e.key==="ArrowLeft"){e.preventDefault();go(index+(lang==="ar"?1:-1));}}} tabIndex={0}>
    <div className={"fg-source-slide fg-source-slide-"+frame.theme} aria-roledescription="slide" aria-label={`${index+1} / ${sourceSlides.length}`}>
      <div className="fg-source-copy" aria-live="polite">
        <div className="fg-source-brand">FOGGARA-DZ <span>{frame.kicker}</span></div>
        <h3>{slide.title}</h3>
        <p className="fg-source-summary">{slide.summary}</p>
        <div className="fg-source-list"><strong>{slide.label}</strong><ul>{slide.points.map(p=><li key={p}>{p}</li>)}</ul></div>
        {frame.id==="expo"?<Link className="fg-source-expo" to="/expo">{ui.expo}<ExternalLink size={17}/></Link>:null}
      </div>
      <div className="fg-source-pictures" aria-label={ui.image}>
        {sourcePhotos.map((photo,i)=><figure key={photo.id} className={i===0?"primary":"secondary"}>
          <img src={photo.src} alt={photo.alt} loading={i===0?"eager":"lazy"} decoding="async"/>
          <figcaption>{photo.alt}</figcaption>
        </figure>)}
      </div>
      <span className="fg-source-progress" dir="ltr">{String(index+1).padStart(2,"0")} / {String(sourceSlides.length).padStart(2,"0")}</span>
    </div>
    <div className="fg-source-navigation">
      <button type="button" onClick={()=>go(index-1)} aria-label={ui.prev}><ChevronLeft size={20}/></button>
      <div className="fg-source-steps" role="group" aria-label={ui.choose}>
        {sourceSlides.map((item,i)=><button type="button" key={item.id} className={i===index?"selected":""} aria-current={i===index?"step":undefined} onClick={()=>go(i)}
          title={slides[lang][i].title}><span>{String(i+1).padStart(2,"0")}</span><small>{slides[lang][i].title}</small></button>)}
      </div>
      <button type="button" onClick={()=>go(index+1)} aria-label={ui.next}><ChevronRight size={20}/></button>
    </div>
    <p className="fg-source-illustration-note"><Images size={15}/>{ui.note}</p>
  </section>;
}
