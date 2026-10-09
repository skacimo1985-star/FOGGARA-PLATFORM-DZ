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
import {OasisHeroMedia} from "@/components/FoggaraVisualStory";
import {FoggaraSourceDeck} from "@/components/FoggaraSourceDeck";
import "./oasis-original-landing.css";
import "@/components/foggara-visual-story.css";
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
    {key:"gis",Icon:Map,to:user?"/app/gis":"/gis",scope:user?"workspace":"public"},
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
  const restoredContent={
    ar:{
      kicker:"خدمات مرتبطة بالميدان",
      title:"الزراعة والمياه والذكاء الجغرافي",
      services:[
        ["إدارة المياه والري","القياسات، الآبار، الضخ، جودة المياه والتوصيات الموثقة.","/agriculture-services"],
        ["تحليل القطع والمحاصيل","صور Sentinel-2 ومؤشرات الغطاء النباتي والطقس المرتبطة بالقطعة.","/app/agriculture"],
        ["الخرائط والتوأم المكاني","تحديد المواقع والقطع وربط الموارد بالمشروعات والأدلة.","/app/gis"]
      ],
      gallery:"صور من تراث الواحات وهندسة الموارد",
      imageLabels:["واحة جزائرية","الفقارة وتوزيع المياه","نظام الفقارة والموارد"],
      deck:"العرض التفاعلي لمنصة فقارة",
      deckText:"الشرائح الثماني من العرض المرفق: من تحديد الأرض والأقمار الصناعية إلى الأدلة والقرار، مع صور الفقارة والواحات."
    },
    fr:{
      kicker:"Des services reliés au terrain",
      title:"Agriculture, eau et intelligence géospatiale",
      services:[
        ["Eau et irrigation","Mesures, forages, pompage, qualité de l'eau et conseils traçables.","/agriculture-services"],
        ["Parcelles et cultures","Sentinel-2, indices de végétation et météo liés aux parcelles.","/app/agriculture"],
        ["SIG et jumeau numérique","Cartographie des parcelles, ressources, projets et preuves.","/app/gis"]
      ],
      gallery:"Patrimoine des oasis et ingénierie des ressources",
      imageLabels:["Oasis algérienne","Foggara et partage de l'eau","Patrimoine de la foggara"],
      deck:"Présentation interactive FOGGARA",
      deckText:"Les huit diapositives du support fourni, du terrain et du satellite à la preuve, aux décisions et à l’écosystème, enrichies des images des oasis."
    },
    en:{
      kicker:"Services connected to the field",
      title:"Agriculture, water and geospatial intelligence",
      services:[
        ["Water and irrigation","Measurements, wells, pumps, water quality and traceable advice.","/agriculture-services"],
        ["Parcels and crops","Sentinel-2, vegetation indices and field-linked weather.","/app/agriculture"],
        ["GIS and spatial twin","Map parcels and connect resources, projects and evidence.","/app/gis"]
      ],
      gallery:"Oasis heritage and resource engineering",
      imageLabels:["Algerian oasis","Foggara water sharing","Foggara heritage"],
      deck:"FOGGARA interactive presentation",
      deckText:"The eight supplied slides, from terrain and satellite observation to evidence, decisions and the national ecosystem, with integrated oasis imagery."
    }
  }[lang];
  return <div className="fg-public fg-landing" dir={i18n.dir()} lang={i18n.language}>
    <nav className="fg-public-nav" aria-label={t("publicExperience.navigation")}>
      <a href="#ecosystem">{t("publicExperience.ecosystem")}</a><a href="#collaboration">{t("publicExperience.collaboration")}</a>
      <Link to="/presentation">{t("publicExperience.presentation")}</Link><Link to="/contact">{t("publicExperience.contact")}</Link>
    </nav>
    <section className="fg-landing-hero" aria-labelledby="foggara-title">
      <OasisHeroMedia lang={lang}/>
      <div className="fg-landing-copy">
        <h1 id="foggara-title">{heritage.title}<br/><em>{heritage.accent}</em></h1>
        <p className="fg-landing-intro">{heritage.body}</p>
        <div className="fg-hero-actions"><a className="fg-button fg-secondary" href="#tools">{heritage.discover}<ArrowUpRight size={17}/></a><Link className="fg-heritage-visitor" to={user?"/app":"/expo"}>{user?t("publicExperience.enter"):heritage.visit}<ArrowUpRight size={16}/></Link></div>
      </div>
      <div className="fg-heritage-bottom"><span dir="ltr">WATER · ENERGY · FOOD · ECOSYSTEM · HEALTH</span><a href="#tools">{heritage.scroll}<ArrowDown size={16}/></a><span className="fg-heritage-image-notice">{t("demo.imageNotice")}</span></div>
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
    <section className="fg-heritage-expo" aria-label={toolCopy.qrTitle}>
      <div><p className="fg-eyebrow">AGRITECH / FOGGARA</p><h2>{toolCopy.qrTitle}</h2><p>{toolCopy.qrBody}</p><Link className="fg-link" to={user?"/app":"/register"}>{user?t("publicExperience.enter"):expoCopy.operate}<ArrowUpRight size={16}/></Link><p className="fg-landing-trust"><Users size={16}/><strong>{expoStats.visitors}</strong> {expoCopy.visitors} · <strong>{expoStats.feedback}</strong> {expoCopy.feedback} · {expoCopy.noPassword}</p></div>
      <aside className="fg-hero-qr" aria-labelledby="fg-hero-qr-title">
        <div className="fg-hero-qr-head"><div><p className="fg-eyebrow">AGRITECH EXPO / QR</p><h2 id="fg-hero-qr-title">{toolCopy.qrTitle}</h2><p>{toolCopy.qrBody}</p></div><QrCode size={24}/></div>
        <a href={expoUrl} target="_blank" rel="noreferrer" className="fg-hero-qr-code" aria-label={toolCopy.scan}>
          <img src="/expo-qr.svg" alt={toolCopy.qrTitle} width="220" height="220"/>
        </a>
        <div className="fg-hero-qr-actions">
          <Link to="/expo" className="fg-hero-qr-primary">{toolCopy.scan}<ArrowUpRight size={15}/></Link>
          <button type="button" onClick={()=>void copyExpoLink()}>{qrCopied?<Check size={15}/>:<Copy size={15}/>} {qrCopied?toolCopy.copied:toolCopy.copy}</button>
          <a href="/expo-qr.svg" download="FOGGARA-AGRITECH-EXPO-QR.svg"><Download size={15}/>{toolCopy.download}</a>
        </div>
        <div className="fg-hero-qr-capabilities" aria-label={toolCopy.quick}>
          <span>Sentinel-2</span><span>ET₀ / 15d</span><span>Ollama-ready</span>
        </div>
        <small dir="ltr">foggara-dz.onrender.com/expo</small>
      </aside>
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
    <section className="fg-restored-services" id="farm-services" aria-labelledby="fg-restored-services-title">
      <div className="fg-restored-heading"><p className="fg-eyebrow">{restoredContent.kicker}</p><h2 id="fg-restored-services-title">{restoredContent.title}</h2></div>
      <div className="fg-restored-service-grid">{restoredContent.services.map(([title,body,to],index)=>
        <article key={to} className={"fg-restored-service fg-restored-service-"+(index+1)}>
          <span className="fg-restored-service-number" dir="ltr">0{index+1} / WEFEH</span><h3>{title}</h3><p>{body}</p>
          <Link to={to==="/app/gis"&&!user?"/gis":to} className="fg-restored-service-link">{heritage.discover}<ArrowUpRight size={16}/></Link>
        </article>)}</div>
    </section>
    <section className="fg-restored-presentation fg-pptx-presentation" id="oasis-presentation" aria-labelledby="fg-restored-presentation-title">
      <span id="oasis-gallery" className="fg-source-anchor" aria-hidden="true"/>
      <div className="fg-restored-heading"><p className="fg-eyebrow">FOGGARA-DZ · SIREP OASES NEXUS WEFEH</p><h2 id="fg-restored-presentation-title">{restoredContent.deck}</h2><p>{restoredContent.deckText}</p></div>
      <FoggaraSourceDeck lang={lang}/>
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

