import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Workflow, ArrowUpRight, ArrowDown, Droplets, Zap, Wheat, Leaf, HeartPulse, FolderKanban, ShieldCheck, Users, LockKeyhole, MapPinned, Database, BrainCircuit } from "lucide-react";
import { useAuth } from "@/context/useAuth";
import { NexusKasria } from "@/components/NexusKasria";
import { WorkflowGuide } from "@/components/WorkflowGuide";
import { AgroCapabilities } from "@/components/AgroCapabilities";
import { ServiceOfferings } from "@/components/ServiceOfferings";
import { WILAYAS } from "@/lib/wilayas";
import "./operations.css";
import "./landing.css";
const domains = [{key:"water",Icon:Droplets},{key:"energy",Icon:Zap},{key:"food",Icon:Wheat},{key:"ecosystem",Icon:Leaf},{key:"health",Icon:HeartPulse}];
const workspaces = [{key:"projects",Icon:FolderKanban,to:"/app/projects"},{key:"review",Icon:ShieldCheck,to:"/app/review"},{key:"dataRoom",Icon:LockKeyhole,to:"/app/vde"}];
export default function Landing() {
  const {user}=useAuth(); const {t,i18n}=useTranslation(); const [active,setActive]=useState("all");
  const lang=i18n.language==="fr"?"fr":i18n.language==="en"?"en":"ar";
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
  return <div className="fg-public fg-landing" dir={i18n.dir()} lang={i18n.language}>
    <nav className="fg-public-nav" aria-label={t("publicExperience.navigation")}>
      <a href="#ecosystem">{t("publicExperience.ecosystem")}</a><a href="#collaboration">{t("publicExperience.collaboration")}</a>
      <Link to="/presentation">{t("publicExperience.presentation")}</Link><Link to="/contact">{t("publicExperience.contact")}</Link>
    </nav>
    <section className="fg-landing-hero" aria-labelledby="foggara-title">
      <picture className="fg-oasis-image"><source media="(max-width: 650px)" srcSet="/images/oasis-hero-mobile.webp"/><img src="/images/oasis-hero.webp" alt="" width="1891" height="831" fetchPriority="high" decoding="async"/></picture>
      <div className="fg-landing-copy"><p className="fg-eyebrow" dir="ltr">SIREP OASES NEXUS WEFEH-DZ</p>
        <p className="fg-landing-kicker">{t("publicExperience.kicker")}</p>
        <h1 id="foggara-title">{t("publicExperience.title")}<br/><em>{t("publicExperience.titleAccent")}</em></h1>
        <p className="fg-landing-intro">{t("publicExperience.intro")}</p>
        <div className="fg-hero-actions"><Link className="fg-button" to={user?"/app":"/login"}>{t("publicExperience.enter")}<ArrowUpRight size={18}/></Link>
          <Link className="fg-button fg-secondary" to="/demo">{t("demo.try")}</Link></div>
        <p className="fg-landing-trust"><ShieldCheck size={16}/>{t("publicExperience.trust")}</p>
        <p className="fg-oasis-caption">{t("demo.imageNotice")}</p>
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
