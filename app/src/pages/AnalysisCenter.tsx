import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Activity, ArrowUpRight, CloudSun, Droplets, Eye, FlaskConical, Leaf,
  MapPinned, Satellite, ShieldCheck, Sprout,
} from "lucide-react";
import { api, type Paged } from "@/lib/api";
import type { Project } from "@/types";
import { Badge } from "@/components/ui/badge";
import { ErrorText } from "@/components/common";
import ParcelSentinel from "@/features/agriculture/ParcelSentinel";
import { NationalMap, type AnalysisRasterOverlay, type ParcelBoundaryFeature, type SatelliteRasterOverlay } from "@/components/NationalMap";
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
  site_id?: number | null;
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
  inputs?: Record<string, number>;
  findings?: Array<{ metric: string; level: string; message: string }>;
  actions?: string[];
  measurement_ids?: number[];
  derived?: Record<string, string | number>;
  guidelines?: string[];
  data_gaps?: Array<{
    metric: string;
    unit: string;
    priority: string;
    purpose: string;
    alternatives?: string[];
  }>;
};

type WeatherDay = {
  day: string;
  min_c: number;
  max_c: number;
  rain_mm: number;
  precipitation_probability: number | null;
  eto_mm: number | null;
  wind_speed_kmh: number | null;
  weather_code: number;
};

type WeatherForecast = {
  project_id: number;
  site: { id: number; name: string; wilaya: string; latitude: number; longitude: number };
  provider: string;
  attribution: string;
  attribution_url: string;
  model_name: string;
  fetched_at: string;
  days: WeatherDay[];
  provenance: string;
  verified: boolean;
  field_execution: boolean;
};

