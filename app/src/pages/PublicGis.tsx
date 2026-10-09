import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Globe2, MapPinned, Ruler, ShieldCheck } from "lucide-react";
import { NationalMap } from "@/components/NationalMap";
import { useAuth } from "@/context/useAuth";
import { WILAYAS } from "@/lib/wilayas";
import "./public-gis.css";

const labels={
  ar:{
    kicker:"FOGGARA-DZ / نظام المعلومات الجغرافية",
    heading:"استكشف جغرافيا الجزائر قبل تسجيل الدخول",
    description:"خريطة وطنية مفتوحة مبنية على MapLibre وOpenStreetMap عبر OpenFreeMap. اختر منطقة على الخريطة، قِس المسافات والمساحات، واستكشف التضاريس. سجلات المؤسسات ونتائج تحليل قطعها تتطلب حسابًا.",
    private:"فتح مساحة GIS الخاصة",
    signIn:"تسجيل الدخول إلى GIS",
    workspace:"الدخول إلى مساحة GIS",
    visit:"الخريطة العامة",
    warning:"هذا عرض جغرافي عام، ولا يعرض قطعًا أو قياسات ميدانية أو تحاليل أقمار صناعية تخص أي مؤسسة.",
    details:"الأدوات المتاحة للجميع",
    measurement:"قياس المسافات والمساحات",
    area:"تحديد منطقة على الخريطة",
    national:"خريطة الجزائر العامة",
    coordinates:"حدود العرض الحالي (WGS84)",
    source:"المصادر المفتوحة"
  },
  fr:{
    kicker:"FOGGARA-DZ / SYSTÈME D’INFORMATION GÉOGRAPHIQUE",
    heading:"Explorer la géographie algérienne sans compte",
    description:"Carte nationale ouverte propulsée par MapLibre et OpenStreetMap via OpenFreeMap. Sélectionnez une zone, mesurez les distances et surfaces et explorez le relief. Les données privées des organisations exigent un compte.",
    private:"Accéder au SIG privé",
    signIn:"Se connecter au SIG",
    workspace:"Ouvrir le SIG opérationnel",
    visit:"Carte publique",
    warning:"Cette carte publique ne présente aucune parcelle privée, mesure terrain ou résultat satellite appartenant aux organisations.",
    details:"Outils disponibles au public",
    measurement:"Mesure de distance et surface",
    area:"Sélection d’une zone sur la carte",
    national:"Carte nationale d’Algérie",
    coordinates:"Emprise visible (WGS84)",
    source:"Logiciels et données libres"
  },
  en:{
    kicker:"FOGGARA-DZ / GEOGRAPHIC INFORMATION SYSTEM",
    heading:"Explore Algeria's geography without signing in",
    description:"An open national map using MapLibre and OpenStreetMap through OpenFreeMap. Select an area, measure distance and surface, and explore relief. Organization parcels and operational analysis require a signed-in account.",
    private:"Open private GIS workspace",
    signIn:"Sign in to GIS",
    workspace:"Open operational GIS",
    visit:"Public map",
    warning:"This public map does not expose any organization's private parcels, field measurements or satellite analysis results.",
    details:"Tools you can use now",
    measurement:"Distance and area measurement",
    area:"Select an area on the map",
    national:"National Algeria map",
    coordinates:"Current map bounds (WGS84)",
    source:"Open source and open data"
  }
} as const;

export default function PublicGis(){
  const {i18n}=useTranslation();
  const {user}=useAuth();
  const lang=i18n.language==="fr"?"fr":i18n.language==="en"?"en":"ar";
  const t=labels[lang];
  const [viewport,setViewport]=useState<[number,number,number,number]|null>(null);
  const [retry,setRetry]=useState(0);
  return <main className="fg-public-gis" dir={lang==="ar"?"rtl":"ltr"} lang={lang}>
    <header className="fg-public-gis-intro">
      <div>
        <p className="fg-public-gis-kicker"><Globe2 size={17}/>{t.kicker}</p>
        <h1>{t.heading}</h1>
        <p>{t.description}</p>
      </div>
      <Link className="fg-public-gis-cta" to={user?"/app/gis":"/login"} state={user?undefined:{from:{pathname:"/app/gis"}}}>
        {user?t.workspace:t.signIn}<ArrowUpRight size={18}/>
      </Link>
    </header>
    <section aria-label={t.visit} className="fg-public-gis-map">
      <NationalMap key={retry} sites={[]} wilayas={WILAYAS} locale={lang} onViewportChange={setViewport}/>
      <div className="fg-public-gis-actions">
        <button type="button" onClick={()=>setRetry(n=>n+1)}>{lang==="ar"?"إعادة تحميل الخريطة":lang==="fr"?"Recharger la carte":"Reload map"}</button>
        <a href="https://www.openstreetmap.org/#map=5/28.0/2.6" target="_blank" rel="noopener noreferrer">{lang==="ar"?"خريطة بديلة في OpenStreetMap":lang==="fr"?"Carte de secours OpenStreetMap":"OpenStreetMap fallback"}</a>
        {viewport?<span dir="ltr">{t.coordinates}: {viewport.map(x=>x.toFixed(3)).join(" · ")}</span>:null}
      </div>
    </section>
    <section className="fg-public-gis-footer">
      <div><h2>{t.details}</h2><p><MapPinned size={18}/>{t.national}</p><p><Ruler size={18}/>{t.measurement}</p><p><Globe2 size={18}/>{t.area}</p></div>
      <div className="fg-public-gis-privacy"><ShieldCheck size={24}/><p>{t.warning}</p><small>{t.source}: <a href="https://maplibre.org/" target="_blank" rel="noopener noreferrer">MapLibre GL JS</a> · <a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · OpenStreetMap © contributors</small></div>
    </section>
  </main>;
}
