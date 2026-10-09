import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowUpRight, ArrowDown, Droplets, Zap, Wheat, Leaf, HeartPulse,
  ShieldCheck, Users, MapPinned, BrainCircuit, Search, QrCode, CloudSun, Satellite, FlaskConical, Map,
  Copy, Download, Check, ChevronLeft, ChevronRight, MapPin, Languages,
  Building2, ScanLine
} from "lucide-react";
import { useAuth } from "@/context/useAuth";
import { api } from "@/lib/api";
import { OasisCanvaPresentation } from "@/components/OasisCanvaPresentation";
import { WILAYAS } from "@/lib/wilayas";
import "./operations.css";
import "./landing.css";
import "./heritage-landing.css";

const domains = [
  {key:"water",Icon:Droplets},
  {key:"energy",Icon:Zap},
  {key:"food",Icon:Wheat},
  {key:"ecosystem",Icon:Leaf},
  {key:"health",Icon:HeartPulse}
];


type Locale = "ar" | "fr" | "en";

export default function Landing() {
  const {user}=useAuth();
  const {t,i18n}=useTranslation();
  const [active,setActive]=useState("all");
  const [toolQuery,setToolQuery]=useState("");
  const [heroSlide,setHeroSlide]=useState(0);
  const toolSearchRef=useRef<HTMLInputElement>(null);
  const [qrCopied,setQrCopied]=useState(false);
  const expoUrl="https://foggara-dz.onrender.com/expo";
  const [demoStats,setDemoStats]=useState<{sites:number;projects:number;parcels:number;observations:number}>({sites:0,projects:0,parcels:0,observations:0});
  const lang:Locale=i18n.language==="fr"?"fr":i18n.language==="en"?"en":"ar";

  const copy=lang==="fr"?{
    home:"ACCUEIL",about:"À PROPOS",services:"SERVICES",presentation:"PRÉSENTATION",demo:"DÉMO",contact:"CONTACT",
    topNational:"PLATEFORME NATIONALE ALGÉRIENNE",topLang:"AR · FR · EN",topExpo:"AGRITECH EXPO",
    hero:[
      {eyebrow:"SIREP OASES · FOGGARA-DZ",title:"FOGGARA-DZ",accent:"NEXUS WEFEH",body:"De l’ingéniosité hydraulique des oasis à une plateforme nationale de décision : terrain, données, preuves, analyse et action."},
      {eyebrow:"PATRIMOINE → INGÉNIERIE",title:"LA KASRIA",accent:"DEVIENT INTELLIGENCE",body:"La logique du partage de l’eau inspire une architecture numérique où chaque ressource, mesure et décision conserve sa provenance."},
      {eyebrow:"EAU · ÉNERGIE · ALIMENTATION · ÉCOSYSTÈME · SANTÉ",title:"UNE PLATEFORME",accent:"POUR AGIR",body:"SIG, agriculture intelligente, télédétection, IoT, analyses, conformité, décisions et suivi dans un même environnement opérationnel."}
    ],
    discover:"DÉCOUVRIR",visitor:"ACCÈS VISITEUR",enter:"OUVRIR LA PLATEFORME",
    aboutTitle:"À PROPOS DE",aboutStrong:"SIREP OASES",aboutBody:"SIREP OASES NEXUS WEFEH-DZ est une entreprise algérienne multidisciplinaire qui relie ingénierie, services numériques, énergie, agriculture, mesure, étalonnage, inspection et intelligence des ressources. FOGGARA-DZ en est le cœur numérique.",
    readMore:"EN SAVOIR PLUS",
    stats:["WILAYAS","DOMAINES WEFEH","PROJETS DÉMO","PARCELLES DÉMO"],
    offerTitle:"CE QUE",offerStrong:"NOUS OFFRONS",offerBody:"Des services terrain et numériques connectés par un même système de données, de preuves et de décision.",
    offers:[
      ["EAU & IRRIGATION","Gestion des ressources, pompage, qualité de l’eau, mesures et optimisation de l’irrigation.","/agriculture-services"],
      ["AGRICULTURE & SATELLITE","Parcelles, Sentinel-2, indices de végétation, météo agricole et suivi des cultures.","/app/agriculture"],
      ["PREUVES & DÉCISION","Provenance, validation, analyse, règles, scénarios et décisions auditées.","/app/studio"]
    ],
    liveDemo:"DÉMO OPÉRATIONNELLE",liveBody:"Entrez directement dans le parcours Expo, explorez les modules actifs et laissez un retour public pour poursuivre la discussion avec SIREP OASES.",
    openDemo:"OUVRIR LA DÉMO",copy:"COPIER",copied:"COPIÉ",download:"QR SVG",
    toolsEyebrow:"FOGGARA / SERVICES NUMÉRIQUES",toolsTitle:"CHOISISSEZ UN OUTIL. COMMENCEZ IMMÉDIATEMENT.",toolsBody:"Recherche rapide, accès direct et résultats traçables.",search:"Rechercher satellite, météo, sol, SIG, IA…",open:"OUVRIR",public:"PUBLIC",workspace:"ESPACE",noResults:"Aucun service ne correspond."
  }:lang==="en"?{
    home:"HOME",about:"ABOUT",services:"SERVICES",presentation:"PRESENTATION",demo:"DEMO",contact:"CONTACT",
    topNational:"ALGERIAN NATIONAL PLATFORM",topLang:"AR · FR · EN",topExpo:"AGRITECH EXPO",
    hero:[
      {eyebrow:"SIREP OASES · FOGGARA-DZ",title:"FOGGARA-DZ",accent:"NEXUS WEFEH",body:"From oasis water ingenuity to a national decision platform: field reality, data, evidence, analysis and action."},
      {eyebrow:"HERITAGE → ENGINEERING",title:"THE KASRIA",accent:"BECOMES INTELLIGENCE",body:"The logic of water sharing inspires a digital architecture where every resource, measurement and decision keeps its provenance."},
      {eyebrow:"WATER · ENERGY · FOOD · ECOSYSTEM · HEALTH",title:"ONE PLATFORM",accent:"BUILT TO ACT",body:"GIS, smart agriculture, remote sensing, IoT, analysis, compliance, decisions and monitoring in one operational environment."}
    ],
    discover:"DISCOVER",visitor:"VISITOR ACCESS",enter:"OPEN PLATFORM",
    aboutTitle:"ABOUT",aboutStrong:"SIREP OASES",aboutBody:"SIREP OASES NEXUS WEFEH-DZ is an Algerian multidisciplinary company connecting engineering, digital services, energy, agriculture, measurement, calibration, inspection and resource intelligence. FOGGARA-DZ is its digital core.",
    readMore:"READ MORE",
    stats:["WILAYAS","WEFEH DOMAINS","DEMO PROJECTS","DEMO PARCELS"],
    offerTitle:"WHAT",offerStrong:"WE OFFER",offerBody:"Field and digital services connected through one data, evidence and decision system.",
    offers:[
      ["WATER & IRRIGATION","Resource management, pumping, water quality, measurements and irrigation optimisation.","/agriculture-services"],
      ["AGRICULTURE & SATELLITE","Parcels, Sentinel-2, vegetation indices, agricultural weather and crop monitoring.","/app/agriculture"],
      ["EVIDENCE & DECISION","Provenance, validation, analysis, rules, scenarios and auditable decisions.","/app/studio"]
    ],
    liveDemo:"OPERATIONAL DEMO",liveBody:"Enter the Expo journey directly, explore active modules and leave public feedback to continue the conversation with SIREP OASES.",
    openDemo:"OPEN DEMO",copy:"COPY",copied:"COPIED",download:"QR SVG",
    toolsEyebrow:"FOGGARA / DIGITAL SERVICES",toolsTitle:"CHOOSE A TOOL. START NOW.",toolsBody:"Fast search, direct entry and traceable results.",search:"Search satellite, weather, soil, GIS, AI…",open:"OPEN",public:"PUBLIC",workspace:"WORKSPACE",noResults:"No matching service."
  }:{
    home:"الرئيسية",about:"من نحن",services:"الخدمات",presentation:"عرض المنصة",demo:"الديمو",contact:"اتصل بنا",
    topNational:"المنصة الجزائرية الوطنية",topLang:"العربية · FR · EN",topExpo:"AGRITECH EXPO",
    hero:[
      {eyebrow:"SIREP OASES · FOGGARA-DZ",title:"FOGGARA-DZ",accent:"NEXUS WEFEH",body:"من عبقرية توزيع المياه في الواحات إلى منصة وطنية للقرار تربط الميدان والبيانات والأدلة والتحليل والتنفيذ."},
      {eyebrow:"التراث ← الهندسة",title:"الكسـرية",accent:"تصبح ذكاءً",body:"منطق اقتسام الماء يلهم بنية رقمية تحفظ مصدر كل مورد وقياس وتحليل وقرار وتربطها بسلسلة إثبات واضحة."},
      {eyebrow:"المياه · الطاقة · الغذاء · النظام البيئي · الصحة",title:"منصة واحدة",accent:"للقرار والعمل",body:"GIS والزراعة الذكية والاستشعار عن بعد وIoT والتحاليل والامتثال والقرار والمتابعة داخل بيئة تشغيلية واحدة."}
    ],
    discover:"اكتشف",visitor:"دخول الزائر",enter:"فتح المنصة",
    aboutTitle:"من نحن",aboutStrong:"SIREP OASES",aboutBody:"SIREP OASES NEXUS WEFEH-DZ مؤسسة جزائرية متعددة التخصصات تربط الهندسة والخدمات الرقمية والطاقة والزراعة والقياس والمعايرة والتفتيش وذكاء الموارد. وتمثل FOGGARA-DZ قلبها الرقمي.",
    readMore:"المزيد",
    stats:["ولاية","مجالات WEFEH","مشاريع تجريبية","قطع تجريبية"],
    offerTitle:"ماذا",offerStrong:"نقدم",offerBody:"خدمات ميدانية ورقمية مترابطة داخل منظومة موحدة للبيانات والأدلة والقرار.",
    offers:[
      ["المياه والري","إدارة الموارد والضخ وجودة المياه والقياسات وتحسين الري.","/agriculture-services"],
      ["الزراعة والأقمار الصناعية","القطع وSentinel-2 ومؤشرات الغطاء النباتي والطقس الزراعي ومتابعة المحاصيل.","/app/agriculture"],
      ["الأدلة والقرار","المصدر والتحقق والتحليل والقواعد والسيناريوهات والقرارات القابلة للتدقيق.","/app/studio"]
    ],
    liveDemo:"ديمو تشغيلي",liveBody:"ادخل مباشرة إلى مسار المعرض، استكشف الوحدات الفعالة واترك رأيك لمواصلة النقاش مع SIREP OASES.",
    openDemo:"فتح الديمو",copy:"نسخ",copied:"تم النسخ",download:"QR SVG",
    toolsEyebrow:"FOGGARA / الخدمات الرقمية",toolsTitle:"اختر الأداة وابدأ مباشرة.",toolsBody:"بحث سريع ودخول مباشر ونتائج قابلة للتتبع.",search:"ابحث: أقمار، طقس، تربة، GIS، ذكاء…",open:"فتح",public:"عام",workspace:"مساحة عمل",noResults:"لا توجد خدمة مطابقة."
  };

  const institutionCopy=lang==="fr"?{
    capabilities:["INGÉNIERIE","SERVICES NUMÉRIQUES","ÉNERGIE","AGRICULTURE","MESURE","ÉTALONNAGE","INSPECTION"],
    galleryAria:"FOGGARA-DZ · patrimoine, terrain et intelligence des ressources",
    gallery:["OASIS & EAU","PATRIMOINE FOGGARA","TERRAIN & RESSOURCES","DONNÉES & PREUVES"],
    demoModules:[["MODE EXPO","/expo"],["EAU & SOL","/agriculture-services"],["PRÉSENTATION","/presentation"]]
  }:lang==="en"?{
    capabilities:["ENGINEERING","DIGITAL SERVICES","ENERGY","AGRICULTURE","MEASUREMENT","CALIBRATION","INSPECTION"],
    galleryAria:"FOGGARA-DZ · heritage, field reality and resource intelligence",
    gallery:["OASIS & WATER","FOGGARA HERITAGE","FIELD & RESOURCES","DATA & EVIDENCE"],
    demoModules:[["EXPO MODE","/expo"],["WATER & SOIL","/agriculture-services"],["PRESENTATION","/presentation"]]
  }:{
    capabilities:["الهندسة","الخدمات الرقمية","الطاقة","الزراعة","القياس","المعايرة","التفتيش"],
    galleryAria:"فقارة الجزائر · التراث والميدان وذكاء الموارد",
    gallery:["الواحة والمياه","تراث الفقارة","الميدان والموارد","البيانات والأدلة"],
    demoModules:[["وضع المعرض","/expo"],["المياه والتربة","/agriculture-services"],["عرض المنصة","/presentation"]]
  };

  const toolLabels=lang==="fr"?{
    expo:["MODE AGRITECH","Carte live, compteur visiteurs et feedback public."],
    satellite:["INTELLIGENCE SATELLITE","Sentinel-2 réel, NDVI, EVI, SAVI, NDWI, NDMI, LSWI et BSI."],
    weather:["MÉTÉO AGRICOLE","Prévision jusqu’à 15 jours avec ET₀, pluie, vent et rayonnement."],
    soil:["SOL & EAU","Services d’analyse, mesures, provenance et preuves."],
    gis:["SIG & PARCELLES","Cartographie, contours de parcelles et couches géospatiales."],
    ai:["CONSEILLER IA LOCAL","Interprétation des preuves avec Ollama/LLM local, sans inventer de mesures."]
  }:lang==="en"?{
    expo:["AGRITECH MODE","Live map, visitor counter and public feedback."],
    satellite:["SATELLITE INTELLIGENCE","Real Sentinel-2 with NDVI, EVI, SAVI, NDWI, NDMI, LSWI and BSI."],
    weather:["AGRICULTURAL WEATHER","Up to 15-day forecast with ET₀, rain, wind and radiation."],
    soil:["SOIL & WATER","Analysis services, measurements, provenance and evidence."],
    gis:["GIS & PARCELS","Mapping, parcel boundaries and geospatial layers."],
    ai:["LOCAL AI ADVISORY","Evidence interpretation with local Ollama/LLM without inventing measurements."]
  }:{
    expo:["وضع AGRITECH","خريطة حية وعداد الزوار واستطلاع رأي عام."],
    satellite:["التحليل الساتلي","Sentinel-2 حقيقي مع NDVI وEVI وSAVI وNDWI وNDMI وLSWI وBSI."],
    weather:["الطقس الزراعي","توقع حتى 15 يومًا مع ET₀ والمطر والرياح والإشعاع."],
    soil:["التربة والمياه","خدمات تحليل وقياسات ومصدر الدليل وسلسلة الإثبات."],
    gis:["GIS والقطع","خرائط وحدود القطع والطبقات الجغرافية."],
    ai:["المستشار المحلي بالذكاء","تفسير الأدلة عبر Ollama/LLM محلي دون اختراع قياسات."]
  };

  const toolDeck=[
    {key:"expo",Icon:QrCode,to:"/expo",scope:"public"},
    {key:"satellite",Icon:Satellite,to:"/app/agriculture",scope:"workspace"},
    {key:"weather",Icon:CloudSun,to:"/app/agriculture",scope:"workspace"},
    {key:"soil",Icon:FlaskConical,to:"/agriculture-services",scope:"public"},
    {key:"gis",Icon:Map,to:"/app/gis",scope:"workspace"},
    {key:"ai",Icon:BrainCircuit,to:"/app/agriculture",scope:"workspace"},
  ].map(item=>({...item,title:toolLabels[item.key as keyof typeof toolLabels][0],body:toolLabels[item.key as keyof typeof toolLabels][1]}));

  const normalizedToolQuery=toolQuery.trim().toLocaleLowerCase();
  const visibleTools=toolDeck.filter(tool=>!normalizedToolQuery||`${tool.title} ${tool.body}`.toLocaleLowerCase().includes(normalizedToolQuery));



  const operatingCopy=lang==="fr"?{
    eyebrow:"DU TERRAIN À LA DÉCISION",
    title:"UNE CHAÎNE OPÉRATIONNELLE CLAIRE.",
    body:"Chaque étape ouvre un module réel de FOGGARA-DZ. Le terrain reste la référence; les calculs, modèles et recommandations conservent leur niveau de preuve.",
    steps:[
      ["DÉFINIR LE TERRAIN","Dessiner ou sélectionner l’AOI. Coordonnées, surface, périmètre et contexte spatial.","AOI · WGS84 · GeoJSON"],
      ["OBSERVER PAR SATELLITE","Sentinel-2 L2A et séries temporelles pour la végétation, l’humidité et les ruptures.","OBSERVED → COMPUTED"],
      ["COMPRENDRE EAU, SOL & CULTURES","Croiser télédétection, mesures terrain et modèles sans transformer une estimation en certitude.","WATER · SOIL · CROPS"],
      ["PREUVE AVANT DÉCISION","Origine, date, méthode, confiance et limites restent visibles avant toute recommandation.","5 EVIDENCE STATES"],
      ["ANALYSER & ARBITRER","Comparer contraintes, scénarios, risques et impacts WEFEH avant l’action et le suivi.","SCENARIOS · DECISION"]
    ]
  }:lang==="en"?{
    eyebrow:"FROM FIELD TO DECISION",
    title:"ONE CLEAR OPERATING CHAIN.",
    body:"Every stage opens a real FOGGARA-DZ module. Field reality remains the reference while calculations, models and recommendations keep their evidence level.",
    steps:[
      ["DEFINE THE FIELD","Draw or select the AOI. Coordinates, area, perimeter and spatial context are calculated.","AOI · WGS84 · GeoJSON"],
      ["OBSERVE BY SATELLITE","Sentinel-2 L2A and time series for vegetation, moisture and change detection.","OBSERVED → COMPUTED"],
      ["UNDERSTAND WATER, SOIL & CROPS","Combine remote sensing, field measurements and models without turning estimates into certainty.","WATER · SOIL · CROPS"],
      ["EVIDENCE BEFORE DECISION","Source, date, method, confidence and limitations stay visible before recommendations.","5 EVIDENCE STATES"],
      ["ANALYZE & ARBITRATE","Compare constraints, scenarios, risks and WEFEH impacts before action and monitoring.","SCENARIOS · DECISION"]
    ]
  }:{
    eyebrow:"من الميدان إلى القرار",
    title:"سلسلة تشغيلية واحدة وواضحة.",
    body:"كل مرحلة تفتح وحدة فعلية داخل FOGGARA-DZ. يبقى الواقع الميداني هو المرجع، بينما تحتفظ الحسابات والنماذج والتوصيات بمستوى الدليل الخاص بها.",
    steps:[
      ["تحديد المجال","ارسم أو اختر منطقة AOI ليتم حساب الإحداثيات والمساحة والمحيط والسياق المكاني.","AOI · WGS84 · GeoJSON"],
      ["الرصد بالأقمار الصناعية","Sentinel-2 L2A وسلاسل زمنية لمتابعة الغطاء النباتي والرطوبة والتغيرات.","OBSERVED → COMPUTED"],
      ["فهم المياه والتربة والمحاصيل","دمج الاستشعار عن بعد والقياسات الميدانية والنماذج دون تحويل التقدير إلى حقيقة مؤكدة.","WATER · SOIL · CROPS"],
      ["الدليل قبل القرار","يبقى مصدر النتيجة وتاريخها وطريقتها وثقتها وحدود استخدامها ظاهرة قبل التوصية.","5 EVIDENCE STATES"],
      ["التحليل والمفاضلة","مقارنة القيود والسيناريوهات والمخاطر وتأثيرات WEFEH قبل التنفيذ والمتابعة.","SCENARIOS · DECISION"]
    ]
  };

  const operatingSteps=[
    {Icon:MapPinned,to:"/app/gis",...{title:operatingCopy.steps[0][0],body:operatingCopy.steps[0][1],meta:operatingCopy.steps[0][2]}},
    {Icon:Satellite,to:"/app/agriculture",...{title:operatingCopy.steps[1][0],body:operatingCopy.steps[1][1],meta:operatingCopy.steps[1][2]}},
    {Icon:FlaskConical,to:"/agriculture-services",...{title:operatingCopy.steps[2][0],body:operatingCopy.steps[2][1],meta:operatingCopy.steps[2][2]}},
    {Icon:ShieldCheck,to:"/app/studio",...{title:operatingCopy.steps[3][0],body:operatingCopy.steps[3][1],meta:operatingCopy.steps[3][2]}},
    {Icon:BrainCircuit,to:"/app/nexus",...{title:operatingCopy.steps[4][0],body:operatingCopy.steps[4][1],meta:operatingCopy.steps[4][2]}}
  ];

  useEffect(()=>{
    let cancelled=false;
    api.get<{counts:{sites:number;projects:number;parcels:number;observations:number}}>("/expo/demo-data")
      .then(value=>{if(!cancelled)setDemoStats(value.counts);})
      .catch(()=>undefined);
    return()=>{cancelled=true;};
  },[]);

  useEffect(()=>{
    const timer=window.setInterval(()=>setHeroSlide(value=>(value+1)%copy.hero.length),6000);
    return()=>window.clearInterval(timer);
  },[copy.hero.length]);

  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){
        event.preventDefault();
        toolSearchRef.current?.focus();
      }else if(event.key==="Escape"&&document.activeElement===toolSearchRef.current){
        setToolQuery("");
        toolSearchRef.current?.blur();
      }
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[]);

  async function copyExpoLink(){
    try{
      await navigator.clipboard.writeText(expoUrl);
      setQrCopied(true);
      window.setTimeout(()=>setQrCopied(false),1800);
    }catch{/* Clipboard can be unavailable in restricted browser contexts. */}
  }

  const hero=copy.hero[heroSlide];

  return <div className="fg-public fg-landing fg-moon-landing" dir={i18n.dir()} lang={i18n.language}>
    <div className="fg-moon-topline">
      <span><Building2 size={15}/>{copy.topNational}</span>
      <span><Languages size={15}/>{copy.topLang}</span>
      <span><MapPin size={15}/>ALGERIA · {copy.topExpo}</span>
    </div>

    <nav className="fg-moon-nav" aria-label={t("publicExperience.navigation")}>
      <a href="#home">{copy.home}</a>
      <a href="#about">{copy.about}</a>
      <a href="#services">{copy.services}</a>
      <a href="#presentation">{copy.presentation}</a>
      <a href="#demo">{copy.demo}</a>
      <Link to="/contact">{copy.contact}</Link>
      <a className="fg-moon-nav-cta" href="#tools"><Search size={16}/>{copy.services}</a>
    </nav>

    <section className="fg-moon-hero fg-lukas-hero fg-rebuilt-hero" id="home" aria-labelledby="foggara-title">
      <div className={`fg-moon-hero-media fg-moon-hero-media-${heroSlide+1}`} aria-hidden="true"/>
      <div className="fg-moon-hero-overlay"/>

      <div className="fg-rebuilt-hero-top">
        <span dir="ltr">ALGERIA · NATIONAL INTEGRATED PLATFORM · 2026</span>
        <strong dir="ltr">SIREP OASES NEXUS WEFEH-DZ</strong>
      </div>

      <div className="fg-rebuilt-hero-center">
        <p className="fg-moon-hero-eyebrow">{hero.eyebrow}</p>
        <h1 id="foggara-title">
          <span className="fg-rebuilt-sirep">SIREP OASES</span>
          <span className="fg-rebuilt-foggara">FOGGARA-DZ</span>
          <span className="fg-rebuilt-nexus">NEXUS WEFEH</span>
        </h1>
        <p className="fg-rebuilt-lead">{hero.body}</p>
        <div className="fg-moon-hero-actions">
          <a className="fg-moon-btn fg-moon-btn-light" href="#operating">{copy.discover}</a>
          <Link className="fg-moon-btn fg-moon-btn-green" to={user?"/app":"/login"}>{user?copy.enter:copy.visitor}<ArrowUpRight size={15}/></Link>
        </div>
      </div>

      <div className="fg-rebuilt-hero-bottom">
        <div className="fg-lukas-thumbs" aria-label="FOGGARA-DZ hero scenes">
          {copy.hero.map((item,index)=><button type="button" key={item.title} className={heroSlide===index?"active":""} aria-label={`Slide ${index+1}`} aria-current={heroSlide===index} onClick={()=>setHeroSlide(index)}>
            <img src={index===0?"/images/user-oasis-hero.webp":index===1?"/images/oasis-hero.webp":"/images/oasis-dawn.webp"} alt="" loading="eager"/>
          </button>)}
        </div>
        <div className="fg-rebuilt-domain-line" dir="ltr">
          <span>WATER</span><span>ENERGY</span><span>FOOD</span><span>ECOSYSTEM</span><span>HEALTH</span>
        </div>
      </div>

      <button type="button" className="fg-moon-arrow fg-moon-arrow-prev" aria-label="Previous slide" onClick={()=>setHeroSlide((heroSlide+copy.hero.length-1)%copy.hero.length)}><ChevronLeft/></button>
      <button type="button" className="fg-moon-arrow fg-moon-arrow-next" aria-label="Next slide" onClick={()=>setHeroSlide((heroSlide+1)%copy.hero.length)}><ChevronRight/></button>
    </section>

    <nav className="fg-lukas-domain-strip" aria-label={t("publicExperience.domains")}>
      {domains.map(({key,Icon})=><button type="button" key={key} className={active===key?"active":""} aria-pressed={active===key} onClick={()=>setActive(active===key?"all":key)}>
        <Icon size={18}/><span>{t(`landing.${key}`)}</span>
      </button>)}
    </nav>

    <section className="fg-global-operating" id="operating" aria-labelledby="fg-operating-title">
      <header className="fg-global-section-head">
        <div>
          <p className="fg-eyebrow">{operatingCopy.eyebrow}</p>
          <h2 id="fg-operating-title">{operatingCopy.title}</h2>
        </div>
        <p>{operatingCopy.body}</p>
      </header>
      <div className="fg-global-operating-grid">
        {operatingSteps.map(({Icon,to,title,body,meta},index)=><Link to={to} className="fg-global-step" key={title}>
          <span className="fg-global-step-index" dir="ltr">0{index+1}</span>
          <Icon size={24}/>
          <h3>{title}</h3>
          <p>{body}</p>
          <footer><span dir="ltr">{meta}</span><ArrowUpRight size={16}/></footer>
        </Link>)}
      </div>
      <div className="fg-global-evidence-strip" dir="ltr">
        <span>OBSERVED</span><span>VERIFIED</span><span>COMPUTED</span><span>INFERRED</span><span>PROPOSED</span>
      </div>
    </section>

    <section className="fg-moon-about fg-lukas-about fg-global-about" id="about">
      <div className="fg-lukas-about-label">
        <span>{copy.aboutTitle}</span>
        <strong>{copy.aboutStrong}</strong>
      </div>
      <div className="fg-lukas-about-copy">
        <p>{copy.aboutBody}</p>
        <div className="fg-global-capabilities" aria-label={copy.aboutStrong}>
          {institutionCopy.capabilities.map(item=><span key={item}>{item}</span>)}
        </div>
        <Link className="fg-moon-btn fg-moon-btn-green" to="/about">{copy.readMore}<ArrowUpRight size={17}/></Link>
      </div>
    </section>

    <section className="fg-agriculture-template-story" id="heritage-story" aria-labelledby="fg-heritage-story-title">
      <div className="fg-agriculture-template-copy">
        <p className="fg-eyebrow">FOGGARA-DZ · ANCESTRAL WISDOM / MODERN SOLUTIONS</p>
        <h2 id="fg-heritage-story-title">{lang==="fr"?"DU PATRIMOINE AU JUMEAU NUMÉRIQUE":lang==="en"?"FROM HERITAGE TO DIGITAL TWIN":"من التراث إلى التوأم الرقمي"}</h2>
        <p>{lang==="fr"
          ?"La logique hydraulique de la foggara devient un parcours numérique exploitable : source, galerie, kasria, seguia et parcelle, puis données, preuves, décision et suivi."
          :lang==="en"
            ?"The hydraulic logic of the foggara becomes an operational digital journey: source, gallery, kasria, seguia and parcel, then data, evidence, decision and monitoring."
            :"تتحول البنية الهيدروليكية للفقارة إلى مسار رقمي تشغيلي: المصدر، النفق، القصرية، الساقية والقطعة، ثم البيانات والدليل والقرار والمتابعة."}</p>
        <div className="fg-agriculture-template-flow" dir="ltr" aria-label="FOGGARA heritage to digital twin flow">
          <span>SOURCE</span><b>→</b><span>GALLERY</span><b>→</b><span>KASRIA</span><b>→</b><span>SEGUIA</span><b>→</b><span>PARCEL</span>
          <i aria-hidden="true"/>
          <span>DATA</span><b>→</b><span>EVIDENCE</span><b>→</b><span>DECISION</span><b>→</b><span>MONITORING</span>
        </div>
        <Link className="fg-moon-btn fg-moon-btn-green" to="/presentation">{copy.presentation}<ArrowUpRight size={16}/></Link>
      </div>
      <figure className="fg-agriculture-template-art">
        <img src="/images/oasis-dawn.webp" alt={lang==="fr"?"Système traditionnel de partage de l’eau par foggara":lang==="en"?"Traditional foggara water-sharing system":"نظام الفقارة التقليدي لتوزيع المياه"} loading="lazy"/>
        <figcaption><span>FIELD HERITAGE</span><strong>FOGGARA → DIGITAL TWIN</strong></figcaption>
      </figure>
    </section>

    <div className="fg-global-visual-stage" aria-label={institutionCopy.galleryAria}>
      <figure className="fg-global-visual-main">
        <img src="/images/oasis-dawn.webp" alt={institutionCopy.gallery[0]} loading="lazy"/>
        <figcaption>{institutionCopy.gallery[0]}</figcaption>
      </figure>
      <figure className="fg-global-visual-heritage">
        <img src="/images/oasis-dawn.webp" alt={institutionCopy.gallery[1]} loading="lazy"/>
        <figcaption>{institutionCopy.gallery[1]}</figcaption>
      </figure>
      <figure className="fg-global-visual-field">
        <img src="/images/oasis-hero.webp" alt={institutionCopy.gallery[2]} loading="lazy"/>
        <figcaption>{institutionCopy.gallery[2]}</figcaption>
      </figure>
      <figure className="fg-global-visual-evidence">
        <img src="/images/oasis-hero.webp" alt={institutionCopy.gallery[3]} loading="lazy"/>
        <figcaption>{institutionCopy.gallery[3]}</figcaption>
      </figure>
      <div className="fg-global-visual-note">
        <span>HERITAGE → DATA → EVIDENCE → DECISION</span>
        <strong>FOGGARA-DZ</strong>
      </div>
    </div>

    <section className="fg-moon-stats fg-global-stats" aria-label="FOGGARA statistics">
      <article><MapPinned size={30}/><strong>{WILAYAS.length}</strong><span>{copy.stats[0]}</span></article>
      <article><ScanLine size={30}/><strong>5</strong><span>{copy.stats[1]}</span></article>
      <article><Users size={30}/><strong>{demoStats.projects}</strong><span>{copy.stats[2]}</span></article>
      <article><ShieldCheck size={30}/><strong>{demoStats.parcels}</strong><span>{copy.stats[3]}</span></article>
    </section>

    <section className="fg-moon-offer fg-global-services" id="services">
      <header><h2>{copy.offerTitle} <strong>{copy.offerStrong}</strong></h2><p>{copy.offerBody}</p></header>
      <div className="fg-moon-offer-grid">
        {copy.offers.map(([title,body,to],index)=><article key={title} className={`fg-moon-offer-card fg-offer-${index+1}`}>
          <div className="fg-moon-offer-mark" aria-hidden="true">{index===0?<Droplets size={40}/>:index===1?<Satellite size={40}/>:<ShieldCheck size={40}/>}</div>
          <div><span dir="ltr">0{index+1}</span><h3>{title}</h3><p>{body}</p><Link to={to}>{copy.open}<ArrowUpRight size={15}/></Link></div>
        </article>)}
      </div>
    </section>

    <section className="fg-global-presentation" id="presentation" aria-labelledby="fg-presentation-title">
      <header className="fg-global-section-head">
        <div>
          <p className="fg-eyebrow">OASES NEXUS WEFEH / FOGGARA-DZ</p>
          <h2 id="fg-presentation-title">{copy.presentation}</h2>
        </div>
        <p>{lang==="fr"?"Du terrain à la preuve, de la preuve à l’arbitrage.":lang==="en"?"From field to evidence, from evidence to decision.":"من الميدان إلى الدليل، ومن الدليل إلى القرار."}</p>
      </header>
      <OasisCanvaPresentation lang={lang} compact/>
    </section>

    <section className="fg-moon-demo fg-global-demo" id="demo">
      <div>
        <p className="fg-eyebrow">AGRITECH EXPO / FOGGARA-DZ</p>
        <h2>{copy.liveDemo}</h2>
        <p>{copy.liveBody}</p>
        <div className="fg-moon-demo-actions">
          <Link className="fg-moon-btn fg-moon-btn-light" to="/expo">{copy.openDemo}<ArrowUpRight size={16}/></Link>
          <Link className="fg-moon-btn fg-moon-btn-outline" to={user?"/app":"/login"}>{copy.enter}<ArrowUpRight size={16}/></Link>
        </div>
        <nav className="fg-global-demo-modules" aria-label={copy.liveDemo}>
          {institutionCopy.demoModules.map(([label,to],index)=><Link to={to} key={label}><span dir="ltr">0{index+1}</span>{label}<ArrowUpRight size={13}/></Link>)}
        </nav>
      </div>
      <aside className="fg-moon-qr" aria-label={copy.openDemo}>
        <a href={expoUrl} target="_blank" rel="noreferrer"><img src="/expo-qr.svg" alt="FOGGARA AGRITECH EXPO QR" width="64" height="64"/></a>
        <div>
          <strong>FOGGARA / EXPO</strong>
          <span dir="ltr">foggara-dz.onrender.com/expo</span>
          <div><button type="button" onClick={()=>void copyExpoLink()}>{qrCopied?<Check size={14}/>:<Copy size={14}/>} {qrCopied?copy.copied:copy.copy}</button><a href="/expo-qr.svg" download="FOGGARA-AGRITECH-EXPO-QR.svg"><Download size={14}/>{copy.download}</a></div>
        </div>
      </aside>
    </section>

    <section className="fg-tool-hub fg-moon-tools" id="tools" aria-labelledby="fg-tool-title">
      <div className="fg-tool-panel">
        <div className="fg-tool-heading"><div><p className="fg-eyebrow">{copy.toolsEyebrow}</p><h2 id="fg-tool-title">{copy.toolsTitle}</h2><p>{copy.toolsBody}</p></div><span className="fg-tool-count" dir="ltr">{visibleTools.length}/{toolDeck.length}</span></div>
        <label className="fg-tool-command"><Search size={20}/><input ref={toolSearchRef} value={toolQuery} onChange={e=>setToolQuery(e.target.value)} placeholder={copy.search} aria-label={copy.search}/><kbd dir="ltr">Ctrl/⌘ K</kbd></label>
        <div className="fg-tool-grid">
          {visibleTools.map(({key,Icon,to,scope,title,body})=><Link to={to} className="fg-tool-card" key={key}>
            <span className="fg-tool-icon"><Icon size={22}/></span><span className="fg-tool-meta">{scope==="public"?copy.public:copy.workspace}</span>
            <h3>{title}</h3><p>{body}</p><span className="fg-tool-open">{copy.open}<ArrowUpRight size={15}/></span>
          </Link>)}
          {visibleTools.length===0&&<p className="fg-tool-empty">{copy.noResults}</p>}
        </div>
      </div>
    </section>

    <section className="fg-landing-cta fg-global-cta"><div><p className="fg-eyebrow">04 / SIREP OASES</p><h2>{t("publicExperience.ctaTitle")}</h2><p>{t("publicExperience.ctaBody")}</p></div><Link to="/contact" className="fg-button">{t("publicExperience.contact")}<ArrowUpRight size={18}/></Link></section>

    <footer className="fg-landing-footer"><span dir="ltr">FOGGARA-DZ · SIREP OASES NEXUS WEFEH-DZ</span><nav aria-label={t("publicExperience.legal")}><Link to="/privacy">{t("publicExperience.privacy")}</Link><Link to="/terms">{t("publicExperience.terms")}</Link><Link to="/rights">{t("publicExperience.rights")}</Link></nav><p>{t("publicExperience.scope")}</p><a href="#home" className="fg-link">{t("publicExperience.top")}<ArrowDown className="fg-up" size={14}/></a></footer>
  </div>;
}
