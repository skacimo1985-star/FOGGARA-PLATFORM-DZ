import {useState} from "react";
import {Link} from "react-router";
import {useTranslation} from "react-i18next";
import {ArrowUpRight,Globe2,MapPinned,Ruler,Satellite,ShieldCheck,Sprout,Database,Activity} from "lucide-react";
import {NationalMap,type SatelliteScene} from "@/components/NationalMap";
import {useAuth} from "@/context/useAuth";
import {api} from "@/lib/api";
import {WILAYAS} from "@/lib/wilayas";
import {polygonAreaHectares} from "@/lib/geojson-area";
import {boundsOfPolygon,rectanglePolygon,saveFoggaraAoi,type FoggaraPolygon} from "@/lib/foggara-aoi";
import {ErrorText} from "@/components/common";
import "./public-gis.css";

type Bbox=[number,number,number,number];
type SceneList={provider:string;collection:string;live:boolean;count:number;scenes:SatelliteScene[]};
type Preview={
  status:"READY"|"NO_USABLE_SCENE";
  product:string;
  scene:{id:string;datetime:string|null;cloud_cover_pct:number|null;provider:string|null}|null;
  area_ha_estimated:number;
  geometry_mask_applied?:boolean;
  indices?:{ndvi?:{statistics?:{min:number|null;max:number|null;mean:number|null;median:number|null};
    pixels?:{total:number;valid:number;valid_fraction:number};
    mask?:{geometry_mask_applied:boolean;outside_geometry_pixel_count:number}}};
  evidence:{verified:boolean};
  persisted:boolean;
};
const copy={
  ar:{
    kicker:"FOGGARA-DZ · نظام جغرافي وتشخيص فضائي",title:"حلّل موقعك داخل فقارة",intro:"حدد قطعة على الخريطة، وابحث عن مشاهد Sentinel-2 الحقيقية ثم احسب NDVI داخل حدود القطعة، دون مغادرة المنصة.",
    coordinateTitle:"تحديد الموقع بالإحداثيات عند تعذر رسم الخريطة",latitude:"خط العرض",longitude:"خط الطول",side:"طول ضلع المربع بالمتر",setCoordinates:"تحديد وتحليل الموقع",invalidCoordinates:"الإحداثيات خارج الجزائر أو مساحة الاختيار غير صالحة.",step1:"1 · حدد الموقع",step2:"2 · مشاهد الأقمار الصناعية",step3:"3 · معاينة NDVI",select:"ارسم مضلعًا أو حدد مستطيلًا بواسطة أدوات الخريطة.",
    selectFirst:"اختر منطقة صغيرة على الخريطة أولًا. تتوفر معاينة NDVI للمساحات التي لا يتجاوز مستطيلها 1600 بكسل Sentinel.",
    bounds:"إحداثيات المنطقة WGS84",area:"المساحة التقريبية",search:"ابحث عن مشاهد حقيقية",searching:"يُبحث الآن…",
    run:"احسب NDVI الحقيقي",running:"جارٍ الحساب…",limit:"لتجربة NDVI، صغّر التحديد إلى ما يقارب 16 هكتارًا من مساحة المستطيل المحيط كحد أقصى.",
    noScene:"لم تُعثر على مشاهد صالحة خلال الفترة المختارة. لا تُعرض أرقام تجريبية.",
    noResult:"لم تُطلب معاينة بعد.",observed:"مصدر المشهد",date:"تاريخ الالتقاط",cloud:"نسبة الغيوم",
    pixels:"بكسلات صالحة",indices:"متوسط NDVI",notVerified:"محسوب من صور فضائية، غير مثبت بقياس ميداني. لا يستنتج تشخيص أمراض أو عناصر تربة.",
    local:"فقارة تقوم بالحساب في الـBackend الخاص بها باستخدام Rasterio وبيانات Sentinel-2 من مزود خارجي.",
    save:"احفظ القطعة في مساحة فقارة",saveNote:"معاينة الزائر مؤقتة؛ الحفظ الدائم والتحاليل المتقدمة تتطلب حساب المؤسسة.",
    prev:"لا يوجد مصدر قابل للاستخدام",empty:"حدد منطقة ليظهر نطاق التحليل هنا.",tools:"خريطة فقارة",count:"مشاهد متاحة",
    retry:"إعادة تحميل الخريطة",export:"تصدير حدود GeoJSON",public:"خدمات عامة بدون حساب",limits:"خدمة محدودة المعدل (3 طلبات خلال 5 دقائق لكل عنوان اتصال) لحماية الخادم.",
    dateStart:"من",dateEnd:"إلى",provider:"بيانات المشهد: Element 84 Earth Search · Sentinel-2 L2A",signIn:"الدخول لحفظ البيانات",
  },
  fr:{
    kicker:"FOGGARA-DZ · SIG & observation spatiale",title:"Analysez votre terrain dans FOGGARA",intro:"Dessinez une parcelle, recherchez de vraies scènes Sentinel-2 et calculez le NDVI dans son périmètre sans quitter FOGGARA.",
    coordinateTitle:"Définir la parcelle par coordonnées si la carte ne fonctionne pas",latitude:"Latitude",longitude:"Longitude",side:"Côté en mètres",setCoordinates:"Définir et analyser la zone",invalidCoordinates:"Coordonnées hors d’Algérie ou surface invalide.",step1:"1 · Définir la zone",step2:"2 · Scènes satellite",step3:"3 · Aperçu NDVI",select:"Dessinez un polygone ou sélectionnez un rectangle sur la carte.",
    selectFirst:"Sélectionnez une petite zone. L'aperçu NDVI est limité à 1 600 pixels Sentinel dans l'emprise.",
    bounds:"Coordonnées WGS84",area:"Surface estimée",search:"Chercher des scènes réelles",searching:"Recherche en cours…",
    run:"Calculer le vrai NDVI",running:"Calcul en cours…",limit:"Réduisez la zone à environ 16 hectares d'emprise au maximum pour l'aperçu NDVI.",
    noScene:"Aucune scène utilisable pour cette période. Aucun résultat fictif.",
    noResult:"Aucun calcul demandé.",observed:"Source satellite",date:"Acquisition",cloud:"Nuages",
    pixels:"Pixels valides",indices:"NDVI moyen",notVerified:"Calcul spectral non validé sur le terrain. Ni diagnostic de maladie ni mesure chimique du sol.",
    local:"Calcul sur le backend FOGGARA via Rasterio, données Sentinel-2 provenant d'un fournisseur externe.",
    save:"Enregistrer la parcelle dans FOGGARA",saveNote:"L'aperçu visiteur est temporaire ; l'enregistrement et les analyses avancées exigent un compte d'organisation.",
    prev:"Aucun produit utilisable",empty:"Sélectionnez une zone pour activer le flux.",tools:"Carte FOGGARA",count:"scènes disponibles",
    retry:"Recharger la carte",export:"Exporter les limites GeoJSON",public:"Service public sans compte",limits:"Service limitée à 3 demandes par 5 minutes par identité réseau pour protéger le serveur.",
    dateStart:"Du",dateEnd:"Au",provider:"Source : Element 84 Earth Search · Sentinel-2 L2A",signIn:"Connexion pour enregistrer",
  },
  en:{
    kicker:"FOGGARA-DZ · GIS & satellite intelligence",title:"Analyze your field inside FOGGARA",intro:"Draw a field or choose an area, find real Sentinel-2 acquisitions and compute polygon-clipped NDVI without leaving the platform.",
    coordinateTitle:"Use coordinates if the map does not load",latitude:"Latitude",longitude:"Longitude",side:"Square side (metres)",setCoordinates:"Select area for analysis",invalidCoordinates:"Coordinates outside Algeria or invalid selection size.",step1:"1 · Select area",step2:"2 · Satellite scenes",step3:"3 · NDVI preview",select:"Draw a polygon or select a rectangle with the map tools.",
    selectFirst:"Choose a small area first. NDVI preview is limited to 1,600 Sentinel pixels in the bounding area.",
    bounds:"WGS84 bounds",area:"Estimated area",search:"Search real scenes",searching:"Searching…",
    run:"Compute real NDVI",running:"Computing…",limit:"Shrink the selection to about 16 hectares of bounding extent or less for NDVI preview.",
    noScene:"No usable scene was found for this period. No synthetic results.",
    noResult:"No analysis has been requested.",observed:"Scene provider",date:"Acquired",cloud:"Cloud cover",
    pixels:"Valid pixels",indices:"Mean NDVI",notVerified:"Spectrally computed, not field verified. This does not diagnose plant disease or soil chemistry.",
    local:"Computed on FOGGARA's backend using Rasterio and external Sentinel-2 acquisitions.",
    save:"Save the field in FOGGARA",saveNote:"Visitor analysis is temporary; permanent storage and advanced studies require an organization account.",
    prev:"No usable scene",empty:"Select an area to activate analysis.",tools:"FOGGARA map",count:"available scenes",
    retry:"Reload map",export:"Export GeoJSON boundary",public:"No account needed",limits:"Service rate-limited to 3 requests per 5 minutes per connection identity to protect server capacity.",
    dateStart:"From",dateEnd:"To",provider:"Scene catalog: Element 84 Earth Search · Sentinel-2 L2A",signIn:"Sign in to save",
  },
} as const;
const today=new Date();
const begin=new Date(today);begin.setUTCDate(today.getUTCDate()-30);
const ISO=(d:Date)=>d.toISOString().slice(0,10);
const pixelEstimate=([w,s,e,n]:Bbox)=>Math.ceil((e-w)*111320*Math.cos(((s+n)/2)*Math.PI/180)/10)
  *Math.ceil((n-s)*110574/10);
