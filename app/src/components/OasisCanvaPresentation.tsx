import {useEffect,useMemo,useState} from "react";
import {Link} from "react-router";
import {ArrowUpRight,ChevronLeft,ChevronRight,Pause,Play} from "lucide-react";
import "./oasis-canva-presentation.css";

export type OasisCanvaLocale="ar"|"fr"|"en";

type Slide={
  kicker:string;
  title:string;
  body:string;
  meta:string;
  route:string;
  visual:"dawn"|"hero";
  crop:"a"|"b"|"c";
};

type DeckCopy={
  eyebrow:string;
  heading:string;
  intro:string;
  open:string;
  prev:string;
  next:string;
  play:string;
  pause:string;
  slides:Slide[];
};

const copy:Record<OasisCanvaLocale,DeckCopy>={
  en:{
    eyebrow:"FOGGARA-DZ · CANVA PRESENTATION",
    heading:"OASIS-LED PLATFORM PRESENTATION",
    intro:"The Canva story is now part of the platform itself. Every chapter keeps the oasis as the visual anchor while the content moves from heritage and resource logic to evidence, smart agriculture and action.",
    open:"OPEN MODULE",
    prev:"Previous slide",
    next:"Next slide",
    play:"Play presentation",
    pause:"Pause presentation",
    slides:[
      {kicker:"01 · FOGGARA-DZ",title:"INTEGRATED DECISIONS. TRACEABLE EVIDENCE.",body:"SIREP OASES NEXUS WEFEH-DZ connects field reality, spatial context, measurements, evidence and decisions in one operational environment.",meta:"WATER · ENERGY · FOOD · ECOSYSTEM · HEALTH",route:"/app",visual:"dawn",crop:"a"},
      {kicker:"02 · HERITAGE",title:"FROM HERITAGE TO DIGITAL TWIN",body:"The Foggara is the operating inspiration: a shared logic of flow, stewardship and visible allocation translated into modern data, evidence and monitoring.",meta:"HERITAGE → DATA → EVIDENCE → DECISION",route:"/presentation",visual:"hero",crop:"a"},
      {kicker:"03 · SYSTEM LOGIC",title:"HOW THE FOGGARA WORKS",body:"Source, capture, gallery, outlet, kasria and gardens form a clear physical sequence. FOGGARA-DZ preserves that legibility in the digital model.",meta:"SOURCE → CAPTURE → GALLERY → KASRIA → GARDENS",route:"/presentation",visual:"dawn",crop:"b"},
      {kicker:"04 · OPERATING CYCLE",title:"FIELD REALITY BECOMES A GOVERNED LOOP",body:"Observe, verify, compute, interpret, propose, act and learn. Each stage keeps method, provenance and responsibility visible.",meta:"OBSERVE → VERIFY → COMPUTE → INTERPRET → PROPOSE → ACT & LEARN",route:"/app/studio",visual:"hero",crop:"b"},
      {kicker:"05 · WEFEH",title:"ONE NEXUS. FIVE CONNECTED DOMAINS.",body:"Water, energy, food, ecosystem and health are analysed together so constraints, scenarios and trade-offs remain connected.",meta:"WATER · ENERGY · FOOD · ECOSYSTEM · HEALTH",route:"/app/nexus",visual:"dawn",crop:"c"},
      {kicker:"06 · PLATFORM",title:"FOGGARA-DZ PLATFORM",body:"Evidence registry, spatial intelligence, nexus analysis and a decision workspace turn distributed information into a usable operating system.",meta:"EVIDENCE · GIS · NEXUS · DECISION",route:"/app",visual:"hero",crop:"c"},
      {kicker:"07 · SMART AGRICULTURE",title:"FROM FIELD QUESTION TO AGRICULTURAL ADVICE",body:"Select a parcel, review satellite and field context, compare options, and keep the reasoning behind irrigation or crop recommendations visible.",meta:"PARCEL → SATELLITE → WEATHER → SOIL/WATER → ADVISORY",route:"/app/agriculture",visual:"dawn",crop:"a"},
      {kicker:"08 · ASSURANCE",title:"EVIDENCE BEFORE DECISION",body:"FOGGARA-DZ distinguishes observed, verified, computed, inferred and proposed information so users always know what a result actually represents.",meta:"OBSERVED · VERIFIED · COMPUTED · INFERRED · PROPOSED",route:"/app/review",visual:"hero",crop:"a"},
      {kicker:"09 · WORKFLOW",title:"FROM NEED TO ACTION",body:"A field need moves through evidence, analysis, option review and action while every handoff keeps assumptions and responsibility visible.",meta:"NEED → EVIDENCE → ANALYSIS → OPTION → ACTION",route:"/app/projects",visual:"dawn",crop:"b"},
      {kicker:"10 · SIREP OASES",title:"SERVICES & ECOSYSTEM",body:"Engineering, water, irrigation, agriculture, measurement, inspection, GIS, IoT and local-first AI connect producers, institutions, laboratories, financiers and experts.",meta:"SERVICES · ACTORS · SHARED OUTCOME",route:"/about",visual:"hero",crop:"b"},
      {kicker:"11 · AGRITECH EXPO",title:"LIVE DEMO",body:"Visitors can enter without a password, choose a field question, trace the evidence, compare an option and leave feedback for follow-up.",meta:"SCAN → QUESTION → EVIDENCE → OPTION → FEEDBACK",route:"/expo",visual:"dawn",crop:"c"},
      {kicker:"12 · CLOSING",title:"ANCESTRAL WISDOM. MODERN DECISIONS.",body:"Explore the evidence. Follow the flow. Shape the next decision with a platform designed around Algerian resources and operational reality.",meta:"BUILD · VERIFY · DECIDE · ACT · LEARN",route:"/contact",visual:"hero",crop:"c"}
    ]
  },
  fr:{
    eyebrow:"FOGGARA-DZ · PRÉSENTATION CANVA",
    heading:"UNE PRÉSENTATION PORTÉE PAR L’OASIS",
    intro:"Le récit Canva devient une partie native de la plateforme. L’oasis reste le repère visuel pendant que le contenu passe du patrimoine aux preuves, à l’agriculture intelligente et à l’action.",
    open:"OUVRIR LE MODULE",
    prev:"Diapositive précédente",
    next:"Diapositive suivante",
    play:"Lire la présentation",
    pause:"Mettre en pause",
    slides:[
      {kicker:"01 · FOGGARA-DZ",title:"DÉCISIONS INTÉGRÉES. PREUVES TRAÇABLES.",body:"SIREP OASES NEXUS WEFEH-DZ relie terrain, contexte spatial, mesures, preuves et décisions dans un même environnement opérationnel.",meta:"EAU · ÉNERGIE · ALIMENTATION · ÉCOSYSTÈME · SANTÉ",route:"/app",visual:"dawn",crop:"a"},
      {kicker:"02 · PATRIMOINE",title:"DU PATRIMOINE AU JUMEAU NUMÉRIQUE",body:"La Foggara inspire la logique de fonctionnement : flux, responsabilité et répartition visible, traduits en données, preuves et suivi modernes.",meta:"PATRIMOINE → DONNÉES → PREUVES → DÉCISION",route:"/presentation",visual:"hero",crop:"a"},
      {kicker:"03 · LOGIQUE DU SYSTÈME",title:"COMMENT FONCTIONNE LA FOGGARA",body:"Source, captage, galerie, sortie, kasria et jardins forment une séquence physique lisible que FOGGARA-DZ conserve dans son modèle numérique.",meta:"SOURCE → CAPTAGE → GALERIE → KASRIA → JARDINS",route:"/presentation",visual:"dawn",crop:"b"},
      {kicker:"04 · CYCLE OPÉRATIONNEL",title:"LE TERRAIN DEVIENT UNE BOUCLE GOUVERNÉE",body:"Observer, vérifier, calculer, interpréter, proposer, agir et apprendre, avec méthode, provenance et responsabilité visibles.",meta:"OBSERVER → VÉRIFIER → CALCULER → INTERPRÉTER → PROPOSER → AGIR",route:"/app/studio",visual:"hero",crop:"b"},
      {kicker:"05 · WEFEH",title:"UN NEXUS. CINQ DOMAINES CONNECTÉS.",body:"Eau, énergie, alimentation, écosystème et santé sont analysés ensemble pour garder contraintes, scénarios et arbitrages reliés.",meta:"EAU · ÉNERGIE · ALIMENTATION · ÉCOSYSTÈME · SANTÉ",route:"/app/nexus",visual:"dawn",crop:"c"},
      {kicker:"06 · PLATEFORME",title:"PLATEFORME FOGGARA-DZ",body:"Registre de preuves, intelligence spatiale, analyse nexus et espace de décision transforment l’information distribuée en système opérationnel.",meta:"PREUVES · SIG · NEXUS · DÉCISION",route:"/app",visual:"hero",crop:"c"},
      {kicker:"07 · AGRICULTURE INTELLIGENTE",title:"DE LA QUESTION TERRAIN AU CONSEIL AGRICOLE",body:"Sélectionnez une parcelle, examinez le contexte satellite et terrain, comparez les options et gardez le raisonnement de la recommandation visible.",meta:"PARCELLE → SATELLITE → MÉTÉO → SOL/EAU → CONSEIL",route:"/app/agriculture",visual:"dawn",crop:"a"},
      {kicker:"08 · ASSURANCE",title:"LA PREUVE AVANT LA DÉCISION",body:"FOGGARA-DZ distingue information observée, vérifiée, calculée, inférée et proposée pour rendre chaque résultat interprétable.",meta:"OBSERVED · VERIFIED · COMPUTED · INFERRED · PROPOSED",route:"/app/review",visual:"hero",crop:"a"},
      {kicker:"09 · PARCOURS",title:"DU BESOIN À L’ACTION",body:"Le besoin terrain passe par les preuves, l’analyse, l’examen des options et l’action tout en gardant hypothèses et responsabilités visibles.",meta:"BESOIN → PREUVE → ANALYSE → OPTION → ACTION",route:"/app/projects",visual:"dawn",crop:"b"},
      {kicker:"10 · SIREP OASES",title:"SERVICES & ÉCOSYSTÈME",body:"Ingénierie, eau, irrigation, agriculture, mesure, inspection, SIG, IoT et IA locale relient producteurs, institutions, laboratoires, financeurs et experts.",meta:"SERVICES · ACTEURS · RÉSULTAT PARTAGÉ",route:"/about",visual:"hero",crop:"b"},
      {kicker:"11 · AGRITECH EXPO",title:"DÉMO LIVE",body:"Le visiteur entre sans mot de passe, choisit une question terrain, suit les preuves, compare une option et laisse un retour.",meta:"SCAN → QUESTION → PREUVE → OPTION → FEEDBACK",route:"/expo",visual:"dawn",crop:"c"},
      {kicker:"12 · CLÔTURE",title:"SAGESSE ANCESTRALE. DÉCISIONS MODERNES.",body:"Explorez les preuves, suivez le flux et préparez la prochaine décision avec une plateforme pensée pour les ressources et réalités algériennes.",meta:"CONSTRUIRE · VÉRIFIER · DÉCIDER · AGIR · APPRENDRE",route:"/contact",visual:"hero",crop:"c"}
    ]
  },
  ar:{
    eyebrow:"FOGGARA-DZ · عرض CANVA",
    heading:"عرض تقوده صورة الواحة",
    intro:"أصبح سرد Canva جزءًا أصليًا من المنصة؛ تبقى الواحة هي المرجع البصري بينما ينتقل المحتوى من التراث إلى الأدلة والزراعة الذكية والتنفيذ.",
    open:"فتح الوحدة",
    prev:"الشريحة السابقة",
    next:"الشريحة التالية",
    play:"تشغيل العرض",
    pause:"إيقاف العرض",
    slides:[
      {kicker:"01 · FOGGARA-DZ",title:"قرار متكامل. دليل قابل للتتبع.",body:"تربط SIREP OASES NEXUS WEFEH-DZ الواقع الميداني والسياق المكاني والقياسات والأدلة والقرار داخل بيئة تشغيلية واحدة.",meta:"المياه · الطاقة · الغذاء · النظام البيئي · الصحة",route:"/app",visual:"dawn",crop:"a"},
      {kicker:"02 · التراث",title:"من التراث إلى التوأم الرقمي",body:"تلهم الفقارة منطق التشغيل: التدفق والمسؤولية والتوزيع الواضح، ثم تترجم المنصة ذلك إلى بيانات وأدلة ومتابعة حديثة.",meta:"التراث ← البيانات ← الأدلة ← القرار",route:"/presentation",visual:"hero",crop:"a"},
      {kicker:"03 · منطق النظام",title:"كيف تعمل الفقارة",body:"المصدر والالتقاط والمعرض والمخرج والكسرية والبساتين تشكل تسلسلًا ماديًا واضحًا، وتحافظ FOGGARA-DZ على هذا الوضوح في النموذج الرقمي.",meta:"المصدر ← الالتقاط ← المعرض ← الكسرية ← البساتين",route:"/presentation",visual:"dawn",crop:"b"},
      {kicker:"04 · دورة التشغيل",title:"الواقع الميداني يصبح دورة محكومة",body:"ملاحظة، تحقق، حساب، تفسير، اقتراح، تنفيذ وتعلم؛ مع بقاء الطريقة والمصدر والمسؤولية مرئية في كل مرحلة.",meta:"ملاحظة ← تحقق ← حساب ← تفسير ← اقتراح ← تنفيذ",route:"/app/studio",visual:"hero",crop:"b"},
      {kicker:"05 · WEFEH",title:"ترابط واحد. خمسة مجالات.",body:"تحلل المياه والطاقة والغذاء والنظام البيئي والصحة معًا حتى تبقى القيود والسيناريوهات والمفاضلات مترابطة.",meta:"المياه · الطاقة · الغذاء · النظام البيئي · الصحة",route:"/app/nexus",visual:"dawn",crop:"c"},
      {kicker:"06 · المنصة",title:"منصة FOGGARA-DZ",body:"سجل الأدلة والذكاء المكاني وتحليل Nexus ومساحة القرار تحول المعلومات المتفرقة إلى نظام عمل متكامل.",meta:"الأدلة · GIS · NEXUS · القرار",route:"/app",visual:"hero",crop:"c"},
      {kicker:"07 · الزراعة الذكية",title:"من سؤال الحقل إلى التوصية الزراعية",body:"اختر قطعة، راجع السياق الساتلي والميداني، قارن الخيارات واحتفظ بمنطق توصية الري أو المحصول ظاهرًا.",meta:"القطعة ← الأقمار ← الطقس ← التربة/المياه ← التوصية",route:"/app/agriculture",visual:"dawn",crop:"a"},
      {kicker:"08 · الضمان",title:"الدليل قبل القرار",body:"تميز FOGGARA-DZ بين الملاحظ والمتحقق والمحسوب والمستنتج والمقترح حتى يفهم المستخدم طبيعة كل نتيجة.",meta:"ملاحظ · متحقق · محسوب · مستنتج · مقترح",route:"/app/review",visual:"hero",crop:"a"},
      {kicker:"09 · المسار",title:"من الحاجة إلى التنفيذ",body:"تنتقل الحاجة الميدانية عبر الأدلة والتحليل ومراجعة الخيارات والتنفيذ مع بقاء الافتراضات والمسؤوليات ظاهرة.",meta:"الحاجة ← الدليل ← التحليل ← الخيار ← التنفيذ",route:"/app/projects",visual:"dawn",crop:"b"},
      {kicker:"10 · SIREP OASES",title:"الخدمات والمنظومة",body:"الهندسة والمياه والري والزراعة والقياس والتفتيش وGIS وIoT والذكاء المحلي تربط المنتجين والمؤسسات والمخابر والتمويل والخبراء.",meta:"الخدمات · الفاعلون · نتيجة مشتركة",route:"/about",visual:"hero",crop:"b"},
      {kicker:"11 · AGRITECH EXPO",title:"ديمو مباشر",body:"يدخل الزائر دون كلمة مرور، يختار سؤالًا ميدانيًا، يتتبع الأدلة، يقارن خيارًا ثم يترك رأيه للمتابعة.",meta:"مسح ← سؤال ← دليل ← خيار ← رأي",route:"/expo",visual:"dawn",crop:"c"},
      {kicker:"12 · الختام",title:"حكمة متوارثة. قرارات حديثة.",body:"استكشف الأدلة، اتبع التدفق، وساهم في القرار التالي عبر منصة مصممة حول الموارد والواقع التشغيلي في الجزائر.",meta:"ابنِ · تحقق · قرر · نفذ · تعلم",route:"/contact",visual:"hero",crop:"c"}
    ]
  }
};

