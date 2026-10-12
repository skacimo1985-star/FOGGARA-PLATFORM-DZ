import {useCallback,useEffect,useMemo,useRef,useState,type FormEvent} from "react";
import {Link} from "react-router";
import {useTranslation} from "react-i18next";
import {ArrowUpRight,MapPinned,Satellite,ShieldCheck,Sprout,Database,Activity,Map as MapIcon,Layers3,CheckCircle2,CloudSun,Leaf,Droplets,Download,Loader2,LocateFixed,Info,RefreshCw} from "lucide-react";
import {NationalMap,type SatelliteScene,type ParcelBoundaryFeature} from "@/components/NationalMap";
import {useAuth} from "@/context/useAuth";
import {api} from "@/lib/api";
import {createGisRequestScope} from "@/lib/gis-request-scope";
import {WILAYAS} from "@/lib/wilayas";
import {polygonAreaHectares} from "@/lib/geojson-area";
import {boundsOfPolygon,rectanglePolygon,saveFoggaraAoi,type FoggaraPolygon} from "@/lib/foggara-aoi";
import {ErrorText} from "@/components/common";
import {FieldPdfReport,type FieldPdfEvidence} from "@/components/FieldPdfReport";
import {printFoggaraFieldReport} from "@/lib/print-field-report";
import "./public-gis.css";
import "./foggara-field-workbench.css";

type Bbox=[number,number,number,number];
type SceneList={provider:string;collection:string;live:boolean;count:number;scenes:SatelliteScene[]};
type IndexKey="ndvi"|"ndmi";
type MapPreview={data_url:string;bbox:Bbox;index:IndexKey;render_crs:string;geometry_mask_applied:boolean};
type RasterGrid={resolution_m:number;effective_source_resolution_m?:number;resampled?:boolean};
type SavedField={id:number;name:string;crop:string;area_ha:number;location:string;site_id:number|null;lat:number|null;lon:number|null;boundary_geojson:FoggaraPolygon|null;archived:boolean;is_demo:boolean};
type OperationalStatus={database:{connected:boolean;engine:string};organization:{sites:number;projects:number;parcels:number;mapped_parcels:number;observations:number;satellite_observations:number}};
type SavedParcelStudy={status:"READY"|"NO_USABLE_SCENE";scene:Preview["scene"];parcel_id:number|null;
  geometry_mask_applied:boolean;sample_geometry:string;preview?:MapPreview|null;spectral_processing?:{grid:RasterGrid};
  domains?:{vegetation?:{indices?:{ndvi?:PreviewIndex}};canopy_moisture?:{indices?:{ndmi?:PreviewIndex}}};
  evidence:{verified:boolean};};
type PreviewIndex={statistics?:{min:number|null;max:number|null;mean:number|null;median:number|null};
  pixels?:{total:number;valid:number;valid_fraction:number};
  mask?:{geometry_mask_applied:boolean;outside_geometry_pixel_count:number}};

type Preview={
  status:"READY"|"NO_USABLE_SCENE";
  product:string;
  index?:IndexKey;
  scene:{id:string;datetime:string|null;cloud_cover_pct:number|null;provider:string|null}|null;
  area_ha_estimated:number;
  geometry_mask_applied?:boolean;
  indices?:Partial<Record<IndexKey,{statistics?:{min:number|null;max:number|null;mean:number|null;median:number|null};
    pixels?:{total:number;valid:number;valid_fraction:number};
    mask?:{geometry_mask_applied:boolean;outside_geometry_pixel_count:number}}>>;
  evidence:{verified:boolean};
  persisted:boolean;
  preview?:MapPreview|null;
  grid?:RasterGrid;
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
    retry:"إعادة تحميل الخريطة",export:"تصدير حدود GeoJSON",pdf:"تقرير PDF",public:"خدمات عامة بدون حساب",limits:"خدمة محدودة المعدل (3 طلبات خلال 5 دقائق لكل عنوان اتصال) لحماية الخادم.",
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
    retry:"Recharger la carte",export:"Exporter les limites GeoJSON",pdf:"Rapport PDF",public:"Service public sans compte",limits:"Service limitée à 3 demandes par 5 minutes par identité réseau pour protéger le serveur.",
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
    retry:"Reload map",export:"Export GeoJSON boundary",pdf:"PDF report",public:"No account needed",limits:"Service rate-limited to 3 requests per 5 minutes per connection identity to protect server capacity.",
    dateStart:"From",dateEnd:"To",provider:"Scene catalog: Element 84 Earth Search · Sentinel-2 L2A",signIn:"Sign in to save",
  },
} as const;

