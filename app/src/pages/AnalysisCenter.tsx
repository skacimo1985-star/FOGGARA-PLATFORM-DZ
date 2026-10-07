import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Activity, ArrowUpRight, CloudSun, Droplets, Eye, FlaskConical, Leaf,
  MapPinned, Satellite, ShieldCheck, Sprout,
} from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { ErrorText } from "@/components/common";
import ParcelSentinel from "@/features/agriculture/ParcelSentinel";
import { NationalMap, type ParcelBoundaryFeature } from "@/components/NationalMap";
import "./field-intelligence.css";

type Parcel = {
  id: number;
  name: string;
  crop: string;
  area_ha: number;
  location: string;
  stage: string;
  archived: boolean;
  is_demo: boolean;
  lat?: number | null;
  lon?: number | null;
  boundary_geojson?: { type: "Polygon"; coordinates: [number, number][][] } | null;
};

type ParcelBoundaryResponse = {
  type: "FeatureCollection";
  features: ParcelBoundaryFeature[];
};

type Observation = {
  id: number;
  parcel_id: number;
  metric: string;
  value: number;
  unit: string;
  source_type: string;
  source_ref: string | null;
  observed_at: string;
  evidence_status: string;
  is_demo: boolean;
};

type Assessment = {
  evidence_status: string;
  decision_status: string;
  coverage: string[];
  limitations: string[];
};

type Summary = {
  latest_observations: Record<string, {
    value: number;
    unit: string;
    source_type: string;
    observed_at: string;
    evidence_status: string;
  }>;
  soil_assessment: Assessment;
  irrigation_water_assessment: Assessment;
  available_services: {
    soil_screening: boolean;
    irrigation_water_screening: boolean;
    irrigation_planning: boolean;
    vegetation_monitoring: boolean;
    satellite_live: boolean;
    weather_live: boolean;
  };
  provenance: string;
};

const SATELLITE_METRICS = new Set(["ndvi","evi","savi","ndwi","lswi","moisture"]);
const SOIL_METRICS = new Set(["ph","nitrogen","phosphorus","potassium","soc","ec","moisture"]);