export default function PublicGis(){
  const {i18n}=useTranslation();
  const {user}=useAuth();
  const lang=i18n.language==="fr"?"fr":i18n.language==="en"?"en":"ar";
  const t=copy[lang];
  const [retry,setRetry]=useState(0);
  const [area,setArea]=useState<FoggaraPolygon|null>(null);
  const [latitude,setLatitude]=useState("");
  const [longitude,setLongitude]=useState("");
  const [sideMeters,setSideMeters]=useState("100");
  const [coordinateError,setCoordinateError]=useState(false);
  const [selection,setSelection]=useState<Bbox|null>(null);
  const [scenes,setScenes]=useState<SatelliteScene[]>([]);
  const [selectedSceneId,setSelectedSceneId]=useState<string|null>(null);
  const [searching,setSearching]=useState(false);
  const [searchError,setSearchError]=useState<unknown>(null);
  const [result,setResult]=useState<Preview|null>(null);
  const [previewError,setPreviewError]=useState<unknown>(null);
  const [computing,setComputing]=useState(false);
  const [start,setStart]=useState(ISO(begin));
  const [end,setEnd]=useState(ISO(today));
  const bbox=area?boundsOfPolygon(area):null;
  const pixels=bbox?pixelEstimate(bbox):0;
  const allowed=Boolean(area&&bbox&&pixels>0&&pixels<=1600&&start&&end&&start<=end);
  const change=(poly:FoggaraPolygon|null)=>{
    setArea(poly);setSelection(poly?boundsOfPolygon(poly):null);setScenes([]);
    setSelectedSceneId(null);setResult(null);setPreviewError(null);setSearchError(null);
  };
  function selectCoordinates(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    const lat=Number(latitude),lon=Number(longitude),side=Number(sideMeters);
    if(!latitude.trim()||!longitude.trim()||!Number.isFinite(lat)||!Number.isFinite(lon)
      ||!Number.isFinite(side)||side<20||side>300||lat<18.4||lat>37.5||lon< -8.8||lon>12.2){
      setCoordinateError(true);return;
    }
    const halfLat=side/2/110574;
    const halfLon=side/2/(111320*Math.cos(lat*Math.PI/180));
    const bounds:Bbox=[lon-halfLon,lat-halfLat,lon+halfLon,lat+halfLat];
    const polygon=rectanglePolygon(bounds);
    if(!boundsOfPolygon(polygon)){setCoordinateError(true);return;}
    setCoordinateError(false);
    change(polygon);
  }
  async function searchScenes(){
    if(!bbox||searching)return;
    setSearching(true);setSearchError(null);setScenes([]);setSelectedSceneId(null);
    try{
      const params=new URLSearchParams({bbox:bbox.join(","),start,end,cloud_cover_lte:"35",limit:"8"});
      const found=await api.get<SceneList>(`/expo/satellite/scenes?${params.toString()}`);
      setScenes(found.scenes);
      if(found.scenes[0])setSelectedSceneId(found.scenes[0].id);
    }catch(e){setSearchError(e);}finally{setSearching(false);}
  }
  async function preview(){
    if(!area||!allowed||computing)return;
    setComputing(true);setPreviewError(null);setResult(null);
    try{
      const response=await api.post<Preview>("/expo/satellite/ndvi-preview",{boundary_geojson:area,start,end});
      setResult(response);
    }catch(e){setPreviewError(e);}finally{setComputing(false);}
  }
  const persist=()=>{if(area)saveFoggaraAoi(area);};
  const exportGeometry=()=>{
    if(!area)return;
    const payload={type:"FeatureCollection",features:[{
      type:"Feature",geometry:area,properties:{source:"FOGGARA-DZ",evidence_status:"USER_DRAWN",verified:false},
    }]};
    const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/geo+json"}));
    const a=document.createElement("a");
    a.href=url;a.download="foggara-field-boundary.geojson";
    a.click();URL.revokeObjectURL(url);
  };
  const selected=scenes.find(x=>x.id===selectedSceneId);
  const ndvi=result?.indices?.ndvi?.statistics?.mean;
  const count=result?.indices?.ndvi?.pixels?.valid;
  return <main className="fg-public-gis" dir={lang==="ar"?"rtl":"ltr"} lang={lang}>
    <header className="fg-public-gis-intro">
      <div>
        <p className="fg-public-gis-kicker"><Sprout size={18}/>{t.kicker}</p>
        <h1>{t.title}</h1><p>{t.intro}</p>
        <div className="fg-public-gis-ident"><span><Globe2 size={16}/>{t.public}</span><span><Database size={16}/>FOGGARA-DZ / WEFEH</span></div>
      </div>
      <Link className="fg-public-gis-cta" onClick={persist} to={user?"/app/gis":"/login?mode=team"}
        state={user?undefined:{from:{pathname:"/app/gis"}}}>
        <ShieldCheck size={18}/>{t.signIn}<ArrowUpRight size={18}/>
      </Link>
    </header>
    <section className="fg-public-gis-map" aria-label={t.tools}>
      <h2>{t.step1}</h2><p>{t.select}</p>
      <form className="fg-public-gis-coordinate-entry" onSubmit={selectCoordinates}>
        <strong>{t.coordinateTitle}</strong>
        <label>{t.latitude}<input type="number" required min="18.4" max="37.5" step="any" placeholder="33.80000" value={latitude} onChange={e=>setLatitude(e.target.value)}/></label>
        <label>{t.longitude}<input type="number" required min="-8.8" max="12.2" step="any" placeholder="2.87000" value={longitude} onChange={e=>setLongitude(e.target.value)}/></label>
        <label>{t.side}<input type="number" required min="20" max="300" step="10" value={sideMeters} onChange={e=>setSideMeters(e.target.value)}/></label>
        <button type="submit">{t.setCoordinates}</button>
        {coordinateError?<span role="alert">{t.invalidCoordinates}</span>:null}
      </form>
      <NationalMap key={retry} sites={[]} wilayas={WILAYAS} locale={lang}
        satelliteScenes={scenes} selectedSceneId={selectedSceneId} onSelectScene={setSelectedSceneId}
        draftParcelBoundary={area}
        analysisSelectionBbox={selection}
        onAnalysisSelectionChange={b=>change(b?rectanglePolygon(b):null)}
        onDrawParcelBoundary={geometry=>change(geometry)}
      />
      <div className="fg-public-gis-actions">
        <button type="button" onClick={()=>{setRetry(x=>x+1);change(null);}}>{t.retry}</button>
        <button type="button" disabled={!area} onClick={exportGeometry}>{t.export}</button>
        {bbox?<span dir="ltr">{t.bounds}: {bbox.map(x=>x.toFixed(5)).join(", ")}</span>:<span>{t.empty}</span>}
        {area?<span>{t.area}: {polygonAreaHectares(area).toFixed(2)} ha</span>:null}
      </div>
    </section>
    <section className="fg-public-gis-workflow" aria-label="FOGGARA FIELD">
      <div className="fg-public-gis-tool">
        <h2><Satellite size={22}/>{t.step2}</h2>
        <div className="fg-public-gis-date-row">
          <label>{t.dateStart}<input type="date" max={end} value={start} onChange={e=>{setStart(e.target.value);setResult(null);setScenes([]);}}/></label>
          <label>{t.dateEnd}<input type="date" min={start} max={ISO(today)} value={end} onChange={e=>{setEnd(e.target.value);setResult(null);setScenes([]);}}/></label>
        </div>
        <button type="button" className="fg-public-gis-action" disabled={!bbox||searching||!start||!end||start>end} onClick={()=>void searchScenes()}>
          {searching?t.searching:t.search}<ArrowUpRight size={17}/>
        </button>
        <ErrorText error={searchError}/>
        <p className="fg-public-gis-source">{t.provider}</p>
        {scenes.length>0?<div className="fg-public-gis-scenes" aria-live="polite">
          <strong>{scenes.length} {t.count}</strong>
          {scenes.slice(0,8).map(scene=><button type="button" key={scene.id} className={scene.id===selectedSceneId?"active":""}
            onClick={()=>setSelectedSceneId(scene.id)}>
            <span>{scene.datetime?.slice(0,10)??scene.id}</span>
            <small>{scene.platform??"Sentinel-2"} · {scene.cloud_cover_pct?.toFixed(1)??"—"}% ☁</small>
          </button>)}
        </div>:null}
        {selected?<p>{t.date}: <strong dir="ltr">{selected.datetime?.slice(0,10)??"—"}</strong> · {t.cloud}: {selected.cloud_cover_pct?.toFixed(1)??"—"}%</p>:null}
      </div>
      <div className="fg-public-gis-tool">
        <h2><Activity size={22}/>{t.step3}</h2>
        <p>{t.local}</p>
        <button type="button" className="fg-public-gis-action" disabled={!allowed||computing} onClick={()=>void preview()}>
          {computing?t.running:t.run}<ArrowUpRight size={17}/>
        </button>
        {area&&!allowed?<p className="fg-public-gis-warning">{t.limit}</p>:!area?<p>{t.selectFirst}</p>:null}
        <ErrorText error={previewError}/>
        <div className="fg-public-gis-result" aria-live="polite">
          {result?.status==="READY" ? <>
            <span>{t.indices}</span>
            <strong className="fg-public-gis-ndvi" dir="ltr">{typeof ndvi==="number"?ndvi.toFixed(3):"—"}</strong>
            <span>{t.pixels}: {count??0}</span>
            <small>{t.date}: {result.scene?.datetime?.slice(0,10)??"—"} · {t.observed}: {result.scene?.provider??"Element 84"}</small>
            <p><ShieldCheck size={16}/>{t.notVerified}</p>
          </>:result?.status==="NO_USABLE_SCENE"?<p>{t.noScene}</p>:<p>{t.noResult}</p>}
        </div>
        <small className="fg-public-gis-limits">{t.limits}</small>
      </div>
    </section>
    <section className="fg-public-gis-handoff">
      <div><h2><MapPinned size={24}/>{t.save}</h2><p>{t.saveNote}</p></div>
      <Link to={user?"/app/gis":"/login?mode=team"} onClick={persist}
        state={user?undefined:{from:{pathname:"/app/gis"}}}>
        {t.signIn}<ArrowUpRight size={18}/>
      </Link>
    </section>
    <footer className="fg-public-gis-attribution">
      <Ruler size={15}/> FOGGARA-DZ GIS · MapLibre GL JS · OpenStreetMap © contributors · Sentinel-2/Copernicus · Element 84 Earth Search · Rasterio
    </footer>
  </main>;
}