const wb={
  ar:{
    suite:"FOGGARA FIELD INTELLIGENCE",dashboard:"مساحة العمل الجغرافية",subtitle:"الاستشعار عن بعد وإدارة المساحات",workspace:"منصة فقارة",visitor:"معاينة عامة",account:"حساب المؤسسة",left:"إعداد الدراسة",map:"الخريطة التشغيلية",right:"تحليلات الحقل",drawing:"حدود الحقل",drawingHelp:"ارسم مضلعًا أو مستطيلًا على الخريطة. تتوفر أدوات القياس والطبقات ضمن الخريطة.",coordinates:"الإحداثيات",chooseCoords:"تحديد المنطقة بالإحداثيات",selected:"تم تحديد المساحة",pending:"بانتظار تحديد الحقل",scenePanel:"المرئيات الفضائية",catalog:"Sentinel-2 L2A",searchPrompt:"اختَر منطقة ثم ابحث عن صور الأقمار الصناعية الحقيقية.",sceneNone:"لا توجد مشاهد في الفترة المطلوبة.",acquired:"تاريخ الالتقاط",cloud:"الغطاء السحابي",selectScene:"اختيار المشهد",analysis:"التحليل الطيفي",vegetation:"حيوية الغطاء النباتي",canopyWater:"مؤشر ماء الغطاء النباتي",active:"المؤشر المحدد",computed:"نتيجة محسوبة",estimated:"تقدير فضائي لا يعوض القياس الميداني",notRun:"لم تُنفذ المعالجة بعد",emptyResult:"حدّد منطقة وابحث عن المشاهد، ثم شغّل التحليل للحصول على نتيجة حقيقية.",resultUnavailable:"تعذّر إيجاد مشهد صالح أو بكسلات صالحة للحساب.",mask:"قناع المضلع",maskApplied:"مطبق",quality:"جودة العينة",sampleCount:"بكسلات صالحة",range:"القيمة الدنيا / العليا",provenance:"الدليل والمصدر",limitations:"لا يمكن استنتاج NPK أو pH أو الأمراض أو كميات الري من هذه المؤشرات وحدها.",satellite:"مصدر البيانات الخارجي",backend:"الحساب على خادم فقارة",aoi:"المنطقة المحددة",surface:"المساحة",resolution:"دقة المعالجة الاسمية",roi:"WGS84",processing:"المعالجة جارية",waiting:"بانتظار البيانات",geoAction:"استخدم الإحداثيات إذا لم تظهر الخريطة",invalidDate:"اختر فترة صالحة لا تتجاوز 31 يومًا.",pixelBudget:"النطاق يتجاوز قدرة التحليل العام؛ اختر مساحة أصغر.",export:"تصدير GeoJSON",reset:"إعادة تعيين",save:"حفظ داخل المؤسسة",stepOne:"01 · المنطقة",stepTwo:"02 · المشهد",stepThree:"03 · التحليل",sceneSpecific:"تُحسب النتيجة للمشهد المختار من الخادم نفسه، لا من بيانات تجريبية.", indexNdmiNote:"NDMI يصف تغيرات ماء الغطاء النباتي، لا رطوبة التربة المقاسة.", noAccess:"المعاينة لا تحفظ بيانات المؤسسة"
  },
  fr:{
    suite:"FOGGARA FIELD INTELLIGENCE",dashboard:"Atelier géospatial",subtitle:"Télédétection et gestion des parcelles",workspace:"Plateforme FOGGARA",visitor:"Accès public",account:"Espace organisation",left:"Paramètres de l'étude",map:"Carte opérationnelle",right:"Analyse de la parcelle",drawing:"Limites de la parcelle",drawingHelp:"Dessinez un polygone ou un rectangle directement sur la carte. Mesures et couches sont intégrées.",coordinates:"Coordonnées",chooseCoords:"Choisir par coordonnées",selected:"Zone sélectionnée",pending:"En attente de parcelle",scenePanel:"Acquisitions satellitaires",catalog:"Sentinel-2 L2A",searchPrompt:"Définissez une zone pour chercher les acquisitions réelles.",sceneNone:"Aucune scène pour cette période.",acquired:"Date d'acquisition",cloud:"Nuages",selectScene:"Choisir cette scène",analysis:"Indices spectraux",vegetation:"Vigueur végétale",canopyWater:"Eau de la canopée",active:"Indice actif",computed:"Indice calculé",estimated:"Estimation spatiale, non validée sur le terrain",notRun:"Aucun calcul lancé",emptyResult:"Sélectionnez une zone et recherchez des scènes, puis lancez le calcul réel.",resultUnavailable:"Aucune scène ou pixel valide disponible pour ce calcul.",mask:"Masque polygonal",maskApplied:"Appliqué",quality:"Qualité des pixels",sampleCount:"Pixels valides",range:"Valeur min. / max.",provenance:"Preuves et provenance",limitations:"NDVI et NDMI ne mesurent pas le NPK, le pH, les maladies ou les besoins en irrigation.",satellite:"Fournisseur externe",backend:"Calcul sur le serveur FOGGARA",aoi:"Zone d'intérêt",surface:"Superficie",resolution:"Résolution nominale",roi:"WGS84",processing:"Traitement en cours",waiting:"Données non analysées",geoAction:"Saisir des coordonnées si la carte est indisponible",invalidDate:"Choisissez une période valide de 31 jours maximum.",pixelBudget:"Zone trop grande pour l'aperçu public ; réduire l'emprise.",export:"Exporter GeoJSON",reset:"Réinitialiser",save:"Enregistrer dans l'organisation",stepOne:"01 · Zone",stepTwo:"02 · Acquisition",stepThree:"03 · Analyse",sceneSpecific:"Calcul sur la scène choisie, jamais sur des données simulées.",indexNdmiNote:"NDMI est un proxy d'eau dans le couvert végétal, pas une mesure d'humidité du sol.",noAccess:"L'aperçu n'enregistre aucune donnée privée"
  },
  en:{
    suite:"FOGGARA FIELD INTELLIGENCE",dashboard:"Geospatial workspace",subtitle:"Remote sensing & field monitoring",workspace:"FOGGARA Platform",visitor:"Public workspace",account:"Organization workspace",left:"Study setup",map:"Operational map",right:"Field intelligence",drawing:"Field boundary",drawingHelp:"Draw a polygon or rectangle directly on the map; measurement and layers are built into the viewer.",coordinates:"Coordinates",chooseCoords:"Select by coordinates",selected:"Area selected",pending:"Waiting for field",scenePanel:"Satellite acquisitions",catalog:"Sentinel-2 L2A",searchPrompt:"Define an area to search for real satellite acquisitions.",sceneNone:"No acquisitions found for this period.",acquired:"Acquisition date",cloud:"Cloud cover",selectScene:"Select acquisition",analysis:"Spectral analysis",vegetation:"Vegetation vigor",canopyWater:"Canopy water proxy",active:"Active index",computed:"Computed result",estimated:"Satellite estimate, not field verified",notRun:"Analysis not run",emptyResult:"Select an area, search acquisitions and run a real raster analysis.",resultUnavailable:"No valid scene or valid pixels available for the requested calculation.",mask:"Polygon mask",maskApplied:"Applied",quality:"Valid pixel coverage",sampleCount:"Valid pixels",range:"Minimum / maximum",provenance:"Evidence and provenance",limitations:"These indices cannot measure NPK, pH, crop disease or irrigation quantities by themselves.",satellite:"External data provider",backend:"Processed on FOGGARA backend",aoi:"Area of interest",surface:"Estimated area",resolution:"Nominal resolution",roi:"WGS84",processing:"Processing request",waiting:"Awaiting observations",geoAction:"Use coordinates if the map is unavailable",invalidDate:"Select a valid date window of 31 days or less.",pixelBudget:"AOI exceeds the public preview budget; select a smaller field.",export:"Export GeoJSON",reset:"Reset selection",save:"Save in organization",stepOne:"01 · Area",stepTwo:"02 · Imagery",stepThree:"03 · Analysis",sceneSpecific:"Computed for the selected acquisition, never from mock data.",indexNdmiNote:"NDMI is a vegetation canopy-water proxy, not measured soil moisture.",noAccess:"Public previews do not save organization data"
  }
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
  const v=wb[lang];
  const [retry,setRetry]=useState(0);
  const resultsRef=useRef<HTMLDivElement|null>(null);
  const requestScope=useRef(createGisRequestScope());
  const workspaceScope=useRef(createGisRequestScope());
  const [index,setIndex]=useState<IndexKey>("ndvi");
  const [hasSearched,setHasSearched]=useState(false);
  const [savedFields,setSavedFields]=useState<SavedField[]>([]);
  const [dbStatus,setDbStatus]=useState<OperationalStatus|null>(null);
  const [dbError,setDbError]=useState<unknown>(null);
  const [saving,setSaving]=useState(false);
  const [saveError,setSaveError]=useState<unknown>(null);
  const [savedFieldId,setSavedFieldId]=useState<number|null>(null);
  const [fieldName,setFieldName]=useState("");
  const [fieldCrop,setFieldCrop]=useState("");
  const [showCoordinates,setShowCoordinates]=useState(false);
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
  const invalidateResults=()=>{
    requestScope.current.invalidate();setResult(null);setPreviewError(null);
    setSearching(false);setComputing(false);
  };
  const loadWorkspace=useCallback(async()=>{
    if(!user)return;
    const isCurrent=workspaceScope.current.capture();
    try{
      const [parcels,status]=await Promise.all([
        api.get<SavedField[]>("/agriculture/parcels"),
        api.get<OperationalStatus>("/gis/operational-status"),
      ]);
      if(!isCurrent())return;
      setSavedFields(parcels.filter(p=>!p.archived));
      setDbStatus(status);
      setDbError(null);
    }catch(error){if(isCurrent())setDbError(error);}
  },[user]);
  useEffect(()=>{
    const workspace=workspaceScope.current;
    const requests=requestScope.current;
    workspace.invalidate();setSavedFields([]);setDbStatus(null);setDbError(null);setSavedFieldId(null);
    requests.invalidate();setResult(null);setPreviewError(null);
    if(!user){setSavedFields([]);setDbStatus(null);setSavedFieldId(null);return;}
    void loadWorkspace();
    return ()=>{requests.invalidate();workspace.invalidate();};
  },[user,loadWorkspace]);
  const mappedFields=useMemo(()=>savedFields.filter(p=>p.boundary_geojson&&boundsOfPolygon(p.boundary_geojson)),[savedFields]);
  const mappedFeatures=useMemo<ParcelBoundaryFeature[]>(()=>
    mappedFields.map(p=>({
      type:"Feature",id:p.id,geometry:p.boundary_geojson as FoggaraPolygon,
      properties:{id:p.id,name:p.name,crop:p.crop,area_ha:p.area_ha,location:p.location,site_id:p.site_id,is_demo:p.is_demo,selected:savedFieldId===p.id},
    })),[mappedFields,savedFieldId]);
  const bbox=area?boundsOfPolygon(area):null;
  const pixels=bbox?pixelEstimate(bbox):0;
  const rangeDays=(new Date(end+"T00:00:00Z").getTime()-new Date(start+"T00:00:00Z").getTime())/86400000;
  const rangeValid=Number.isFinite(rangeDays)&&rangeDays>=0&&rangeDays<=31&&end<=ISO(new Date());
  const allowed=Boolean(area&&bbox&&pixels>0&&pixels<=(user&&savedFieldId!==null?250_000:1600)&&rangeValid);
  const change=(poly:FoggaraPolygon|null)=>{
    invalidateResults();
    setArea(poly);setSelection(poly?boundsOfPolygon(poly):null);setScenes([]);
    setSelectedSceneId(null);setResult(null);setPreviewError(null);setSearchError(null);
    setHasSearched(false);setSavedFieldId(null);setSaveError(null);
  };
  function selectCoordinates(event:FormEvent<HTMLFormElement>){
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
  const selectSavedField=(id:number)=>{
    const item=savedFields.find(p=>p.id===id);
    if(!item?.boundary_geojson||!boundsOfPolygon(item.boundary_geojson))return;
    change(item.boundary_geojson);setSavedFieldId(id);
    setFieldName(item.name);setFieldCrop(item.crop);
  };
  async function saveField(){
    if(!user||!area||!bbox||!fieldName.trim()||!fieldCrop.trim()||saving)return;
    setSaving(true);setSaveError(null);
    const isCurrent=requestScope.current.capture();
    try{
      const saved=await api.post<SavedField>("/agriculture/parcels",{
        name:fieldName.trim(),crop:fieldCrop.trim(),location:"FOGGARA GIS AOI "+bbox.map(n=>n.toFixed(5)).join(","),
        area_ha:Math.max(0.001,Number(polygonAreaHectares(area).toFixed(5))),
        boundary_geojson:area,site_id:null,stage:"initial",
      });
      if(isCurrent()){invalidateResults();setSavedFieldId(saved.id);await loadWorkspace();}
    }catch(error){if(isCurrent())setSaveError(error);}finally{setSaving(false);}
  }
  async function searchScenes(){
    if(!bbox||searching||!rangeValid)return;
    invalidateResults();const isCurrent=requestScope.current.capture();
    setSearching(true);setSearchError(null);setScenes([]);setSelectedSceneId(null);
    try{
      const params=new URLSearchParams({bbox:bbox.join(","),start,end,cloud_cover_lte:"35",limit:"8"});
      const found=await api.get<SceneList>(`/expo/satellite/scenes?${params.toString()}`);
      if(!isCurrent())return;
      setScenes(found.scenes);
      if(found.scenes[0])setSelectedSceneId(found.scenes[0].id);
    }catch(e){if(isCurrent())setSearchError(e);}finally{if(isCurrent()){setSearching(false);setHasSearched(true);}}
  }
  async function preview(){
    if(!area||!allowed||computing)return;
    setComputing(true);setPreviewError(null);setResult(null);
    const isCurrent=requestScope.current.capture();
    try{
      if(user&&savedFieldId!==null){
        // Authenticated evidence: server reads the authoritative saved geometry
        // from this user's organization and masks every spectral index to it.
        const params=new URLSearchParams({parcel_id:String(savedFieldId),start,end,
          include_soil:"false",cloud_cover_lte:"35",preview_index:index});
        if(selectedSceneId)params.set("scene_id",selectedSceneId);
        const study=await api.get<SavedParcelStudy>(`/remote-sensing/studies/field-intelligence?${params.toString()}`);
        if(!isCurrent())return;
        const actual=study.status==="READY"
          ?index==="ndvi"?study.domains?.vegetation?.indices?.ndvi:study.domains?.canopy_moisture?.indices?.ndmi
          :undefined;
        setResult({status:study.status,product:"FOGGARA FIELD / "+index.toUpperCase(),
          index,scene:study.scene,area_ha_estimated:polygonAreaHectares(area),
          geometry_mask_applied:study.geometry_mask_applied,
          indices:actual?{[index]:actual}:{},evidence:study.evidence,persisted:false,
          preview:study.preview,grid:study.spectral_processing?.grid});
      }else{
        const response=await api.post<Preview>("/expo/satellite/ndvi-preview",{boundary_geojson:area,start,end,index,include_preview:true,...(selectedSceneId?{scene_id:selectedSceneId}:{})});
        if(isCurrent())setResult(response);
      }
    }catch(e){if(isCurrent())setPreviewError(e);}finally{if(isCurrent())setComputing(false);}
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
  const activeMetrics=result?.indices?.[index];
  const ndvi=activeMetrics?.statistics?.mean;
  useEffect(()=>{if(result)resultsRef.current?.scrollIntoView({behavior:"smooth",block:"nearest"});},[result]);
  const count=activeMetrics?.pixels?.valid;
  const coverage=activeMetrics?.pixels?.valid_fraction;
  const range=activeMetrics?.statistics;
  const pdfEvidence:FieldPdfEvidence=result?{
    index,status:result.status,scene:result.scene,
    geometry_mask_applied:result.geometry_mask_applied===true,
    metrics:activeMetrics??null,verified:result.evidence.verified===true,
  }:null;

  return <main className="fg-public-gis fg-field-shell" dir={lang==="ar"?"rtl":"ltr"} lang={lang}>
    <header className="fg-field-topbar">
      <div className="fg-field-brand">
        <div className="fg-field-brand-mark" aria-hidden="true"><Sprout size={23}/></div>
        <div className="fg-field-brand-copy"><strong>FOGGARA-DZ <span>GIS</span></strong><small>{v.suite}</small></div>
      </div>
      <div className="fg-field-top-title"><strong>{v.dashboard}</strong><small>{v.subtitle}</small></div>
      <div className="fg-field-top-actions">
        <span className="fg-field-access"><span className="fg-field-status-dot"/>{v.visitor}</span>
        <Link to={user?"/app/gis":"/login?mode=team"} state={user?undefined:{from:{pathname:"/app/gis"}}}
          onClick={persist} className="fg-field-account-link"><ShieldCheck size={16}/>{v.account}<ArrowUpRight size={15}/></Link>
      </div>
    </header>

    <div className="fg-field-workspace">
      <aside className="fg-field-pane fg-field-setup" aria-label={v.left}>
        <header className="fg-field-pane-title">
          <div><small>{v.stepOne}</small><h2><LocateFixed size={19}/>{v.left}</h2></div>
          <span className="fg-field-tool-icon"><Layers3 size={18}/></span>
        </header>
        <section className="fg-field-setup-section">
          <h3>{v.drawing}</h3>
          <p>{v.drawingHelp}</p>
          <div className={area?"fg-field-aoi-state selected":"fg-field-aoi-state"}>
            <span className="fg-field-state-icon">{area?<CheckCircle2 size={18}/>:<MapPinned size={18}/>}</span>
            <div><strong>{area?v.selected:v.pending}</strong><small>{area?v.roi+" · GEOJSON":v.chooseCoords}</small></div>
          </div>
          {area&&bbox?<div className="fg-field-selection-facts">
            <div><span>{v.surface}</span><strong>{polygonAreaHectares(area).toFixed(3)} <small>ha</small></strong></div>
            <div><span>{v.resolution}</span><strong>10–20 <small>m</small></strong></div>
            <div className="fg-field-extent"><span>{v.coordinates}</span><code dir="ltr">{bbox.map(x=>x.toFixed(5)).join("  ·  ")}</code></div>
          </div>:null}
          <button type="button" className="fg-field-inline-tool" aria-expanded={showCoordinates} onClick={()=>setShowCoordinates(x=>!x)}>
            <LocateFixed size={16}/>{v.geoAction}
          </button>
          {showCoordinates?<form className="fg-public-gis-coordinate-entry" onSubmit={selectCoordinates}>
            <strong>{t.coordinateTitle}</strong>
            <label>{t.latitude}<input type="number" required min="18.4" max="37.5" step="any" placeholder="33.80000" value={latitude} onChange={e=>setLatitude(e.target.value)}/></label>
            <label>{t.longitude}<input type="number" required min="-8.8" max="12.2" step="any" placeholder="2.87000" value={longitude} onChange={e=>setLongitude(e.target.value)}/></label>
            <label>{t.side}<input type="number" required min="20" max="300" step="10" value={sideMeters} onChange={e=>setSideMeters(e.target.value)}/></label>
            <button type="submit">{t.setCoordinates}</button>
            {coordinateError?<span role="alert">{t.invalidCoordinates}</span>:null}
          </form>:null}
        </section>
        <section className="fg-field-setup-section">
          <div className="fg-field-section-head"><small>{v.stepTwo}</small><Satellite size={19}/></div>
          <h3>{v.scenePanel}</h3>
          <p className="fg-field-catalog-name"><CloudSun size={16}/>{v.catalog}</p>
          <div className="fg-public-gis-date-row">
            <label>{t.dateStart}<input type="date" max={end} value={start} onChange={e=>{invalidateResults();setStart(e.target.value);setResult(null);setScenes([]);setSelectedSceneId(null);setHasSearched(false);}}/></label>
            <label>{t.dateEnd}<input type="date" min={start} max={ISO(new Date())} value={end} onChange={e=>{invalidateResults();setEnd(e.target.value);setResult(null);setScenes([]);setSelectedSceneId(null);setHasSearched(false);}}/></label>
          </div>
          {!rangeValid?<p className="fg-field-inline-warning" role="status">{v.invalidDate}</p>:null}
          <button type="button" className="fg-public-gis-action fg-field-search" disabled={!bbox||searching||!rangeValid}
            onClick={()=>void searchScenes()}>{searching?<Loader2 size={17} className="fg-field-spin"/>:<Satellite size={17}/>}
            {searching?t.searching:t.search}<ArrowUpRight size={16}/>
          </button>
          <ErrorText error={searchError}/>
          {scenes.length>0?<div className="fg-field-scene-list" aria-live="polite">
            <div className="fg-field-scene-head"><strong>{scenes.length} {t.count}</strong><small>S2 L2A</small></div>
            {scenes.slice(0,8).map(scene=><button type="button" key={scene.id}
              className={scene.id===selectedSceneId?"fg-field-scene active":"fg-field-scene"}
              aria-pressed={scene.id===selectedSceneId}
              title={scene.id}
              onClick={()=>{invalidateResults();setSelectedSceneId(scene.id);setResult(null);setPreviewError(null);}}>
              <span className="fg-field-scene-check">{scene.id===selectedSceneId?<CheckCircle2 size={17}/>:<Satellite size={17}/>}</span>
              <span><strong dir="ltr">{scene.datetime?.slice(0,10)??"—"}</strong><small>{scene.platform??"Sentinel-2"} · {t.cloud}: {scene.cloud_cover_pct?.toFixed(0)??"—"}%</small></span>
            </button>)}
          </div>:hasSearched&&!searching&&!searchError?<p className="fg-field-empty-list">{v.sceneNone}</p>:<p className="fg-field-empty-list">{v.searchPrompt}</p>}
        </section>
        {user?<section id="foggara-field-save" className="fg-field-setup-section fg-field-db" aria-label={lang==="ar"?"قاعدة بيانات المؤسسة":lang==="fr"?"Base de données de l'organisation":"Organization database"}>
          <div className="fg-field-section-head"><small>DATABASE · FOGGARA</small><Database size={18}/></div>
          <h3>{lang==="ar"?"حقول المؤسسة المحفوظة":lang==="fr"?"Parcelles de l'organisation":"Saved organization fields"}</h3>
          {dbStatus?<div className="fg-field-db-stats">
            <span>{dbStatus.database.engine.toUpperCase()}</span>
            <span>{lang==="ar"?"القطع":lang==="fr"?"Parcelles":"Fields"}: {dbStatus.organization.parcels}</span>
            <span>{lang==="ar"?"المحددة":lang==="fr"?"Cartographiées":"Mapped"}: {dbStatus.organization.mapped_parcels}</span>
          </div>:<p>{lang==="ar"?"جارٍ فحص قاعدة البيانات…":lang==="fr"?"Vérification de la base…":"Checking database…"}</p>}
          <ErrorText error={dbError}/>
          {mappedFields.length>0?<div className="fg-field-db-list">
            {mappedFields.slice(0,25).map(p=><button key={p.id} type="button" className={savedFieldId===p.id?"active":""} onClick={()=>selectSavedField(p.id)} aria-pressed={savedFieldId===p.id}>
              <MapPinned size={15}/><span><strong>{p.name}</strong><small>{p.crop} · {p.area_ha.toFixed(2)} ha</small></span>
            </button>)}
          </div>:<p>{lang==="ar"?"لا توجد قطع مرسومة محفوظة لهذه المؤسسة.":lang==="fr"?"Aucune parcelle cartographiée enregistrée.":"No mapped fields saved for this organization."}</p>}
          <div className="fg-field-db-save">
            <label>{lang==="ar"?"اسم القطعة":lang==="fr"?"Nom de la parcelle":"Field name"}<input value={fieldName} onChange={e=>setFieldName(e.target.value)} maxLength={160} placeholder={lang==="ar"?"قطعة الواحة":lang==="fr"?"Parcelle oasis":"Oasis parcel"}/></label>
            <label>{lang==="ar"?"المحصول":lang==="fr"?"Culture":"Crop"}<input value={fieldCrop} onChange={e=>setFieldCrop(e.target.value)} maxLength={80} placeholder={lang==="ar"?"نخيل":lang==="fr"?"Palmier dattier":"Date palm"}/></label>
            <button type="button" disabled={!area||!fieldName.trim()||!fieldCrop.trim()||saving||savedFieldId!==null} onClick={()=>void saveField()}>
              {saving?<Loader2 size={16} className="fg-field-spin"/>:<Database size={16}/>}
              {saving?(lang==="ar"?"جارٍ الحفظ…":lang==="fr"?"Enregistrement…":"Saving…"):
                savedFieldId!==null?(lang==="ar"?"محفوظة في قاعدة البيانات":lang==="fr"?"Enregistrée":"Saved in database"):
                (lang==="ar"?"حفظ القطعة في قاعدة البيانات":lang==="fr"?"Enregistrer dans la base":"Save field to database")}</button>
            <ErrorText error={saveError}/>
          </div>
        </section>:null}
        <div className="fg-field-setup-footer">
          <button type="button" disabled={!area} onClick={exportGeometry}><Download size={16}/>{v.export}</button>
          <button type="button" className="fg-field-pdf-button" disabled={!area||!bbox}
            title={lang==="ar"?"اختر حفظ كملف PDF في نافذة الطباعة":lang==="fr"?"Choisissez Enregistrer au format PDF dans la boîte d'impression":"Choose Save as PDF in the print dialog"}
            onClick={()=>printFoggaraFieldReport(fieldName.trim()||null,savedFieldId)}>
            <Download size={16}/>{t.pdf}
          </button>
          <button type="button" onClick={()=>{setRetry(x=>x+1);change(null);}}><RefreshCw size={16}/>{v.reset}</button>
        </div>
      </aside>

      <section className="fg-field-map-panel fg-public-gis-map" aria-label={v.map}>
        <div className="fg-field-map-top">
          <div><small>{v.workspace} / GIS</small><h2><MapIcon size={20}/>{v.map}</h2></div>
          <div className="fg-field-map-pills">
            <span><span className="fg-field-live-dot"/>{v.roi}</span>
            <button type="button" className="fg-field-map-analyze" disabled={!allowed||computing}
              onClick={()=>void preview()}>{computing?<Loader2 size={15} className="fg-field-spin"/>:<Activity size={15}/>}
              {computing?v.processing:t.run.replace("NDVI",index.toUpperCase())}</button>
          </div>
        </div>
        <div className="fg-field-map-stage">
          <NationalMap key={retry} sites={[]} wilayas={WILAYAS} locale={lang}
            parcelBoundaries={mappedFeatures} selectedParcelId={savedFieldId} onSelectParcel={selectSavedField}
            satelliteScenes={scenes} selectedSceneId={selectedSceneId} onSelectScene={sceneId=>{invalidateResults();setSelectedSceneId(sceneId);}}
            analysisOverlay={result?.status==="READY"&&result.preview?.geometry_mask_applied&&result.preview.index===index
              ?{url:result.preview.data_url,bbox:result.preview.bbox,index}:null}
            draftParcelBoundary={savedFieldId!==null?null:area}
            analysisSelectionBbox={selection}
            onAnalysisSelectionChange={b=>change(b?rectanglePolygon(b):null)}
            onDrawParcelBoundary={geometry=>change(geometry)}
          />
        </div>
        <div className="fg-field-map-bottom">
          <div><MapPinned size={16}/>{bbox?<span dir="ltr">{bbox.map(x=>x.toFixed(4)).join(" / ")}</span>:v.pending}</div>
          <div>{area?<><CheckCircle2 size={15}/>{polygonAreaHectares(area).toFixed(2)} ha</>:<><Info size={15}/>{v.drawingHelp}</>}</div>
        </div>
      </section>

      <aside className="fg-field-pane fg-field-insights" aria-label={v.right}>
        <header className="fg-field-pane-title"><div><small>{v.stepThree}</small><h2><Activity size={20}/>{v.right}</h2></div><span className="fg-field-tool-icon"><Leaf size={19}/></span></header>
        <section className="fg-field-insight-section">
          <h3>{v.analysis}</h3>
          <div className="fg-field-index-picker" role="group" aria-label={v.active}>
            <button type="button" aria-pressed={index==="ndvi"} className={index==="ndvi"?"active":""}
              onClick={()=>{invalidateResults();setIndex("ndvi");}}><Leaf size={16}/>NDVI<small>{v.vegetation}</small></button>
            <button type="button" aria-pressed={index==="ndmi"} className={index==="ndmi"?"active":""}
              onClick={()=>{invalidateResults();setIndex("ndmi");}}><Droplets size={16}/>NDMI<small>{v.canopyWater}</small></button>
          </div>
          <div className="fg-field-analysis-card" ref={resultsRef} aria-live="polite">
            {result?.status==="READY"&&typeof ndvi==="number"?<>
              <div className="fg-field-analysis-label"><span>{v.computed}</span><span>{index.toUpperCase()}</span></div>
              <strong className="fg-field-analysis-value" dir="ltr">{ndvi.toFixed(3)}</strong>
              <div className="fg-field-spectrum" role="img" aria-label={v.active+" "+ndvi.toFixed(3)}>
                <div className="fg-field-spectrum-marker" style={{left:(((Math.max(-1,Math.min(1,ndvi))+1)/2)*100)+"%"}}/>
              </div>
              <div className="fg-field-spectrum-labels" dir="ltr"><span>−1.0</span><span>0</span><span>+1.0</span></div>
              <div className="fg-field-quality">
                <div><span>{v.quality}</span><strong>{typeof coverage==="number"?(coverage*100).toFixed(1)+"%":"—"}</strong></div>
                <div className="fg-field-quality-track"><span style={{width:Math.max(0,Math.min(100,(coverage??0)*100))+"%"}}/></div>
              </div>
              <div className="fg-field-metrics"><div><span>{v.sampleCount}</span><strong dir="ltr">{count??"—"}</strong></div><div><span>{v.range}</span><strong dir="ltr">{range?.min?.toFixed(3)??"—"} / {range?.max?.toFixed(3)??"—"}</strong></div></div>
            </>:result?.status==="NO_USABLE_SCENE"?<div className="fg-field-no-data"><Info size={26}/><strong>{v.waiting}</strong><p>{v.resultUnavailable}</p></div>
            :<div className="fg-field-no-data"><Activity size={29}/><strong>{v.notRun}</strong><p>{v.emptyResult}</p></div>}
          </div>
          {area&&!allowed?<p className="fg-field-inline-warning" role="status">{!rangeValid?v.invalidDate:v.pixelBudget}</p>:null}
          <button type="button" className="fg-public-gis-action fg-field-analyze" disabled={!allowed||computing}
            onClick={()=>void preview()}>{computing?<Loader2 size={18} className="fg-field-spin"/>:<Activity size={18}/>}
            {computing?v.processing:t.run.replace("NDVI",index.toUpperCase())}<ArrowUpRight size={16}/></button>
          <ErrorText error={previewError}/>
          <small className="fg-field-limit-label">{user&&savedFieldId!==null?(lang==="ar"?"تحليل حدود القطعة المحفوظة من قاعدة المؤسسة، دون تعديل بياناتها":lang==="fr"?"Analyse de la limite enregistrée dans la base d’organisation":"Analysis uses the saved field boundary in the organization database"):t.limits}</small>
        </section>
        <section className="fg-field-insight-section fg-field-evidence">
          <h3><ShieldCheck size={17}/>{v.provenance}</h3>
          <div className="fg-field-evidence-row"><span>{v.acquired}</span><strong dir="ltr">{result?.scene?.datetime?.slice(0,10)??selected?.datetime?.slice(0,10)??"—"}</strong></div>
          <div className="fg-field-evidence-row"><span>{v.satellite}</span><strong>Element 84 · S2 L2A</strong></div>
          <div className="fg-field-evidence-row"><span>{v.backend}</span><strong>{result?.status==="READY"?"Rasterio · COMPUTED":v.notRun}</strong></div>
          <div className="fg-field-evidence-row"><span>{v.mask}</span><strong>{result?.geometry_mask_applied?v.maskApplied:"—"}</strong></div>
          {result?.grid?<div className="fg-field-evidence-row"><span>{v.resolution}</span><strong dir="ltr">
            {result.grid.resolution_m} m · {lang==="ar"?"دقة المصدر":lang==="fr"?"source":"source"}: {result.grid.effective_source_resolution_m??"—"} m
          </strong></div>:null}
          <p className="fg-field-evidence-disclaimer"><Info size={16}/>{index==="ndmi"?v.indexNdmiNote:v.limitations}</p>
          <p className="fg-field-evidence-caption">{v.sceneSpecific} {v.estimated}</p>
        </section>
        {user
          ?<button type="button" className="fg-field-save-cta"
              onClick={()=>document.getElementById("foggara-field-save")?.scrollIntoView({behavior:"smooth",block:"start"})}>
              <Database size={17}/>{v.save}<ArrowUpRight size={16}/></button>
          :<Link className="fg-field-save-cta" to="/login?mode=team"
              state={{from:{pathname:"/app/gis"}}} onClick={persist}>
              <Database size={17}/>{v.save}<ArrowUpRight size={16}/></Link>}
        <p className="fg-field-save-note">{v.noAccess}</p>
      </aside>
    </div>
    <footer className="fg-field-footer"><span>FOGGARA-DZ · SIREP OASES NEXUS WEFEH</span><span>MapLibre GL JS · OpenStreetMap © contributors · Copernicus Sentinel-2 · Element 84 · Rasterio</span></footer>
    {area&&bbox?<FieldPdfReport
      lang={lang} geometry={area} bbox={bbox} estimatedAreaHa={polygonAreaHectares(area)}
      fieldName={fieldName.trim()||null} crop={fieldCrop.trim()||null} fieldId={savedFieldId}
      period={{start,end}} evidence={pdfEvidence} createdAt={new Date().toISOString()}
    />:null}
  </main>;
}