export function OasisCanvaPresentation({lang,compact=false}:{lang:OasisCanvaLocale;compact?:boolean}){
  const c=copy[lang];
  const [index,setIndex]=useState(0);
  const [playing,setPlaying]=useState(true);
  const slide=c.slides[index];
  const dir=lang==="ar"?"rtl":"ltr";

  useEffect(()=>{
    if(!playing||window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)return;
    const timer=window.setInterval(()=>setIndex(value=>(value+1)%c.slides.length),6500);
    return()=>window.clearInterval(timer);
  },[playing,c.slides.length]);

  useEffect(()=>{setIndex(0)},[lang]);

  const progress=useMemo(()=>((index+1)/c.slides.length)*100,[index,c.slides.length]);

  return <section className={`ocp ${compact?"ocp-compact":""}`} dir={dir} aria-labelledby={compact?"ocp-compact-title":"ocp-title"}>
    <header className="ocp-head">
      <div>
        <p className="ocp-eyebrow">{c.eyebrow}</p>
        <h2 id={compact?"ocp-compact-title":"ocp-title"}>{c.heading}</h2>
      </div>
      <p>{c.intro}</p>
    </header>

    <div className="ocp-stage">
      <div key={`media-${index}`} className={`ocp-media ocp-media-${slide.visual} ocp-crop-${slide.crop}`} role="img" aria-label={slide.title}>
        <div className="ocp-shade"/>
        <div className="ocp-counter" dir="ltr">{String(index+1).padStart(2,"0")} / {String(c.slides.length).padStart(2,"0")}</div>
        <div className="ocp-media-copy">
          <p>{slide.kicker}</p>
          <h3>{slide.title}</h3>
          <span>{slide.meta}</span>
        </div>
      </div>

      <aside className="ocp-panel">
        <div className="ocp-brand"><strong>FOGGARA-DZ</strong><span>SIREP OASES NEXUS WEFEH-DZ</span></div>
        <div key={`panel-${index}`} className="ocp-panel-slide">
          <p className="ocp-body">{slide.body}</p>
          <div className="ocp-progress" aria-hidden="true"><i style={{width:`${progress}%`}}/></div>
          <Link className="ocp-link" to={slide.route}>{c.open}<ArrowUpRight size={16}/></Link>
        </div>
        <div className="ocp-controls">
          <button type="button" aria-label={c.prev} onClick={()=>setIndex(value=>(value+c.slides.length-1)%c.slides.length)}><ChevronLeft size={18}/></button>
          <button type="button" aria-label={playing?c.pause:c.play} className="ocp-play" onClick={()=>setPlaying(value=>!value)}>{playing?<Pause size={17}/>:<Play size={17}/>}<span>{playing?c.pause:c.play}</span></button>
          <button type="button" aria-label={c.next} onClick={()=>setIndex(value=>(value+1)%c.slides.length)}><ChevronRight size={18}/></button>
        </div>
      </aside>
    </div>

  </section>;
}
