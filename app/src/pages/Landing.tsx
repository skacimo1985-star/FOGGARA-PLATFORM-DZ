import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Workflow, ArrowUpRight, ArrowDown, Droplets, Zap, Wheat, Leaf, HeartPulse,
  FolderKanban, ShieldCheck, Users, LockKeyhole, MapPinned, Database,
  BrainCircuit, Search, QrCode, CloudSun, Satellite, FlaskConical, Map,
  Copy, Download, Check, ChevronLeft, ChevronRight, MapPin, Languages,
  Building2, Waves, ScanLine
} from "lucide-react";
import { useAuth } from "@/context/useAuth";
import { api } from "@/lib/api";
import { NexusKasria } from "@/components/NexusKasria";
import { WorkflowGuide } from "@/components/WorkflowGuide";
import { AgroCapabilities } from "@/components/AgroCapabilities";
import { ServiceOfferings } from "@/components/ServiceOfferings";
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

const workspaces = [
  {key:"projects",Icon:FolderKanban,to:"/app/projects"},
  {key:"review",Icon:ShieldCheck,to:"/app/review"},
  {key:"dataRoom",Icon:LockKeyhole,to:"/app/vde"}
];

type Locale = "ar" | "fr" | "en";

export default function Landing() {
  const {user}=useAuth();
  const {t,i18n}=useTranslation();
  const [active,setActive]=useState("all");
  const [toolQuery,setToolQuery]=useState("");
  const [heroSlide,setHeroSlide]=useState(0);
  const [presentationSlide,setPresentationSlide]=useState(0);
  const toolSearchRef=useRef<HTMLInputElement>(null);
  const [qrCopied,setQrCopied]=useState(false);
  const expoUrl="https://foggara-dz.onrender.com/expo";
  const [expoStats,setExpoStats]=useState<{visitors:number;feedback:number}>({visitors:0,feedback:0});
  const lang:Locale=i18n.language==="fr"?"fr":i18n.language==="en"?"en":"ar";

  const copy=lang==="fr"?{
    home:"ACCUEIL",about:"À PROPOS",services:"SERVICES",presentation:"PRÉSENTATION",heritage:"FOGGARA",demo:"DÉMO",contact:"CONTACT",
    topNational:"PLATEFORME NATIONALE ALGÉRIENNE",topLang:"AR · FR · EN",topExpo:"AGRITECH EXPO",
    hero:[
      {eyebrow:"SIREP OASES · FOGGARA-DZ",title:"FOGGARA-DZ",accent:"NEXUS WEFEH",body:"De l’ingéniosité hydraulique des oasis à une plateforme nationale de décision : terrain, données, preuves, analyse et action."},
      {eyebrow:"PATRIMOINE → INGÉNIERIE",title:"LA KASRIA",accent:"DEVIENT INTELLIGENCE",body:"La logique du partage de l’eau inspire une architecture numérique où chaque ressource, mesure et décision conserve sa provenance."},
      {eyebrow:"EAU · ÉNERGIE · ALIMENTATION · ÉCOSYSTÈME · SANTÉ",title:"UNE PLATEFORME",accent:"POUR AGIR",body:"SIG, agriculture intelligente, télédétection, IoT, analyses, conformité, décisions et suivi dans un même environnement opérationnel."}
    ],
    discover:"DÉCOUVRIR",visitor:"ACCÈS VISITEUR",enter:"OUVRIR LA PLATEFORME",
    aboutTitle:"À PROPOS DE",aboutStrong:"SIREP OASES",aboutBody:"SIREP OASES NEXUS WEFEH-DZ est une entreprise algérienne multidisciplinaire qui relie ingénierie, services numériques, énergie, agriculture, mesure, étalonnage, inspection et intelligence des ressources. FOGGARA-DZ en est le cœur numérique.",
    readMore:"EN SAVOIR PLUS",
    stats:["WILAYAS","DOMAINES WEFEH","VISITEURS EXPO","AVIS REÇUS"],
    offerTitle:"CE QUE",offerStrong:"NOUS OFFRONS",offerBody:"Des services terrain et numériques connectés par un même système de données, de preuves et de décision.",
    offers:[
      ["EAU & IRRIGATION","Gestion des ressources, pompage, qualité de l’eau, mesures et optimisation de l’irrigation.","/agriculture-services"],
      ["AGRICULTURE & SATELLITE","Parcelles, Sentinel-2, indices de végétation, météo agricole et suivi des cultures.","/app/agriculture"],
      ["PREUVES & DÉCISION","Provenance, validation, analyse, règles, scénarios et décisions auditées.","/app/studio"]
    ],
    galleryTitle:"FOGGARA",galleryStrong:"EN IMAGES",galleryBody:"Une lecture visuelle du système hydraulique oasien, de la source au partage de l’eau et à la parcelle cultivée.",
    gallery:["GALERIE MÈRE","KASRIA PRINCIPALE","SEGUIAS","PARTAGE DE L’EAU","MAJEN & BASSIN","PATRIMOINE DE TIMIMOUN"],
    heritageTitle:"DE L’HÉRITAGE",heritageStrong:"AU JUMEAU NUMÉRIQUE",heritageBody:"L’infographie patrimoniale devient une porte d’entrée pédagogique vers le modèle FOGGARA : source → galerie → kasria → seguia → parcelle, puis données → preuves → décision → suivi.",
    heritageAction:"EXPLORER LE NEXUS",
    liveDemo:"DÉMO OPÉRATIONNELLE",liveBody:"Entrez directement dans le parcours Expo, explorez les modules actifs et laissez un retour public pour poursuivre la discussion avec SIREP OASES.",
    openDemo:"OUVRIR LA DÉMO",copy:"COPIER",copied:"COPIÉ",download:"QR SVG",
    toolsEyebrow:"FOGGARA / SERVICES NUMÉRIQUES",toolsTitle:"CHOISISSEZ UN OUTIL. COMMENCEZ IMMÉDIATEMENT.",toolsBody:"Recherche rapide, accès direct et résultats traçables.",search:"Rechercher satellite, météo, sol, SIG, IA…",open:"OUVRIR",public:"PUBLIC",workspace:"ESPACE",noResults:"Aucun service ne correspond."
  }:lang==="en"?{
    home:"HOME",about:"ABOUT",services:"SERVICES",presentation:"PRESENTATION",heritage:"FOGGARA",demo:"DEMO",contact:"CONTACT",
    topNational:"ALGERIAN NATIONAL PLATFORM",topLang:"AR · FR · EN",topExpo:"AGRITECH EXPO",
    hero:[
      {eyebrow:"SIREP OASES · FOGGARA-DZ",title:"FOGGARA-DZ",accent:"NEXUS WEFEH",body:"From oasis water ingenuity to a national decision platform: field reality, data, evidence, analysis and action."},
      {eyebrow:"HERITAGE → ENGINEERING",title:"THE KASRIA",accent:"BECOMES INTELLIGENCE",body:"The logic of water sharing inspires a digital architecture where every resource, measurement and decision keeps its provenance."},
      {eyebrow:"WATER · ENERGY · FOOD · ECOSYSTEM · HEALTH",title:"ONE PLATFORM",accent:"BUILT TO ACT",body:"GIS, smart agriculture, remote sensing, IoT, analysis, compliance, decisions and monitoring in one operational environment."}
    ],
    discover:"DISCOVER",visitor:"VISITOR ACCESS",enter:"OPEN PLATFORM",
    aboutTitle:"ABOUT",aboutStrong:"SIREP OASES",aboutBody:"SIREP OASES NEXUS WEFEH-DZ is an Algerian multidisciplinary company connecting engineering, digital services, energy, agriculture, measurement, calibration, inspection and resource intelligence. FOGGARA-DZ is its digital core.",
    readMore:"READ MORE",
    stats:["WILAYAS","WEFEH DOMAINS","EXPO VISITORS","FEEDBACK"],
    offerTitle:"WHAT",offerStrong:"WE OFFER",offerBody:"Field and digital services connected through one data, evidence and decision system.",
    offers:[
      ["WATER & IRRIGATION","Resource management, pumping, water quality, measurements and irrigation optimisation.","/agriculture-services"],
      ["AGRICULTURE & SATELLITE","Parcels, Sentinel-2, vegetation indices, agricultural weather and crop monitoring.","/app/agriculture"],
      ["EVIDENCE & DECISION","Provenance, validation, analysis, rules, scenarios and auditable decisions.","/app/studio"]
    ],
    galleryTitle:"FOGGARA",galleryStrong:"IN IMAGES",galleryBody:"A visual reading of the oasis hydraulic system, from source and water sharing to the cultivated parcel.",
    gallery:["MOTHER GALLERY","MAIN KASRIA","SEGUIAS","WATER SHARING","MAJEN & BASIN","TIMIMOUN HERITAGE"],
    heritageTitle:"FROM HERITAGE",heritageStrong:"TO DIGITAL TWIN",heritageBody:"The heritage infographic becomes an educational gateway into the FOGGARA model: source → gallery → kasria → seguia → parcel, then data → evidence → decision → monitoring.",
    heritageAction:"EXPLORE THE NEXUS",
    liveDemo:"OPERATIONAL DEMO",liveBody:"Enter the Expo journey directly, explore active modules and leave public feedback to continue the conversation with SIREP OASES.",
    openDemo:"OPEN DEMO",copy:"COPY",copied:"COPIED",download:"QR SVG",
    toolsEyebrow:"FOGGARA / DIGITAL SERVICES",toolsTitle:"CHOOSE A TOOL. START NOW.",toolsBody:"Fast search, direct entry and traceable results.",search:"Search satellite, weather, soil, GIS, AI…",open:"OPEN",public:"PUBLIC",workspace:"WORKSPACE",noResults:"No matching service."
  }:{
    home:"الرئيسية",about:"من نحن",services:"الخدمات",presentation:"عرض المنصة",heritage:"الفقارة",demo:"الديمو",contact:"اتصل بنا",
    topNational:"المنصة الجزائرية الوطنية",topLang:"العربية · FR · EN",topExpo:"AGRITECH EXPO",
    hero:[
      {eyebrow:"SIREP OASES · FOGGARA-DZ",title:"FOGGARA-DZ",accent:"NEXUS WEFEH",body:"من عبقرية توزيع المياه في الواحات إلى منصة وطنية للقرار تربط الميدان والبيانات والأدلة والتحليل والتنفيذ."},
      {eyebrow:"التراث ← الهندسة",title:"الكسـرية",accent:"تصبح ذكاءً",body:"منطق اقتسام الماء يلهم بنية رقمية تحفظ مصدر كل مورد وقياس وتحليل وقرار وتربطها بسلسلة إثبات واضحة."},
      {eyebrow:"المياه · الطاقة · الغذاء · النظام البيئي · الصحة",title:"منصة واحدة",accent:"للقرار والعمل",body:"GIS والزراعة الذكية والاستشعار عن بعد وIoT والتحاليل والامتثال والقرار والمتابعة داخل بيئة تشغيلية واحدة."}
    ],
    discover:"اكتشف",visitor:"دخول الزائر",enter:"فتح المنصة",
    aboutTitle:"من نحن",aboutStrong:"SIREP OASES",aboutBody:"SIREP OASES NEXUS WEFEH-DZ مؤسسة جزائرية متعددة التخصصات تربط الهندسة والخدمات الرقمية والطاقة والزراعة والقياس والمعايرة والتفتيش وذكاء الموارد. وتمثل FOGGARA-DZ قلبها الرقمي.",
    readMore:"المزيد",
    stats:["ولاية","مجالات WEFEH","زوار المعرض","آراء مسجلة"],
    offerTitle:"ماذا",offerStrong:"نقدم",offerBody:"خدمات ميدانية ورقمية مترابطة داخل منظومة موحدة للبيانات والأدلة والقرار.",
    offers:[
      ["المياه والري","إدارة الموارد والضخ وجودة المياه والقياسات وتحسين الري.","/agriculture-services"],
      ["الزراعة والأقمار الصناعية","القطع وSentinel-2 ومؤشرات الغطاء النباتي والطقس الزراعي ومتابعة المحاصيل.","/app/agriculture"],
      ["الأدلة والقرار","المصدر والتحقق والتحليل والقواعد والسيناريوهات والقرارات القابلة للتدقيق.","/app/studio"]
    ],
    galleryTitle:"الفقارة",galleryStrong:"بالصور",galleryBody:"قراءة بصرية للنظام المائي في الواحات، من المصدر وتقاسم المياه إلى القطعة المزروعة.",
    gallery:["المعرض الأم","الكسـرية الرئيسية","السواقي","تقاسم المياه","الماجن والحوض","تراث تيميمون"],
    heritageTitle:"من التراث",heritageStrong:"إلى التوأم الرقمي",heritageBody:"المخطط التراثي يصبح مدخلًا بصريًا لفهم نموذج FOGGARA: المصدر ← المعرض ← الكسرية ← الساقية ← القطعة، ثم البيانات ← الأدلة ← القرار ← المتابعة.",
    heritageAction:"استكشف NEXUS",
    liveDemo:"ديمو تشغيلي",liveBody:"ادخل مباشرة إلى مسار المعرض، استكشف الوحدات الفعالة واترك رأيك لمواصلة النقاش مع SIREP OASES.",
    openDemo:"فتح الديمو",copy:"نسخ",copied:"تم النسخ",download:"QR SVG",
    toolsEyebrow:"FOGGARA / الخدمات الرقمية",toolsTitle:"اختر الأداة وابدأ مباشرة.",toolsBody:"بحث سريع ودخول مباشر ونتائج قابلة للتتبع.",search:"ابحث: أقمار، طقس، تربة، GIS، ذكاء…",open:"فتح",public:"عام",workspace:"مساحة عمل",noResults:"لا توجد خدمة مطابقة."
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

  const narrative=lang==="fr"?{
    real:"FOGGARA RÉELLE",digital:"FOGGARA NUMÉRIQUE",intelligence:"INTELLIGENCE WEFEH",
    national:`${WILAYAS.length} wilayas`,evidence:"5 états de preuve",cycle:"11 étapes décisionnelles",
    spine:"Du terrain à la décision, sans casser la traçabilité.",
    spineBody:"FOGGARA relie les sites, mesures, projets, preuves, règles, décisions et suivi dans un même espace opérationnel."
  }:lang==="en"?{
    real:"REAL FOGGARA",digital:"DIGITAL FOGGARA",intelligence:"WEFEH INTELLIGENCE",
    national:`${WILAYAS.length} wilayas`,evidence:"5 evidence states",cycle:"11 decision stages",
    spine:"From field reality to decision, without losing provenance.",
    spineBody:"FOGGARA links sites, measurements, projects, evidence, rules, decisions and monitoring in one operational environment."
  }:{
    real:"الفقارة الحقيقية",digital:"الفقارة الرقمية",intelligence:"ذكاء WEFEH",
    national:`${WILAYAS.length} ولاية`,evidence:"5 حالات للأدلة",cycle:"11 مرحلة للقرار",
    spine:"من الواقع الميداني إلى القرار دون فقدان سلسلة الإثبات.",
    spineBody:"تربط FOGGARA المواقع والقياسات والمشاريع والأدلة والقواعد والقرارات والمتابعة في بيئة تشغيلية واحدة."
  };

  const presentation=lang==="fr"?{
    eyebrow:"FOGGARA-DZ / PRÉSENTATION FIGMA",
    title:"DU PATRIMOINE AU JUMEAU NUMÉRIQUE",
    intro:"La présentation Figma devient une expérience native dans la plateforme : l’image, le texte et les deux flux évoluent ensemble.",
    open:"OUVRIR LA PRÉSENTATION",
    heritageLabel:"HERITAGE FLOW",
    digitalLabel:"DIGITAL FLOW",
    slides:[
      {photo:10,kicker:"01 · SOURCE",title:"SOURCE / GALERIE MÈRE",body:"Le récit commence à la source et dans la galerie souterraine. Dans FOGGARA-DZ, cela devient une ressource localisée, identifiée et reliée aux mesures et à son historique.",heritage:"SOURCE → GALERIE",digital:"RESSOURCE → LOCALISATION → DONNÉES",to:"/presentation"},
      {photo:8,kicker:"02 · PARTAGE",title:"KASRIA / PARTAGE DE L’EAU",body:"La kasria répartit l’eau selon une logique explicite. Numériquement, cela correspond aux règles, priorités, contraintes et scénarios d’allocation.",heritage:"KASRIA → PARTAGE",digital:"RÈGLES → CONTRAINTES → ALLOCATION",to:"/app/nexus"},
      {photo:6,kicker:"03 · DISTRIBUTION",title:"SEGUIAS / DISTRIBUTION",body:"Les seguias acheminent l’eau vers les zones cultivées. Le jumeau numérique relie réseaux, équipements, zones d’irrigation et mesures opérationnelles.",heritage:"SEGUIA → RÉSEAU",digital:"RÉSEAU → TÉLÉMÉTRIE → SUIVI",to:"/app/gis"},
      {photo:1,kicker:"04 · PARCELLE",title:"PARCELLE / USAGE AGRICOLE",body:"À la parcelle, l’eau devient une décision agronomique liée à la culture, la météo, le sol, l’eau et au conseil d’irrigation.",heritage:"PARCELLE → CULTURE",digital:"INDICES → MÉTÉO → IRRIGATION",to:"/app/agriculture"},
      {photo:11,kicker:"05 · PREUVE",title:"PREUVE / SUIVI",body:"Les mesures et observations deviennent des preuves avec source, méthode, date et validation, puis se relient à la décision, au suivi et à l’apprentissage.",heritage:"TERRAIN → MÉMOIRE",digital:"PREUVE → DÉCISION → APPRENTISSAGE",to:"/app/review"}
    ]
  }:lang==="en"?{
    eyebrow:"FOGGARA-DZ / FIGMA PRESENTATION",
    title:"FROM HERITAGE TO DIGITAL TWIN",
    intro:"The Figma presentation becomes a native product experience: image, explanation and the two process flows change together.",
    open:"OPEN FULL PRESENTATION",
    heritageLabel:"HERITAGE FLOW",
    digitalLabel:"DIGITAL FLOW",
    slides:[
      {photo:10,kicker:"01 · SOURCE",title:"SOURCE / MOTHER GALLERY",body:"The story begins at the water source and underground gallery. In FOGGARA-DZ this becomes a located, identified resource linked to measurements and history.",heritage:"SOURCE → GALLERY",digital:"RESOURCE → LOCATION → DATA",to:"/presentation"},
      {photo:8,kicker:"02 · SHARING",title:"KASRIA / WATER SHARING",body:"The kasria divides water through an explicit allocation logic. Digitally, that maps to rules, priorities, constraints and allocation scenarios.",heritage:"KASRIA → SHARING",digital:"RULES → CONSTRAINTS → ALLOCATION",to:"/app/nexus"},
      {photo:6,kicker:"03 · DISTRIBUTION",title:"SEGUIAS / DISTRIBUTION",body:"Seguias carry water toward cultivated areas. The digital twin links networks, equipment, irrigation zones and operational measurements.",heritage:"SEGUIA → NETWORK",digital:"NETWORK → TELEMETRY → MONITORING",to:"/app/gis"},
      {photo:1,kicker:"04 · PARCEL",title:"PARCEL / AGRICULTURAL USE",body:"At parcel level, water becomes an agronomic decision informed by crop condition, weather, soil, water context and irrigation advice.",heritage:"PARCEL → CROP",digital:"INDICES → WEATHER → IRRIGATION",to:"/app/agriculture"},
      {photo:11,kicker:"05 · EVIDENCE",title:"EVIDENCE / MONITORING",body:"Measurements and observations become evidence with source, method, timestamp and validation, then connect to decision, monitoring and learning.",heritage:"FIELD → MEMORY",digital:"EVIDENCE → DECISION → LEARNING",to:"/app/review"}
    ]
  }:{
    eyebrow:"FOGGARA-DZ / عرض FIGMA",
    title:"من التراث إلى التوأم الرقمي",
    intro:"يتحول عرض Figma إلى تجربة أصلية داخل المنصة؛ تتغير الصورة والشرح ومسارا التراث والرقمنة معًا.",
    open:"فتح العرض الكامل",
    heritageLabel:"مسار التراث",
    digitalLabel:"المسار الرقمي",
    slides:[
      {photo:10,kicker:"01 · المصدر",title:"المصدر / المعرض الأم",body:"تبدأ القصة من مصدر المياه والمعرض الجوفي. في FOGGARA-DZ تصبح البداية موردًا محدد الموقع والهوية ويمكن ربطه بالقياسات والسجل.",heritage:"المصدر ← المعرض",digital:"المورد ← الموقع ← البيانات",to:"/presentation"},
      {photo:8,kicker:"02 · التقاسم",title:"الكسرية / تقاسم المياه",body:"تقسم الكسرية المياه وفق منطق توزيع واضح. رقميًا يقابل ذلك القواعد والأولويات والقيود وسيناريوهات التخصيص.",heritage:"الكسرية ← التقاسم",digital:"القواعد ← القيود ← التخصيص",to:"/app/nexus"},
      {photo:6,kicker:"03 · التوزيع",title:"السواقي / التوزيع",body:"تنقل السواقي المياه نحو المناطق المزروعة. في التوأم الرقمي ترتبط الشبكات والمعدات ومناطق الري والقياسات التشغيلية.",heritage:"الساقية ← الشبكة",digital:"الشبكة ← القياس ← المتابعة",to:"/app/gis"},
      {photo:1,kicker:"04 · القطعة",title:"القطعة / الاستخدام الزراعي",body:"عند القطعة تتحول المياه إلى قرار زراعي يعتمد على حالة المحصول والطقس والتربة والمياه ونصيحة الري.",heritage:"القطعة ← المحصول",digital:"المؤشرات ← الطقس ← الري",to:"/app/agriculture"},
      {photo:11,kicker:"05 · الدليل",title:"الدليل / المتابعة",body:"تتحول القياسات والملاحظات إلى أدلة تحفظ المصدر والطريقة والتاريخ والتحقق، ثم ترتبط بالقرار والمتابعة والتعلم.",heritage:"الميدان ← الذاكرة",digital:"الدليل ← القرار ← التعلم",to:"/app/review"}
    ]
  };

  useEffect(()=>{
    let cancelled=false;
    api.get<{visitors:number;feedback:number}>("/expo/stats")
      .then(value=>{if(!cancelled)setExpoStats(value);})
      .catch(()=>undefined);
    return()=>{cancelled=true;};
  },[]);

  useEffect(()=>{
    const timer=window.setInterval(()=>setHeroSlide(value=>(value+1)%copy.hero.length),6000);
    return()=>window.clearInterval(timer);
  },[copy.hero.length]);

  useEffect(()=>{
    const reduceMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if(reduceMotion)return;
    const timer=window.setInterval(()=>setPresentationSlide(value=>(value+1)%presentation.slides.length),8000);
    return()=>window.clearInterval(timer);
  },[presentation.slides.length]);

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
  const presentationCurrent=presentation.slides[presentationSlide];

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
      <a href="#heritage">{copy.heritage}</a>
      <a href="#demo">{copy.demo}</a>
      <Link to="/contact">{copy.contact}</Link>
      <a className="fg-moon-nav-cta" href="#tools"><Search size={16}/>{copy.services}</a>
    </nav>

    <section className="fg-moon-hero" id="home" aria-labelledby="foggara-title">
      <div className={`fg-moon-hero-media fg-moon-hero-media-${heroSlide+1}`} aria-hidden="true"/>
      <div className="fg-moon-hero-overlay"/>
      <div className="fg-moon-hero-content">
        <p className="fg-moon-hero-eyebrow">{hero.eyebrow}</p>
        <h1 id="foggara-title">{hero.title}</h1>
        <span className="fg-moon-hero-accent">{hero.accent}</span>
        <p>{hero.body}</p>
        <div className="fg-moon-hero-actions">
          <a className="fg-moon-btn fg-moon-btn-light" href="#about">{copy.discover}</a>
          <Link className="fg-moon-btn fg-moon-btn-green" to={user?"/app":"/expo"}>{user?copy.enter:copy.visitor}</Link>
        </div>
      </div>

      <button type="button" className="fg-moon-arrow fg-moon-arrow-prev" aria-label="Previous slide" onClick={()=>setHeroSlide((heroSlide+copy.hero.length-1)%copy.hero.length)}><ChevronLeft/></button>
      <button type="button" className="fg-moon-arrow fg-moon-arrow-next" aria-label="Next slide" onClick={()=>setHeroSlide((heroSlide+1)%copy.hero.length)}><ChevronRight/></button>
      <div className="fg-moon-dots" aria-label="Hero slides">{copy.hero.map((_,index)=><button type="button" key={index} aria-label={`Slide ${index+1}`} aria-current={heroSlide===index} onClick={()=>setHeroSlide(index)}/>)}</div>
    </section>

    <section className="fg-figma-embed" id="presentation" aria-labelledby="fg-presentation-title">
      <header className="fg-figma-embed-head">
        <div>
          <p className="fg-eyebrow">{presentation.eyebrow}</p>
          <h2 id="fg-presentation-title">{presentation.title}</h2>
        </div>
        <p>{presentation.intro}</p>
      </header>

      <div className="fg-figma-embed-frame">
        <div className={`fg-figma-embed-visual fg-photo-${String(presentationCurrent.photo).padStart(2,"0")}`} role="img" aria-label={presentationCurrent.title}>
          <div className="fg-figma-embed-shade"/>
          <span className="fg-figma-embed-index" dir="ltr">{String(presentationSlide+1).padStart(2,"0")} / 05</span>
          <div className="fg-figma-embed-caption">
            <p>{presentationCurrent.kicker}</p>
            <h3>{presentationCurrent.title}</h3>
          </div>
        </div>

        <aside className="fg-figma-embed-panel">
          <div className="fg-figma-embed-brand">
            <strong>FOGGARA-DZ</strong>
            <span>SIREP OASES NEXUS WEFEH-DZ</span>
          </div>
          <p className="fg-figma-embed-body">{presentationCurrent.body}</p>
          <div className="fg-figma-embed-flow">
            <small>{presentation.heritageLabel}</small>
            <strong>{presentationCurrent.heritage}</strong>
          </div>
          <div className="fg-figma-embed-flow digital">
            <small>{presentation.digitalLabel}</small>
            <strong>{presentationCurrent.digital}</strong>
          </div>
          <div className="fg-figma-embed-nav">
            <button type="button" aria-label="Previous presentation slide" onClick={()=>setPresentationSlide(value=>(value+presentation.slides.length-1)%presentation.slides.length)}><ChevronLeft size={18}/></button>
            <div>{presentation.slides.map((_,index)=><i key={index} className={presentationSlide===index?"active":""}/>)}</div>
            <button type="button" aria-label="Next presentation slide" onClick={()=>setPresentationSlide(value=>(value+1)%presentation.slides.length)}><ChevronRight size={18}/></button>
          </div>
          <Link className="fg-moon-btn fg-moon-btn-dark" to={presentationCurrent.to}>{presentation.open}<ArrowUpRight size={17}/></Link>
        </aside>
      </div>

      <div className="fg-figma-embed-thumbs" role="tablist" aria-label={presentation.title}>
        {presentation.slides.map((slide,index)=><button
          type="button"
          key={slide.title}
          role="tab"
          aria-selected={presentationSlide===index}
          className={presentationSlide===index?"active":""}
          onClick={()=>setPresentationSlide(index)}
        >
          <span className={`fg-figma-embed-thumb fg-photo-${String(slide.photo).padStart(2,"0")}`}><b dir="ltr">{index+1}</b></span>
          <span><small>{slide.kicker}</small><strong>{slide.title}</strong></span>
        </button>)}
      </div>
    </section>

    <section className="fg-moon-about" id="about">
      <div className="fg-moon-about-copy">
        <h2>{copy.aboutTitle}<br/><strong>{copy.aboutStrong}</strong></h2>
        <p>{copy.aboutBody}</p>
        <Link className="fg-moon-btn fg-moon-btn-dark" to="/about">{copy.readMore}<ArrowUpRight size={17}/></Link>
      </div>
      <div className="fg-moon-about-visual" aria-label="FOGGARA-DZ oasis">
        <img className="fg-moon-about-oasis" src="/images/oasis-hero.webp" alt="" loading="lazy" decoding="async"/>
        <div className="fg-moon-about-badge"><Waves size={24}/><strong>FOGGARA</strong><span>HERITAGE → DATA → DECISION</span></div>
      </div>
    </section>

    <section className="fg-moon-stats" aria-label="FOGGARA statistics">
      <article><MapPinned size={30}/><strong>{WILAYAS.length}</strong><span>{copy.stats[0]}</span></article>
      <article><ScanLine size={30}/><strong>5</strong><span>{copy.stats[1]}</span></article>
      <article><Users size={30}/><strong>{expoStats.visitors}</strong><span>{copy.stats[2]}</span></article>
      <article><ShieldCheck size={30}/><strong>{expoStats.feedback}</strong><span>{copy.stats[3]}</span></article>
    </section>

    <section className="fg-moon-offer" id="services">
      <header><h2>{copy.offerTitle} <strong>{copy.offerStrong}</strong></h2><p>{copy.offerBody}</p></header>
      <div className="fg-moon-offer-grid">
        {copy.offers.map(([title,body,to],index)=><article key={title} className={`fg-moon-offer-card fg-offer-${index+1}`}>
          <div className="fg-moon-offer-mark" aria-hidden="true">{index===0?<Droplets size={40}/>:index===1?<Satellite size={40}/>:<ShieldCheck size={40}/>}</div>
          <div><span dir="ltr">0{index+1}</span><h3>{title}</h3><p>{body}</p><Link to={to}>{copy.open}<ArrowUpRight size={15}/></Link></div>
        </article>)}
      </div>
    </section>

    <section className="fg-moon-heritage fg-foggara-visual-demo" id="heritage">
      <div className="fg-moon-heritage-copy">
        <p className="fg-eyebrow">DEMO / FOGGARA HERITAGE</p>
        <h2>{copy.heritageTitle}<br/><strong>{copy.heritageStrong}</strong></h2>
        <p>{copy.heritageBody}</p>
        <Link className="fg-moon-btn fg-moon-btn-dark" to="/app/nexus">{copy.heritageAction}<ArrowUpRight size={17}/></Link>
      </div>
      <div className="fg-foggara-demo-stage">
        <figure className="fg-foggara-demo-feature">
          <img src="/images/foggara-heritage-poster.webp" alt="La Foggara — système traditionnel de partage des eaux" loading="lazy" decoding="async"/>
          <figcaption>LA FOGGARA · DEMO VISUEL</figcaption>
        </figure>
        <div className="fg-foggara-demo-photos" aria-label="Foggara documentary demo">
          {[1,3,4,5,6,7,8,10,11].map((photo,index)=><figure key={photo}>
            <div className={`fg-moon-photo fg-photo-${String(photo).padStart(2,"0")}`} role="img" aria-label={copy.gallery[index%copy.gallery.length]}/>
          </figure>)}
        </div>
      </div>
    </section>

    <section className="fg-moon-demo" id="demo">
      <div>
        <p className="fg-eyebrow">AGRITECH EXPO / FOGGARA-DZ</p>
        <h2>{copy.liveDemo}</h2>
        <p>{copy.liveBody}</p>
        <div className="fg-moon-demo-actions">
          <Link className="fg-moon-btn fg-moon-btn-light" to="/expo">{copy.openDemo}<ArrowUpRight size={16}/></Link>
          <Link className="fg-moon-btn fg-moon-btn-outline" to={user?"/app":"/register"}>{copy.enter}<ArrowUpRight size={16}/></Link>
        </div>
      </div>
      <aside className="fg-moon-qr" aria-label={copy.openDemo}>
        <a href={expoUrl} target="_blank" rel="noreferrer"><img src="/expo-qr.svg" alt="FOGGARA AGRITECH EXPO QR" width="92" height="92"/></a>
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

    <nav className="fg-pillars" aria-label={t("publicExperience.domains")}>{domains.map(({key,Icon})=><button type="button" key={key} aria-pressed={active===key} onClick={()=>setActive(active===key?"all":key)}><Icon size={21}/><span>{t(`landing.${key}`)}</span></button>)}</nav>

    <section className="fg-platform-spine" aria-label="FOGGARA operating model">
      <div className="fg-spine-journey">
        <span><i>01</i>{narrative.real}</span><ArrowUpRight size={17}/><span><i>02</i>{narrative.digital}</span><ArrowUpRight size={17}/><span><i>03</i>{narrative.intelligence}</span>
      </div>
      <div className="fg-spine-copy"><div><p className="fg-eyebrow">FIELD → EVIDENCE → DECISION</p><h2>{narrative.spine}</h2><p>{narrative.spineBody}</p></div>
        <div className="fg-spine-facts"><span><MapPinned size={18}/><b>{WILAYAS.length}</b><small>{narrative.national}</small></span><span><ShieldCheck size={18}/><b>5</b><small>{narrative.evidence}</small></span><span><Database size={18}/><b>11</b><small>{narrative.cycle}</small></span><span><BrainCircuit size={18}/><b>WEFEH</b><small>Water · Energy · Food · Ecosystem · Health</small></span></div>
      </div>
    </section>

    <section className="fg-landing-network">
      <div><p className="fg-eyebrow">WEFEH / NEXUS</p><h2 className="fg-section-title">{t("publicExperience.network")}</h2><p>{t("publicExperience.evidenceBody")}</p><Link className="fg-link" to="/presentation">{t("publicExperience.presentation")}<ArrowUpRight size={16}/></Link></div>
      <div className="fg-landing-scene"><NexusKasria active={active} onSelect={setActive}/>
        <div className="fg-landing-selection" aria-live="polite" aria-atomic="true"><span>{t(active==="all"?"publicExperience.network":`landing.${active}`)}</span>
          <p>{t(`publicExperience.domainCopy.${active}`)}</p><Link to={active==="all"?"/app/nexus":`/app/explore/${active}`}>{t("publicExperience.explore")}<ArrowUpRight size={14}/></Link></div>
      </div>
    </section>

    <ServiceOfferings/>
    <AgroCapabilities compact/>

    <section className="fg-editorial" id="ecosystem"><div><p className="fg-eyebrow">01 / WEFEH</p><h2>{t("publicExperience.ecosystemTitle")}</h2></div>
      <div><p>{t("publicExperience.ecosystemBody")}</p><p>{t("publicExperience.evidenceBody")}</p><Link className="fg-link" to="/about">{t("publicExperience.about")}<ArrowUpRight size={16}/></Link></div></section>

    <WorkflowGuide/>

    <section className="fg-automation-banner"><Workflow size={26}/><div><p className="fg-eyebrow">FOGGARA / AUTOMATION</p><h2>{t("automation.publicTitle")}</h2><p>{t("automation.publicBody")}</p></div><Link to="/app/automation" className="fg-button">{t("automation.open")}<ArrowUpRight size={17}/></Link></section>

    <section id="collaboration" aria-labelledby="collaboration-title"><div className="fg-landing-section-heading"><div><p className="fg-eyebrow">02 / {t("publicExperience.collaboration")}</p><h2 id="collaboration-title" className="fg-section-title">{t("publicExperience.collaborationTitle")}</h2></div><Users size={32}/></div>
      <div className="fg-services-grid">{workspaces.map(({key,Icon,to},i)=><article className="fg-service" key={key}><span dir="ltr">0{i+1} / FOGGARA</span><Icon size={28}/><h3>{t(`publicExperience.${key}Title`)}</h3><p>{t(`publicExperience.${key}Body`)}</p><Link to={to} className="fg-link">{t("publicExperience.openWorkspace")}<ArrowUpRight size={15}/></Link></article>)}</div></section>

    <section className="fg-feature"><div><p className="fg-eyebrow">03 / {t("publicExperience.decision")}</p><h2>{t("publicExperience.decisionTitle")}</h2><p>{t("publicExperience.decisionBody")}</p><Link to="/app/studio" className="fg-button">{t("publicExperience.decisionOpen")}<ArrowUpRight size={17}/></Link></div>
      <ol className="fg-flow">{["resources","reviewed","analysis","human"].map((key,i)=><li key={key}><b dir="ltr">0{i+1}</b><span>{t(`publicExperience.steps.${key}`)}</span></li>)}</ol></section>

    <section className="fg-landing-cta"><div><p className="fg-eyebrow">04 / SIREP OASES</p><h2>{t("publicExperience.ctaTitle")}</h2><p>{t("publicExperience.ctaBody")}</p></div><Link to="/contact" className="fg-button">{t("publicExperience.contact")}<ArrowUpRight size={18}/></Link></section>

    <footer className="fg-landing-footer"><span dir="ltr">FOGGARA-DZ · SIREP OASES NEXUS WEFEH-DZ</span><nav aria-label={t("publicExperience.legal")}><Link to="/privacy">{t("publicExperience.privacy")}</Link><Link to="/terms">{t("publicExperience.terms")}</Link><Link to="/rights">{t("publicExperience.rights")}</Link></nav><p>{t("publicExperience.scope")}</p><a href="#home" className="fg-link">{t("publicExperience.top")}<ArrowDown className="fg-up" size={14}/></a></footer>
  </div>;
}