export default function AnalysisCenter() {
  const { i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const lang = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const requested = Number(searchParams.get("parcel"));

  const copy = lang === "fr" ? {
    eyebrow:"FOGGARA / ANALYSES", title:"Centre d’analyse de la ressource",
    intro:"Choisissez une parcelle et consultez dans un seul écran les observations, indices satellite, sol, eau d’irrigation et services calculables.",
    parcel:"Parcelle", area:"Superficie", crop:"Culture", location:"Localisation",
    satellite:"Indices satellite", soil:"Analyse du sol", water:"Eau d’irrigation",
    irrigation:"Irrigation", weather:"Météo", observations:"Historique des observations",
    available:"Disponible", missing:"Données requises", configured:"Configuré", disabled:"Non configuré",
    runSatellite:"Lancer Sentinel", openIrrigation:"Calculer l’irrigation", soilWater:"Sol & eau",
    map:"Voir sur la carte", noParcels:"Aucune parcelle. Délimitez d’abord une parcelle sur la carte.",
    draw:"Délimiter une parcelle", metric:"Indicateur", value:"Valeur", source:"Source", evidence:"Preuve", date:"Date",
    coverage:"Couverture", limitations:"Limites", demo:"DEMO", real:"RÉEL", latest:"Dernières valeurs",
    showDemo:"Afficher DEMO", hideDemo:"Masquer DEMO", demoHidden:"Les données DEMO sont masquées par défaut.", fields:"Parcelles réelles", mapFirst:"Carte terrain",
  } : lang === "en" ? {
    eyebrow:"FOGGARA / ANALYSIS", title:"Resource analysis center",
    intro:"Choose a field and inspect observations, satellite indices, soil, irrigation water and computable services in one screen.",
    parcel:"Field", area:"Area", crop:"Crop", location:"Location",
    satellite:"Satellite indices", soil:"Soil analysis", water:"Irrigation water",
    irrigation:"Irrigation", weather:"Weather", observations:"Observation history",
    available:"Available", missing:"Data required", configured:"Configured", disabled:"Not configured",
    runSatellite:"Run Sentinel", openIrrigation:"Calculate irrigation", soilWater:"Soil & water",
    map:"View on map", noParcels:"No fields yet. Draw a field boundary first.",
    draw:"Draw a field", metric:"Metric", value:"Value", source:"Source", evidence:"Evidence", date:"Date",
    coverage:"Coverage", limitations:"Limitations", demo:"DEMO", real:"REAL", latest:"Latest values",
    showDemo:"Show DEMO", hideDemo:"Hide DEMO", demoHidden:"DEMO data is hidden by default.", fields:"Real fields", mapFirst:"Field map",
  } : {
    eyebrow:"FOGGARA / التحاليل", title:"مركز تحليل المورد",
    intro:"اختر قطعة أرض وشاهد في شاشة واحدة القياسات والمؤشرات الفضائية والتربة ومياه الري والخدمات القابلة للحساب.",
    parcel:"القطعة", area:"المساحة", crop:"المحصول", location:"الموقع",
    satellite:"المؤشرات الفضائية", soil:"تحليل التربة", water:"مياه الري",
    irrigation:"الري", weather:"الطقس", observations:"سجل القياسات والمؤشرات",
    available:"متاح", missing:"يحتاج بيانات", configured:"مهيأ", disabled:"غير مهيأ",
    runSatellite:"تشغيل Sentinel", openIrrigation:"حساب الري", soilWater:"تحليل التربة والمياه",
    map:"عرض على الخريطة", noParcels:"لا توجد قطعة. حدّد حدود الأرض أولًا على الخريطة.",
    draw:"تحديد أرض", metric:"المؤشر", value:"القيمة", source:"المصدر", evidence:"الدليل", date:"التاريخ",
    coverage:"التغطية", limitations:"الحدود", demo:"DEMO", real:"حقيقي", latest:"أحدث القيم",
    showDemo:"إظهار DEMO", hideDemo:"إخفاء DEMO", demoHidden:"بيانات DEMO مخفية افتراضيًا.", fields:"القطع الحقيقية", mapFirst:"خريطة الحقول",
  };

  const [parcels,setParcels]=useState<Parcel[]>([]);
  const [boundaries,setBoundaries]=useState<ParcelBoundaryFeature[]>([]);
  const [showDemo,setShowDemo]=useState(searchParams.get("demo")==="1");
  const [parcelId,setParcelId]=useState<number|null>(Number.isInteger(requested)&&requested>0?requested:null);
  const [summary,setSummary]=useState<Summary|null>(null);
  const [observations,setObservations]=useState<Observation[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<unknown>(null);
  const [reloadToken,setReloadToken]=useState(0);

  useEffect(()=>{
    let cancelled=false;
    setLoading(true);
    Promise.all([
      api.get<Parcel[]>("/agriculture/parcels"),
      api.get<ParcelBoundaryResponse>("/gis/parcels.geojson"),
    ])
      .then(([rows,geo])=>{
        if(cancelled)return;
        setParcels(rows.filter(row=>!row.archived));
        setBoundaries(geo.features);
      })
      .catch(err=>{if(!cancelled)setError(err);})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[]);

  const visibleParcels=useMemo(
    ()=>parcels.filter(row=>showDemo || !row.is_demo),
    [parcels,showDemo],
  );
  const visibleIds=useMemo(()=>new Set(visibleParcels.map(row=>row.id)),[visibleParcels]);
  const visibleBoundaries=useMemo(
    ()=>boundaries.filter(feature=>visibleIds.has(feature.id)),
    [boundaries,visibleIds],
  );

  useEffect(()=>{
    const requestedAllowed=Number.isInteger(requested)&&requested>0&&visibleIds.has(requested);
    const currentAllowed=parcelId!=null&&visibleIds.has(parcelId);
    const next=requestedAllowed?requested:(currentAllowed?parcelId:(visibleParcels[0]?.id??null));
    if(next!==parcelId)setParcelId(next);
    const params=new URLSearchParams(searchParams);
    if(next)params.set("parcel",String(next));else params.delete("parcel");
    if(showDemo)params.set("demo","1");else params.delete("demo");
    setSearchParams(params,{replace:true});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[parcels,showDemo]);

  useEffect(()=>{
    if(!parcelId){setSummary(null);setObservations([]);return;}
    let cancelled=false;
    setLoading(true);setError(null);
    Promise.all([
      api.get<Summary>(`/agriculture/parcels/${parcelId}/service-summary`),
      api.get<Observation[]>(`/agriculture/observations?parcel_id=${parcelId}`),
    ]).then(([s,o])=>{if(!cancelled){setSummary(s);setObservations(o);}})
      .catch(err=>{if(!cancelled)setError(err);})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[parcelId,reloadToken]);

  const parcel=visibleParcels.find(row=>row.id===parcelId)??null;
  const satelliteRows=useMemo(()=>observations.filter(row=>SATELLITE_METRICS.has(row.metric)).slice(0,12),[observations]);
  const soilRows=useMemo(()=>observations.filter(row=>SOIL_METRICS.has(row.metric)).slice(0,12),[observations]);

  const setParcel=(value:number)=>{
    setParcelId(value);
    const params=new URLSearchParams(searchParams);
    params.set("parcel",String(value));
    if(showDemo)params.set("demo","1");else params.delete("demo");
    setSearchParams(params,{replace:true});
  };
  const toggleDemo=()=>{
    const next=!showDemo;
    setShowDemo(next);
    const params=new URLSearchParams(searchParams);
    if(next)params.set("demo","1");else params.delete("demo");
    if(!next&&parcel?.is_demo)params.delete("parcel");
    setSearchParams(params,{replace:true});
  };

  if(!loading && visibleParcels.length===0){
    return <div className="space-y-5" dir={i18n.dir()}>
      <header className="rounded-2xl border bg-card p-6"><p className="text-xs font-bold tracking-[.16em] text-emerald-700">{copy.eyebrow}</p><h1 className="mt-2 text-3xl font-bold">{copy.title}</h1><p className="mt-2 text-sm text-muted-foreground">{copy.intro}</p></header>
      <div className="rounded-2xl border bg-card p-8 text-center"><p>{copy.noParcels}</p><Link className="os-primary mt-5" to="/app/gis"><MapPinned size={17}/>{copy.draw}</Link></div>
    </div>;
  }

  return <div className="fg-analysis-workspace" dir={i18n.dir()} data-testid="analysis-center">
    <header className="fg-analysis-toolbar">
      <div>
        <p>{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <span>{copy.demoHidden}</span>
      </div>
      <div className="fg-analysis-toolbar-actions">
        <button type="button" onClick={toggleDemo} className={showDemo?"demo-on":""}><Eye size={15}/>{showDemo?copy.hideDemo:copy.showDemo}</button>
        <Link to="/app/gis" className="primary"><MapPinned size={16}/>{copy.draw}</Link>
      </div>
    </header>

    <ErrorText error={error}/>

    <section className="fg-analysis-map-first" data-testid="analysis-map-first">
      <aside className="fg-analysis-field-list">
        <div className="fg-analysis-field-list-head"><div><span>{copy.fields}</span><strong>{visibleParcels.length}</strong></div><MapPinned size={18}/></div>
        <div className="fg-analysis-field-items">
          {visibleParcels.map(row=><button key={row.id} type="button" className={row.id===parcelId?"active":""} onClick={()=>setParcel(row.id)}>
            <div><strong>{row.name}</strong><small>{row.crop||"—"} · {Number(row.area_ha).toFixed(2)} ha</small></div>
            <Badge variant="outline">{row.is_demo?copy.demo:copy.real}</Badge>
          </button>)}
        </div>
      </aside>
      <div className="fg-analysis-map-canvas">
        <NationalMap
          sites={[]}
          wilayas={[]}
          parcelBoundaries={visibleBoundaries}
          selectedParcelId={parcelId}
          onSelectParcel={setParcel}
          locale={lang}
          minimal
        />
        {parcel?<div className="fg-analysis-map-caption"><div><strong>{parcel.name}</strong><span>{parcel.location||"—"} · {Number(parcel.area_ha).toFixed(2)} ha</span></div><Link to={`/app/gis?parcel=${parcel.id}`}>{copy.map}<ArrowUpRight size={14}/></Link></div>:null}
      </div>
    </section>

    <section className="fg-analysis-live-console" data-testid="analysis-live-sentinel">
      <ParcelSentinel
        parcels={visibleParcels}
        selectedParcelId={parcelId}
        onSaved={() => setReloadToken(value => value + 1)}
      />
    </section>

    {parcel ? <section className="fg-analysis-legacy grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[[copy.area,`${parcel.area_ha.toFixed(2)} ha`],[copy.crop,parcel.crop],[copy.location,parcel.location],[copy.parcel,parcel.is_demo?copy.demo:copy.real]].map(([label,value])=><article key={label} className="rounded-xl border bg-card p-4"><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-1 block text-base">{value}</strong></article>)}
    </section>:null}

    <section className="fg-analysis-legacy grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {[
        [copy.satellite,summary?.available_services.satellite_live,Satellite,"LIVE STAC"],
        [copy.soil,summary?.available_services.soil_screening,FlaskConical,summary?.soil_assessment.evidence_status],
        [copy.water,summary?.available_services.irrigation_water_screening,Droplets,summary?.irrigation_water_assessment.evidence_status],
        [copy.irrigation,summary?.available_services.irrigation_planning,Sprout,summary?.available_services.irrigation_planning?copy.available:copy.missing],
        [copy.weather,summary?.available_services.weather_live,CloudSun,summary?.available_services.weather_live?copy.configured:copy.disabled],
      ].map(([label,ready,Icon,detail])=>{
        const C=Icon as typeof Satellite;
        return <article key={String(label)} className={`rounded-xl border p-4 ${ready?"border-emerald-500/30 bg-emerald-500/5":"bg-card"}`}><div className="flex items-center justify-between"><C size={19}/><Badge variant="outline">{ready?copy.available:copy.missing}</Badge></div><strong className="mt-3 block">{String(label)}</strong><small className="mt-1 block text-muted-foreground">{String(detail??"—")}</small></article>;
      })}
    </section>

    <section className="fg-analysis-legacy grid gap-4 xl:grid-cols-2">
      <article className="rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-emerald-700">SATELLITE / EO</p><h2 className="mt-1 text-xl font-bold">{copy.satellite}</h2></div><Satellite size={22}/></div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {satelliteRows.length?satelliteRows.map(row=><div key={row.id} className="rounded-xl border p-3"><span className="text-xs uppercase text-muted-foreground">{row.metric}</span><strong className="mt-1 block text-lg" dir="ltr">{Number(row.value).toFixed(3)} {row.unit}</strong><small className="block text-muted-foreground">{row.evidence_status}</small></div>):<p className="col-span-full text-sm text-muted-foreground">{copy.missing}</p>}
        </div>
      </article>
      <article className="rounded-2xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-emerald-700">SOIL / FIELD</p><h2 className="mt-1 text-xl font-bold">{copy.soil}</h2></div><Leaf size={22}/></div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {soilRows.length?soilRows.map(row=><div key={row.id} className="rounded-xl border p-3"><span className="text-xs uppercase text-muted-foreground">{row.metric}</span><strong className="mt-1 block text-lg" dir="ltr">{Number(row.value).toFixed(3)} {row.unit}</strong><small className="block text-muted-foreground">{row.evidence_status}</small></div>):<p className="col-span-full text-sm text-muted-foreground">{copy.missing}</p>}
        </div>
      </article>
    </section>

    {summary ? <section className="fg-analysis-legacy grid gap-4 xl:grid-cols-2">
      {[ [copy.soil,summary.soil_assessment],[copy.water,summary.irrigation_water_assessment] ].map(([label,assessment])=>{
        const a=assessment as Assessment;
        return <article key={String(label)} className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">{String(label)}</h2><Badge variant="outline">{a.evidence_status}</Badge></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><span className="text-xs text-muted-foreground">{copy.coverage}</span><div className="mt-2 flex flex-wrap gap-1">{a.coverage.length?a.coverage.map(x=><Badge key={x} variant="outline">{x}</Badge>):<span className="text-sm">{copy.missing}</span>}</div></div><div><span className="text-xs text-muted-foreground">{copy.limitations}</span><ul className="mt-2 list-inside list-disc text-xs text-muted-foreground">{a.limitations.map(x=><li key={x}>{x}</li>)}</ul></div></div></article>;
      })}
    </section>:null}

    <section className="fg-analysis-legacy rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-emerald-700">TIMELINE / EVIDENCE</p><h2 className="mt-1 text-xl font-bold">{copy.observations}</h2></div><Activity size={22}/></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b text-start text-xs text-muted-foreground"><th className="p-2 text-start">{copy.metric}</th><th className="p-2 text-start">{copy.value}</th><th className="p-2 text-start">{copy.source}</th><th className="p-2 text-start">{copy.evidence}</th><th className="p-2 text-start">{copy.date}</th></tr></thead><tbody>{observations.slice(0,30).map(row=><tr key={row.id} className="border-b last:border-0"><td className="p-2 font-semibold uppercase">{row.metric}</td><td className="p-2" dir="ltr">{Number(row.value).toFixed(3)} {row.unit}</td><td className="p-2">{row.source_type}</td><td className="p-2"><Badge variant="outline">{row.evidence_status}</Badge></td><td className="p-2 text-xs text-muted-foreground">{new Date(row.observed_at).toLocaleString(i18n.language)}</td></tr>)}</tbody></table></div>
    </section>

    {parcelId ? <section className="flex flex-wrap gap-2">
      <Link className="os-primary" to={`/app/gis?parcel=${parcelId}`}><Satellite size={16}/>{copy.runSatellite}<ArrowUpRight size={15}/></Link>
      <Link className="os-secondary" to={`/app/agriculture?parcel=${parcelId}&section=irrigation`}><Droplets size={16}/>{copy.openIrrigation}</Link>
      <Link className="os-secondary" to={`/app/agriculture?parcel=${parcelId}&section=services`}><ShieldCheck size={16}/>{copy.soilWater}</Link>
      <Link className="os-secondary" to={`/app/gis?parcel=${parcelId}`}><MapPinned size={16}/>{copy.map}</Link>
    </section>:null}
  </div>;
}
