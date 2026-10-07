import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Workflow, ArrowUpRight, ArrowDown, Droplets, Zap, Wheat, Leaf, HeartPulse, FolderKanban, ShieldCheck, Users, LockKeyhole, MapPinned, Database, BrainCircuit, Search, QrCode, CloudSun, Satellite, FlaskConical, Map, Copy, Download, Check } from "lucide-react";
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
const domains = [{key:"water",Icon:Droplets},{key:"energy",Icon:Zap},{key:"food",Icon:Wheat},{key:"ecosystem",Icon:Leaf},{key:"health",Icon:HeartPulse}];
const workspaces = [{key:"projects",Icon:FolderKanban,to:"/app/projects"},{key:"review",Icon:ShieldCheck,to:"/app/review"},{key:"dataRoom",Icon:LockKeyhole,to:"/app/vde"}];
export default function Landing() {
  const {user}=useAuth(); const {t,i18n}=useTranslation(); const [active,setActive]=useState("all");
  const [toolQuery,setToolQuery]=useState("");
  const toolSearchRef=useRef<HTMLInputElement>(null);
  const [qrCopied,setQrCopied]=useState(false);
  const expoUrl="https://foggara-dz.onrender.com/expo";
  const [expoStats,setExpoStats]=useState<{visitors:number;feedback:number}>({visitors:0,feedback:0});
  const lang=i18n.language==="fr"?"fr":i18n.language==="en"?"en":"ar";
  const heritage=lang==="fr"?{title:"Préserver nos ressources.",accent:"Cultiver notre avenir.",body:"De l’héritage des oasis à la décision éclairée : eau, énergie, agriculture, écosystèmes et santé.",discover:"Découvrir la plateforme",scroll:"Explorer FOGGARA",visit:"Accès visiteur"}:lang==="en"?{title:"Stewards of our resources.",accent:"Cultivating our future.",body:"From oasis heritage to informed decisions: water, energy, food, ecosystems and health.",discover:"Explore the platform",scroll:"Discover FOGGARA",visit:"Visitor access"}:{title:"نصون مواردنا.",accent:"ونزرع مستقبلنا.",body:"من إرث الواحات إلى القرار المستنير: المياه والطاقة والزراعة والنظم البيئية والصحة.",discover:"اكتشف المنصة",scroll:"استكشف فقارة",visit:"دخول الزوار"};
  const expoCopy=lang==="fr"?{enter:"Accès visiteur AGRITECH",visitors:"visiteurs",feedback:"avis",noPassword:"sans mot de passe",operate:"Créer un espace opérationnel"}:lang==="en"?{enter:"AGRITECH visitor access",visitors:"visitors",feedback:"feedback",noPassword:"no password required",operate:"Create operational workspace"}:{enter:"دخول زائر AGRITECH",visitors:"زائر",feedback:"رأي",noPassword:"بدون كلمة مرور",operate:"إنشاء مساحة عمل حقيقية"};
  const companyCopy=lang==="fr"?{
    aboutTitle:"QUI SOMMES-NOUS",
    aboutBody:"SIREP OASES NEXUS WEFEH-DZ est une entreprise algérienne multidisciplinaire qui réunit ingénierie, services numériques, énergie, agriculture, mesure, étalonnage, inspection et intelligence des ressources.",
    platformBody:"FOGGARA-DZ en est le cœur numérique : une plateforme nationale intégrée qui relie terrain, données, preuves, analyses et décisions à travers l’Eau, l’Énergie, l’Alimentation, les Écosystèmes et la Santé.",
    aboutAction:"Découvrir SIREP",contactAction:"Nous contacter",servicesTitle:"NOS SERVICES",servicesBody:"Des services de terrain et numériques reliés à une même chaîne de preuve et de décision.",
    services:["EAU, IRRIGATION & POMPAGE","ÉNERGIE & EFFICACITÉ","AGRICULTURE & PRODUCTION DURABLE","MESURE, ÉTALONNAGE & INSPECTION","PLATEFORMES NUMÉRIQUES, SIG, IOT & IA"],
    demoEyebrow:"FOGGARA-DZ / DÉMO OPÉRATIONNELLE",demoTitle:"UNE DÉMO QUI OUVRE SUR DE VRAIS OUTILS",demoBody:"Le visiteur peut entrer sans mot de passe, voir les compteurs réels du salon et accéder aux modules publics. Les espaces authentifiés conservent les flux SIG, agriculture, preuves et décisions existants.",demoOpen:"Ouvrir la démo",demoServices:"Services agricoles",demoWorkspace:"Espace opérationnel",live:"EN DIRECT"
  }:lang==="en"?{
    aboutTitle:"WHO WE ARE",
    aboutBody:"SIREP OASES NEXUS WEFEH-DZ is an Algerian multidisciplinary company combining engineering, digital services, energy, agriculture, measurement, calibration, inspection and resource intelligence.",
    platformBody:"FOGGARA-DZ is its digital core: a national integrated platform connecting field reality, data, evidence, analysis and decisions across Water, Energy, Food, Ecosystems and Health.",
    aboutAction:"Discover SIREP",contactAction:"Contact us",servicesTitle:"OUR SERVICES",servicesBody:"Field and digital services connected through one evidence and decision chain.",
    services:["WATER, IRRIGATION & PUMPING","ENERGY & EFFICIENCY","SUSTAINABLE AGRICULTURE & PRODUCTION","MEASUREMENT, CALIBRATION & INSPECTION","DIGITAL PLATFORMS, GIS, IOT & AI"],
    demoEyebrow:"FOGGARA-DZ / OPERATIONAL DEMO",demoTitle:"A DEMO THAT OPENS REAL TOOLS",demoBody:"Visitors can enter without a password, see live expo counters and use public modules. Authenticated workspaces keep the existing GIS, agriculture, evidence and decision flows.",demoOpen:"Open demo",demoServices:"Agricultural services",demoWorkspace:"Operational workspace",live:"LIVE"
  }:{
    aboutTitle:"من نحن",
    aboutBody:"SIREP OASES NEXUS WEFEH-DZ مؤسسة جزائرية متعددة التخصصات تجمع الهندسة والخدمات الرقمية والطاقة والزراعة والقياس والمعايرة والتفتيش وذكاء الموارد.",
    platformBody:"FOGGARA-DZ هي القلب الرقمي للمؤسسة: منصة وطنية متكاملة تربط الواقع الميداني والبيانات والأدلة والتحليل والقرار عبر المياه والطاقة والغذاء والنظم البيئية والصحة.",
    aboutAction:"تعرف على SIREP",contactAction:"تواصل معنا",servicesTitle:"خدماتنا",servicesBody:"خدمات ميدانية ورقمية مترابطة ضمن سلسلة واحدة للأدلة والتحليل والقرار.",
    services:["المياه والري والضخ","الطاقة والكفاءة","الزراعة والإنتاج المستدام","القياس والمعايرة والتفتيش","المنصات الرقمية وGIS وIoT والذكاء الاصطناعي"],
    demoEyebrow:"FOGGARA-DZ / ديمو تشغيلي",demoTitle:"ديمو يفتح أدوات حقيقية",demoBody:"يمكن للزائر الدخول بدون كلمة مرور ورؤية عدادات المعرض الحقيقية واستعمال الوحدات العامة، بينما تبقى مساحات GIS والزراعة والأدلة والقرار مرتبطة بمسارات العمل والمصادقة الحالية.",demoOpen:"فتح الديمو",demoServices:"الخدمات الزراعية",demoWorkspace:"مساحة العمل",live:"مباشر"
  };
  const toolCopy=lang==="fr"?{
    eyebrow:"FOGGARA / TOOL DECK",title:"Choisissez un service. Commencez immédiatement.",body:"Une interface orientée outils : recherche rapide, accès direct et résultats traçables.",search:"Rechercher satellite, météo, sol, SIG, IA…",open:"Ouvrir",public:"PUBLIC",workspace:"ESPACE",noResults:"Aucun service ne correspond.",qrTitle:"Accès visiteur au salon",qrBody:"Scannez pour ouvrir directement le mode AGRITECH sans compte.",scan:"Ouvrir",copy:"Copier",copied:"Copié",download:"Télécharger SVG",quick:"Accès rapide"
  }:lang==="en"?{
    eyebrow:"FOGGARA / TOOL DECK",title:"Pick a service. Start immediately.",body:"A tool-first interface: fast search, direct entry and traceable results.",search:"Search satellite, weather, soil, GIS, AI…",open:"Open",public:"PUBLIC",workspace:"WORKSPACE",noResults:"No matching service.",qrTitle:"Expo visitor access",qrBody:"Scan to open AGRITECH visitor mode directly without an account.",scan:"Open",copy:"Copy link",copied:"Copied",download:"Download SVG",quick:"Quick access"
  }:{
    eyebrow:"FOGGARA / TOOL DECK",title:"اختر الخدمة وابدأ مباشرة.",body:"واجهة موجهة للأدوات: بحث سريع، دخول مباشر، ونتائج قابلة للتتبع.",search:"ابحث: أقمار، طقس، تربة، GIS، ذكاء…",open:"فتح",public:"عام",workspace:"مساحة عمل",noResults:"لا توجد خدمة مطابقة.",qrTitle:"دخول زوار المعرض",qrBody:"امسح الرمز لفتح وضع AGRITECH مباشرة بدون حساب.",scan:"فتح",copy:"نسخ الرابط",copied:"تم النسخ",download:"تحميل SVG",quick:"دخول سريع"
  };

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

  const toolLabels=lang==="fr"?{
    expo:["Mode AGRITECH","Carte live, compteur visiteurs et feedback public."],
    satellite:["Intelligence satellite","Sentinel-2 réel, NDVI, EVI, SAVI, NDWI, NDMI, LSWI et BSI."],
    weather:["Météo agricole","Prévision jusqu’à 15 jours avec ET₀, pluie, vent et rayonnement."],
    soil:["Sol & eau","Services d’analyse, mesures, provenance et preuves."],
    gis:["SIG & parcelles","Cartographie, contours de parcelles et couches géospatiales."],
    ai:["Conseiller IA local","Interprétation des preuves avec Ollama/LLM local, sans inventer de mesures."]
  }:lang==="en"?{
    expo:["AGRITECH mode","Live map, visitor counter and public feedback."],
    satellite:["Satellite intelligence","Real Sentinel-2 with NDVI, EVI, SAVI, NDWI, NDMI, LSWI and BSI."],
    weather:["Agricultural weather","Up to 15-day forecast with ET₀, rain, wind and radiation."],
    soil:["Soil & water","Analysis services, measurements, provenance and evidence."],
    gis:["GIS & parcels","Mapping, parcel boundaries and geospatial layers."],
    ai:["Local AI advisory","Evidence interpretation with local Ollama/LLM without inventing measurements."]
  }:{
    expo:["وضع AGRITECH","خريطة حية، عداد الزوار، واستطلاع رأي عام."],
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
  useEffect(()=>{let cancelled=false;api.get<{visitors:number;feedback:number}>("/expo/stats").then(value=>{if(!cancelled)setExpoStats(value);}).catch(()=>undefined);return()=>{cancelled=true;};},[]);
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
  return <div className="fg-public fg-landing" dir={i18n.dir()} lang={i18n.language}>
    <nav className="fg-public-nav" aria-label={t("publicExperience.navigation")}>
      <a href="#about">{t("publicExperience.about")}</a><a href="#tools">{companyCopy.servicesTitle}</a>
      <Link to="/presentation">{t("publicExperience.presentation")}</Link><Link to="/contact">{t("publicExperience.contact")}</Link>
    </nav>
    <section className="fg-landing-hero" aria-labelledby="foggara-title">
      <picture className="fg-oasis-image"><source media="(max-width: 650px)" srcSet="/images/oasis-dawn-mobile.webp"/><img src="/images/oasis-dawn.webp" alt="" width="1891" height="831" fetchPriority="high" decoding="async"/></picture>
      <div className="fg-landing-copy">
        <h1 id="foggara-title">{heritage.title}<br/><em>{heritage.accent}</em></h1>
        <p className="fg-landing-intro">{heritage.body}</p>
        <div className="fg-hero-actions"><a className="fg-button fg-secondary" href="#tools">{heritage.discover}<ArrowUpRight size={17}/></a><Link className="fg-heritage-visitor" to={user?"/app":"/expo"}>{user?t("publicExperience.enter"):heritage.visit}<ArrowUpRight size={16}/></Link></div>
      </div>
      <div className="fg-heritage-bottom"><span dir="ltr">WATER · ENERGY · FOOD · ECOSYSTEM · HEALTH</span><a href="#tools">{heritage.scroll}<ArrowDown size={16}/></a><span className="fg-heritage-image-notice">{t("demo.imageNotice")}</span></div>
    </section>
    <section className="fg-about-showcase" id="about" aria-labelledby="fg-about-title">
      <div className="fg-about-copy">
        <p className="fg-eyebrow">SIREP OASES NEXUS WEFEH-DZ</p>
        <h2 id="fg-about-title">{companyCopy.aboutTitle}</h2>
        <p className="fg-about-lede">{companyCopy.aboutBody}</p>
        <p>{companyCopy.platformBody}</p>
        <div className="fg-about-actions"><Link className="fg-button" to="/about">{companyCopy.aboutAction}<ArrowUpRight size={17}/></Link><Link className="fg-link" to="/contact">{companyCopy.contactAction}<ArrowUpRight size={16}/></Link></div>
      </div>
      <div className="fg-about-media" aria-label={companyCopy.aboutTitle}>
        <figure className="fg-about-media-primary"><img src="/images/oasis-dawn.webp" alt="" loading="lazy" decoding="async"/></figure>
        <figure className="fg-about-media-secondary"><img src="/images/oasis-hero.webp" alt="" loading="lazy" decoding="async"/></figure>
        <div className="fg-about-brand-card"><img src="/sirep-brand.svg" alt="SIREP OASES NEXUS WEFEH-DZ" loading="lazy"/><span dir="ltr">ENGINEERING · DIGITAL · FIELD EVIDENCE · WEFEH</span></div>
      </div>
    </section>
    <section className="fg-service-ribbon" aria-labelledby="fg-services-title">
      <div className="fg-service-ribbon-copy"><p className="fg-eyebrow">SIREP / WEFEH</p><h2 id="fg-services-title">{companyCopy.servicesTitle}</h2><p>{companyCopy.servicesBody}</p></div>
      <div className="fg-service-ribbon-grid">{companyCopy.services.map((service,index)=><article key={service}><span dir="ltr">0{index+1}</span><h3>{service}</h3></article>)}</div>
    </section>
    <section className="fg-live-demo" id="demo" aria-labelledby="fg-demo-title">
      <div className="fg-demo-visual">
        <img src="/images/oasis-hero.webp" alt="" loading="lazy" decoding="async"/>
        <div className="fg-demo-live-badge"><span></span>{companyCopy.live}</div>
        <div className="fg-demo-stats"><span><strong>{expoStats.visitors}</strong>{expoCopy.visitors}</span><span><strong>{expoStats.feedback}</strong>{expoCopy.feedback}</span><span><strong>{WILAYAS.length}</strong>{narrative.national}</span></div>
      </div>
      <div className="fg-demo-copy">
        <p className="fg-eyebrow">{companyCopy.demoEyebrow}</p><h2 id="fg-demo-title">{companyCopy.demoTitle}</h2><p>{companyCopy.demoBody}</p>
        <div className="fg-demo-actions"><Link className="fg-button" to="/expo">{companyCopy.demoOpen}<ArrowUpRight size={17}/></Link><Link className="fg-link" to="/agriculture-services">{companyCopy.demoServices}<ArrowUpRight size={16}/></Link><Link className="fg-link" to={user?"/app":"/register"}>{companyCopy.demoWorkspace}<ArrowUpRight size={16}/></Link></div>
        <div className="fg-demo-qr">
          <a href={expoUrl} target="_blank" rel="noreferrer" aria-label={toolCopy.scan}><img src="/expo-qr.svg" alt={toolCopy.qrTitle} width="124" height="124"/></a>
          <div><strong>{toolCopy.qrTitle}</strong><p>{toolCopy.qrBody}</p><div className="fg-demo-qr-actions"><button type="button" onClick={()=>void copyExpoLink()}>{qrCopied?<Check size={15}/>:<Copy size={15}/>} {qrCopied?toolCopy.copied:toolCopy.copy}</button><a href="/expo-qr.svg" download="FOGGARA-AGRITECH-EXPO-QR.svg"><Download size={15}/>{toolCopy.download}</a></div></div>
        </div>
      </div>
    </section>
    <section className="fg-tool-hub" id="tools" aria-labelledby="fg-tool-title">
      <div className="fg-tool-panel">
        <div className="fg-tool-heading"><div><p className="fg-eyebrow">{toolCopy.eyebrow}</p><h2 id="fg-tool-title">{toolCopy.title}</h2><p>{toolCopy.body}</p></div><span className="fg-tool-count" dir="ltr">{visibleTools.length}/{toolDeck.length}</span></div>
        <label className="fg-tool-command"><Search size={20}/><input ref={toolSearchRef} value={toolQuery} onChange={e=>setToolQuery(e.target.value)} placeholder={toolCopy.search} aria-label={toolCopy.search}/><kbd dir="ltr">Ctrl/⌘ K</kbd></label>
        <div className="fg-tool-grid">
          {visibleTools.map(({key,Icon,to,scope,title,body})=><Link to={to} className="fg-tool-card" key={key}>
            <span className="fg-tool-icon"><Icon size={22}/></span><span className="fg-tool-meta">{scope==="public"?toolCopy.public:toolCopy.workspace}</span>
            <h3>{title}</h3><p>{body}</p><span className="fg-tool-open">{toolCopy.open}<ArrowUpRight size={15}/></span>
          </Link>)}
          {visibleTools.length===0&&<p className="fg-tool-empty">{toolCopy.noResults}</p>}
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
    <footer className="fg-landing-footer"><span dir="ltr">FOGGARA-DZ · SIREP OASES NEXUS WEFEH-DZ</span><nav aria-label={t("publicExperience.legal")}><Link to="/privacy">{t("publicExperience.privacy")}</Link><Link to="/terms">{t("publicExperience.terms")}</Link><Link to="/rights">{t("publicExperience.rights")}</Link></nav><p>{t("publicExperience.scope")}</p><a href="#foggara-title" className="fg-link">{t("publicExperience.top")}<ArrowDown className="fg-up" size={14}/></a></footer>
  </div>;
}