type IrrigationPlanResult = {
  id: number;
  result: {
    etc_mm: number;
    net_mm: number;
    gross_mm: number;
    volume_m3: number;
    evidence_status: string;
    decision_status: string;
    method: string;
    formula: string;
    limitations: string[];
  };
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


function AssessmentConsole({
  title,assessment,empty,dataHref,gapActionLabel,
}:{
  title:string;assessment:Assessment|null;empty:string;dataHref?:string;gapActionLabel?:string;
}) {
  if(!assessment) return <div className="fg-service-console"><h2>{title}</h2><p className="fg-service-console-note">{empty}</p></div>;
  const inputs=Object.entries(assessment.inputs??{});
  return <div className="fg-service-console">
    <div className="fg-service-console-head"><FlaskConical size={22}/><div><h2>{title}</h2><p>{assessment.evidence_status} · {assessment.decision_status}</p></div></div>
    {inputs.length?<div className="fg-service-input-grid">{inputs.map(([metric,value])=><div key={metric}><span>{metric.toUpperCase()}</span><strong dir="ltr">{Number(value).toFixed(3)}</strong></div>)}</div>:<p className="fg-service-console-note">{empty}</p>}
    {(assessment.findings??[]).length?<div className="fg-service-findings">{assessment.findings!.map((finding,index)=><article key={`${finding.metric}-${index}`} className={finding.level}><span>{finding.metric.toUpperCase()}</span><strong>{finding.message.replaceAll("_"," ")}</strong><small>{finding.level}</small></article>)}</div>:null}
    {assessment.derived && Object.keys(assessment.derived).length ? <div className="fg-service-derived">
      <strong>DERIVED</strong>
      <div>{Object.entries(assessment.derived).map(([key,value])=><span key={key}><small>{key.replaceAll("_"," ")}</small><b dir="ltr">{String(value).replaceAll("_"," ")}</b></span>)}</div>
    </div> : null}
    {(assessment.actions??[]).length?<div className="fg-service-actions-list">{assessment.actions!.map((action,index)=><p key={index}>{action}</p>)}</div>:null}
    <div className="fg-service-coverage"><strong>Coverage</strong><span>{assessment.coverage.length?assessment.coverage.join(" · "):empty}</span></div>
    {(assessment.data_gaps??[]).length?<div className="fg-service-gaps" data-testid="analysis-data-gaps">
      <div className="fg-service-gaps-head"><strong>NEXT DATA</strong><span>{assessment.data_gaps!.length}</span></div>
      <div className="fg-service-gap-list">{assessment.data_gaps!.map(gap=><article key={gap.metric}>
        <div><strong>{gap.metric.replaceAll("_"," ").toUpperCase()}</strong><small>{gap.purpose.replaceAll("_"," ")}</small></div>
        <span>{gap.unit}</span><b>{gap.priority}</b>
      </article>)}</div>
      {dataHref&&gapActionLabel?<Link className="fg-service-console-action" to={dataHref}>{gapActionLabel}<ArrowUpRight size={14}/></Link>:null}
    </div>:null}
    {(assessment.guidelines??[]).length?<div className="fg-service-guidelines">{assessment.guidelines!.map(item=><span key={item}>{item}</span>)}</div>:null}
    {assessment.limitations.length?<ul className="fg-service-limitations">{assessment.limitations.map(item=><li key={item}>{item.replaceAll("_"," ")}</li>)}</ul>:null}
  </div>;
}


function WeatherConsole({projectId,enabled,lang}:{projectId:number|null;enabled:boolean;lang:"ar"|"fr"|"en"}) {
  const tx = lang==="fr" ? {
    load:"Charger 15 jours", unavailable:"Fournisseur météo non configuré", noProject:"Associez la parcelle à un projet/site géoréférencé.",
    title:"Prévision agricole en direct", inferred:"Prévision fournisseur · non vérifiée terrain", rain:"Pluie", eto:"ET₀", wind:"Vent", temp:"Temp.", probability:"Prob.",
    refresh:"Actualiser", loading:"Chargement…", failed:"Impossible de charger la météo en direct."
  } : lang==="en" ? {
    load:"Load 15 days", unavailable:"Weather provider not configured", noProject:"Link the field to a georeferenced project/site.",
    title:"Live agricultural forecast", inferred:"Provider forecast · not field verified", rain:"Rain", eto:"ET₀", wind:"Wind", temp:"Temp.", probability:"Prob.",
    refresh:"Refresh", loading:"Loading…", failed:"Could not load live weather."
  } : {
    load:"تحميل 15 يوماً", unavailable:"مزود الطقس غير مهيأ", noProject:"اربط القطعة بمشروع/موقع ذي إحداثيات.",
    title:"التوقع الزراعي الحي", inferred:"توقع من المزود · غير متحقق ميدانياً", rain:"المطر", eto:"ET₀", wind:"الرياح", temp:"الحرارة", probability:"الاحتمال",
    refresh:"تحديث", loading:"جارٍ التحميل…", failed:"تعذر تحميل الطقس الحي."
  };
  const [forecast,setForecast]=useState<WeatherForecast|null>(null);
  const [busy,setBusy]=useState(false);
  const [problem,setProblem]=useState("");
  useEffect(()=>{setForecast(null);setProblem("");},[projectId]);
  const load=async()=>{
    if(!projectId||!enabled||busy)return;
    setBusy(true);setProblem("");
    try{setForecast(await api.get<WeatherForecast>(`/projects/${projectId}/agriculture/weather/live?days=15`));}
    catch(err){setProblem(err instanceof Error?err.message:tx.failed);}
    finally{setBusy(false);}
  };
  return <div className="fg-service-console" data-testid="analysis-weather-console">
    <div className="fg-service-console-head"><CloudSun size={22}/><div><h2>{tx.title}</h2><p>{tx.inferred}</p></div></div>
    {!projectId?<p className="fg-service-console-note">{tx.noProject}</p>:!enabled?<p className="fg-service-console-note">{tx.unavailable}</p>:null}
    {projectId&&enabled?<button className="fg-service-console-action" type="button" onClick={()=>void load()} disabled={busy}>{busy?tx.loading:(forecast?tx.refresh:tx.load)}</button>:null}
    {problem?<p className="fg-error" role="alert">{problem}</p>:null}
    {forecast?<div className="fg-weather-console">
      <div className="fg-weather-meta"><strong>{forecast.site.name} · {forecast.site.wilaya}</strong><span>{forecast.provider} · {forecast.provenance}</span></div>
      <div className="fg-weather-days">{forecast.days.map(day=><article key={day.day}>
        <strong>{new Date(day.day+"T12:00:00").toLocaleDateString(lang,{weekday:"short",day:"2-digit",month:"short"})}</strong>
        <span><b>{tx.temp}</b> {day.min_c.toFixed(0)}–{day.max_c.toFixed(0)} °C</span>
        <span><b>{tx.rain}</b> {day.rain_mm.toFixed(1)} mm</span>
        <span><b>{tx.eto}</b> {day.eto_mm==null?"—":day.eto_mm.toFixed(2)} mm</span>
        <span><b>{tx.wind}</b> {day.wind_speed_kmh==null?"—":day.wind_speed_kmh.toFixed(0)} km/h</span>
        <span><b>{tx.probability}</b> {day.precipitation_probability==null?"—":day.precipitation_probability.toFixed(0)+"%"}</span>
      </article>)}</div>
      {forecast.attribution_url?<a className="fg-weather-attribution" href={forecast.attribution_url} target="_blank" rel="noreferrer">{forecast.attribution}</a>:<span className="fg-weather-attribution">{forecast.attribution}</span>}
    </div>:null}
  </div>;
}

function IrrigationConsole({
  parcel,projectId,weatherEnabled,lang,onSaved,
}:{
  parcel:Parcel|null;projectId:number|null;weatherEnabled:boolean;lang:"ar"|"fr"|"en";onSaved:()=>void;
}) {
  const tx = lang==="fr" ? {
    title:"Scénario d'irrigation", intro:"FAO-56 · scénario calculé, jamais commande terrain automatique.", eto:"ET₀ (mm/j)", kc:"Kc", rain:"Pluie efficace (mm)", efficiency:"Efficacité", days:"Jours",
    calculate:"Calculer et enregistrer", loading:"Calcul…", loadWeather:"Charger météo", chooseDay:"Jour météo", volume:"Volume", gross:"Lame brute", net:"Lame nette", etc:"ETc",
    forecastNote:"La pluie prévue est copiée comme point de départ; ajustez-la en pluie efficace selon le sol et le système.", missing:"Sélectionnez une parcelle.", failed:"Le calcul a échoué."
  } : lang==="en" ? {
    title:"Irrigation scenario", intro:"FAO-56 · computed scenario, never automatic field control.", eto:"ET₀ (mm/day)", kc:"Kc", rain:"Effective rain (mm)", efficiency:"Efficiency", days:"Days",
    calculate:"Calculate & save", loading:"Calculating…", loadWeather:"Load weather", chooseDay:"Weather day", volume:"Volume", gross:"Gross depth", net:"Net depth", etc:"ETc",
    forecastNote:"Forecast rain is copied as a starting point; adjust it to effective rain for the soil and system.", missing:"Select a field.", failed:"Irrigation calculation failed."
  } : {
    title:"سيناريو الري", intro:"FAO-56 · سيناريو محسوب وليس أمراً آلياً للتنفيذ الميداني.", eto:"ET₀ (مم/يوم)", kc:"Kc", rain:"المطر الفعال (مم)", efficiency:"الكفاءة", days:"الأيام",
    calculate:"احسب واحفظ السيناريو", loading:"جارٍ الحساب…", loadWeather:"تحميل الطقس", chooseDay:"يوم التوقع", volume:"الحجم", gross:"العمق الإجمالي", net:"العمق الصافي", etc:"ETc",
    forecastNote:"يُنسخ المطر المتوقع كنقطة بداية فقط؛ عدّله إلى المطر الفعال حسب التربة ونظام الري.", missing:"اختر قطعة زراعية.", failed:"فشل حساب سيناريو الري."
  };
  const [eto,setEto]=useState("5");
  const [kc,setKc]=useState("0.85");
  const [rain,setRain]=useState("0");
  const [efficiency,setEfficiency]=useState("0.85");
  const [days,setDays]=useState("1");
  const [forecast,setForecast]=useState<WeatherForecast|null>(null);
  const [weatherDay,setWeatherDay]=useState("");
  const [result,setResult]=useState<IrrigationPlanResult["result"]|null>(null);
  const [busy,setBusy]=useState<"weather"|"calc"|null>(null);
  const [problem,setProblem]=useState("");
  useEffect(()=>{setForecast(null);setWeatherDay("");setResult(null);setProblem("");},[parcel?.id,projectId]);

  const applyDay=(value:string,nextForecast=forecast)=>{
    setWeatherDay(value);
    const day=nextForecast?.days.find(row=>row.day===value);
    if(!day)return;
    if(day.eto_mm!=null)setEto(String(day.eto_mm));
    setRain(String(day.rain_mm));
    setDays("1");
  };
  const loadWeather=async()=>{
    if(!projectId||!weatherEnabled||busy)return;
    setBusy("weather");setProblem("");
    try{
      const data=await api.get<WeatherForecast>(`/projects/${projectId}/agriculture/weather/live?days=7`);
      setForecast(data);
      if(data.days[0])applyDay(data.days[0].day,data);
    }catch(err){setProblem(err instanceof Error?err.message:tx.failed);}
    finally{setBusy(null);}
  };
  const calculate=async()=>{
    if(!parcel||busy)return;
    const values={eto:Number(eto),kc:Number(kc),rain:Number(rain),eff:Number(efficiency),days:Number(days)};
    if(!Number.isFinite(values.eto)||!Number.isFinite(values.kc)||!Number.isFinite(values.rain)||!Number.isFinite(values.eff)||!Number.isInteger(values.days))return;
    setBusy("calc");setProblem("");
    try{
      const source=weatherDay&&forecast?`live-weather:${forecast.provider}:${weatherDay}`:"analysis-console-manual";
      const plan=await api.post<IrrigationPlanResult>("/agriculture/plans",{
        parcel_id:parcel.id,eto_mm_day:values.eto,kc:values.kc,effective_rain_mm:values.rain,
        efficiency:values.eff,days:values.days,input_source:source,
      });
      setResult(plan.result);onSaved();
    }catch(err){setProblem(err instanceof Error?err.message:tx.failed);}
    finally{setBusy(null);}
  };
  if(!parcel)return <div className="fg-service-console"><p className="fg-service-console-note">{tx.missing}</p></div>;
  return <div className="fg-service-console" data-testid="analysis-irrigation-console">
    <div className="fg-service-console-head"><Droplets size={22}/><div><h2>{tx.title}</h2><p>{tx.intro}</p></div></div>
    {projectId&&weatherEnabled?<div className="fg-irrigation-weather-row"><button type="button" onClick={()=>void loadWeather()} disabled={busy!==null}>{busy==="weather"?tx.loading:tx.loadWeather}</button>
      {forecast?<select aria-label={tx.chooseDay} value={weatherDay} onChange={e=>applyDay(e.target.value)}>{forecast.days.map(day=><option key={day.day} value={day.day}>{day.day} · ET₀ {day.eto_mm??"—"} · {day.rain_mm} mm</option>)}</select>:null}
    </div>:null}
    {forecast?<p className="fg-service-console-note">{tx.forecastNote}</p>:null}
    <div className="fg-irrigation-grid">
      <label><span>{tx.eto}</span><input type="number" min="0" max="30" step="0.01" value={eto} onChange={e=>setEto(e.target.value)}/></label>
      <label><span>{tx.kc}</span><input type="number" min="0" max="2" step="0.01" value={kc} onChange={e=>setKc(e.target.value)}/></label>
      <label><span>{tx.rain}</span><input type="number" min="0" max="2000" step="0.01" value={rain} onChange={e=>setRain(e.target.value)}/></label>
      <label><span>{tx.efficiency}</span><input type="number" min="0.01" max="1" step="0.01" value={efficiency} onChange={e=>setEfficiency(e.target.value)}/></label>
      <label><span>{tx.days}</span><input type="number" min="1" max="30" step="1" value={days} onChange={e=>setDays(e.target.value)}/></label>
    </div>
    <button className="fg-service-console-action" type="button" onClick={()=>void calculate()} disabled={busy!==null}>{busy==="calc"?tx.loading:tx.calculate}</button>
    {problem?<p className="fg-error" role="alert">{problem}</p>:null}
    {result?<div className="fg-irrigation-result">
      <div><span>{tx.etc}</span><strong>{result.etc_mm.toFixed(2)} mm</strong></div>
      <div><span>{tx.net}</span><strong>{result.net_mm.toFixed(2)} mm</strong></div>
      <div><span>{tx.gross}</span><strong>{result.gross_mm.toFixed(2)} mm</strong></div>
      <div><span>{tx.volume}</span><strong>{result.volume_m3.toFixed(1)} m³</strong></div>
      <p>{result.evidence_status} · {result.decision_status} · {result.method}</p>
    </div>:null}
  </div>;
}

export default function AnalysisCenter() {
  const { i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const lang = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const requested = Number(searchParams.get("parcel"));

  const copy = lang === "fr" ? {
    eyebrow:"FOGGARA / SATELLITE", title:"Analyse satellite de terrain",
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
    eyebrow:"FOGGARA / SATELLITE", title:"Field satellite analysis",
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
    eyebrow:"FOGGARA / الأقمار الصناعية", title:"تحليل الحقل بالأقمار الصناعية",
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
  const [projects,setProjects]=useState<Project[]>([]);
  const [showDemo,setShowDemo]=useState(searchParams.get("demo")==="1");
  const [parcelId,setParcelId]=useState<number|null>(Number.isInteger(requested)&&requested>0?requested:null);
  const [summary,setSummary]=useState<Summary|null>(null);
  const [observations,setObservations]=useState<Observation[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<unknown>(null);
  const [reloadToken,setReloadToken]=useState(0);
  const [analysisOverlay,setAnalysisOverlay]=useState<AnalysisRasterOverlay|null>(null);
  const [satelliteOverlay,setSatelliteOverlay]=useState<SatelliteRasterOverlay|null>(null);
  const [analysisTool,setAnalysisTool]=useState<"satellite"|"soil"|"water"|"irrigation"|"weather">("satellite");

  useEffect(()=>{
    let cancelled=false;
    setLoading(true);
    Promise.all([
      api.get<Parcel[]>("/agriculture/parcels"),
      api.get<ParcelBoundaryResponse>("/gis/parcels.geojson"),
      api.get<Paged<Project>>("/projects?page_size=100"),
    ])
      .then(([rows,geo,projectPage])=>{
        if(cancelled)return;
        setParcels(rows.filter(row=>!row.archived));
        setBoundaries(geo.features);
        setProjects(projectPage.items.filter(project=>!project.is_demo));
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
    setAnalysisOverlay(null);
    setSatelliteOverlay(prev=>{if(prev?.url)URL.revokeObjectURL(prev.url);return null;});
    if(!parcelId){setSummary(null);setObservations([]);return;}
    let cancelled=false;
    setLoading(true);setError(null);
    const selectedParcel=visibleParcels.find(row=>row.id===parcelId);
    const linkedProject=projects.find(project=>project.status!=="closed" && selectedParcel?.site_id!=null && project.site_id===selectedParcel.site_id);
    const summaryUrl=linkedProject
      ? `/agriculture/parcels/${parcelId}/service-summary?project_id=${linkedProject.id}`
      : `/agriculture/parcels/${parcelId}/service-summary`;
    Promise.all([
      api.get<Summary>(summaryUrl),
      api.get<Observation[]>(`/agriculture/observations?parcel_id=${parcelId}`),
    ]).then(([s,o])=>{if(!cancelled){setSummary(s);setObservations(o);}})
      .catch(err=>{if(!cancelled)setError(err);})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[parcelId,reloadToken,projects,visibleParcels]);

  const parcel=visibleParcels.find(row=>row.id===parcelId)??null;
  const linkedProject=useMemo(
    ()=>projects.find(project=>project.status!=="closed" && parcel?.site_id!=null && project.site_id===parcel.site_id)??null,
    [projects,parcel?.site_id],
  );
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
    return <div className="fg-analysis-workspace" dir={i18n.dir()} data-testid="analysis-center">
      <header className="fg-analysis-toolbar">
        <div><p>{copy.eyebrow}</p><h1>{copy.title}</h1><span>{copy.demoHidden}</span></div>
        <div className="fg-analysis-toolbar-actions">
          <button type="button" onClick={toggleDemo} className={showDemo?"demo-on":""}><Eye size={15}/>{showDemo?copy.hideDemo:copy.showDemo}</button>
          <Link to="/app/gis" className="primary"><MapPinned size={16}/>{copy.draw}</Link>
        </div>
      </header>
      <section className="fg-analysis-map-first">
        <aside className="fg-analysis-field-list">
          <div className="fg-analysis-field-list-head"><div><span>{copy.fields}</span><strong>0</strong></div><MapPinned size={18}/></div>
          <div className="p-5 text-sm text-muted-foreground"><p>{copy.noParcels}</p><p className="mt-2 text-xs">{copy.demoHidden}</p></div>
        </aside>
        <div className="fg-analysis-map-canvas">
          <NationalMap sites={[]} wilayas={[]} parcelBoundaries={[]} locale={lang} minimal />
          <div className="fg-analysis-map-caption"><div><strong>{copy.noParcels}</strong><span>{copy.demoHidden}</span></div><Link to="/app/gis">{copy.draw}<ArrowUpRight size={14}/></Link></div>
        </div>
      </section>
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
          analysisOverlay={analysisOverlay}
          satelliteOverlay={satelliteOverlay}
          locale={lang}
          minimal
        />
        {parcel?<div className="fg-analysis-map-caption"><div><strong>{parcel.name}</strong><span>{parcel.location||"—"} · {Number(parcel.area_ha).toFixed(2)} ha</span></div><Link to={`/app/gis?parcel=${parcel.id}`}>{copy.map}<ArrowUpRight size={14}/></Link></div>:null}
      </div>
    </section>

    <section className="fg-analysis-live-console" data-testid="analysis-live-sentinel">
      <div className="fg-analysis-tool-tabs" role="tablist" aria-label={copy.title}>
        {([
          ["satellite", copy.satellite, Satellite],
          ["soil", copy.soil, FlaskConical],
          ["water", copy.water, Droplets],
          ["irrigation", copy.irrigation, Sprout],
          ["weather", copy.weather, CloudSun],
        ] as const).map(([key,label,Icon])=><button key={key} type="button" role="tab" aria-selected={analysisTool===key} className={analysisTool===key?"active":""} onClick={()=>setAnalysisTool(key)}><Icon size={15}/><span>{label}</span></button>)}
      </div>
      {analysisTool==="satellite" ? <ParcelSentinel
        parcels={visibleParcels}
        selectedParcelId={parcelId}
        onSaved={() => setReloadToken(value => value + 1)}
        onRasterReady={setAnalysisOverlay}
        onTrueColorReady={setSatelliteOverlay}
      /> : null}
      {analysisTool==="soil" ? <AssessmentConsole
        title={copy.soil}
        assessment={summary?.soil_assessment ?? null}
        empty={copy.missing}
        dataHref={parcelId?`/app/agriculture?parcel=${parcelId}&section=evidence`:undefined}
        gapActionLabel={lang==="fr"?"Ajouter les mesures":lang==="en"?"Add measurements":"إضافة القياسات"}
      /> : null}
      {analysisTool==="water" ? <AssessmentConsole
        title={copy.water}
        assessment={summary?.irrigation_water_assessment ?? null}
        empty={copy.missing}
        dataHref={linkedProject?`/app/projects/${linkedProject.id}?tab=data`:undefined}
        gapActionLabel={lang==="fr"?"Ouvrir les mesures du projet":lang==="en"?"Open project measurements":"فتح قياسات المشروع"}
      /> : null}
      {analysisTool==="irrigation" ? <IrrigationConsole
        parcel={parcel}
        projectId={linkedProject?.id??null}
        weatherEnabled={Boolean(summary?.available_services.weather_live)}
        lang={lang}
        onSaved={()=>setReloadToken(value=>value+1)}
      /> : null}
      {analysisTool==="weather" ? <WeatherConsole
        projectId={linkedProject?.id??null}
        enabled={Boolean(summary?.available_services.weather_live)}
        lang={lang}
      /> : null}
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
