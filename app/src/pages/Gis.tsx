import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { MapPinned } from "lucide-react";
import { api } from "@/lib/api";
import {polygonAreaHectares,polygonBoundingBox} from "@/lib/geojson-area";
import type { GisSite, WilayaMeta } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorText, DemoBadge } from "@/components/common";
import { OperationalEmptyState } from "@/components/OperationalEmptyState";
import { NationalMap, type AnalysisRasterOverlay, type ParcelBoundaryFeature, type SatelliteRasterOverlay, type SatelliteScene } from "@/components/NationalMap";
import { setActiveParcelId, useOperationalContext } from "@/lib/operational-context";
import "./command-center.css";
import "./gis-direct-workflow.css";

type SpatialFeature = {
  type: "Feature";
  id: number;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id: number;
    name: string;
    wilaya: string;
    commune: string | null;
    is_demo: boolean;
    distance_m?: number;
  };
};

type ParcelBoundariesGeoJSON = {
  type: "FeatureCollection";
  features: ParcelBoundaryFeature[];
  metadata: {
    organization_scoped: boolean;
    count: number;
    crs: string;
    spatial_engine: string;
    geometry_type: "Polygon";
  };
};

type SitesGeoJSON = {
  type: "FeatureCollection";
  features: SpatialFeature[];
  metadata: {
    organization_scoped: boolean;
    count: number;
    crs: string;
    spatial_engine: string;
  };
};

type GisOperationalStatus = {
  database: {connected:boolean;engine:string;persistent_storage_claim:string;postgis_extension_verified:boolean};
  organization: {sites:number;projects:number;parcels:number;mapped_parcels:number;observations:number;satellite_observations:number};
  analysis: {satellite_provider:string;raster_engine:string;provider_online_verified:boolean;note:string};
};

type PolygonGeometry = {
  type: "Polygon";
  coordinates: [number, number][][];
};

type ParcelRecord = {
  id: number;
  name: string;
  crop: string;
  area_ha: number;
  location: string;
  site_id: number | null;
  lat: number | null;
  lon: number | null;
  boundary_geojson: PolygonGeometry | null;
  archived: boolean;
  is_demo: boolean;
};

function extractPolygonGeometry(value: unknown): PolygonGeometry | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.type === "Polygon" && Array.isArray(record.coordinates)) {
    return record as unknown as PolygonGeometry;
  }
  if (record.type === "Feature") {
    return extractPolygonGeometry(record.geometry);
  }
  if (record.type === "FeatureCollection" && Array.isArray(record.features)) {
    for (const feature of record.features) {
      const polygon = extractPolygonGeometry(feature);
      if (polygon) return polygon;
    }
  }
  return null;
}

type RemoteIndex = "ndvi" | "evi" | "savi" | "ndwi" | "ndmi" | "lswi" | "bsi";

type RasterAnalysis = {
  scene_id: string;
  index: RemoteIndex;
  formula_version: string;
  processing_plan_fingerprint: string;
  analysis_bbox_wgs84: [number, number, number, number];
  grid: {
    crs: string;
    width: number;
    height: number;
    resolution_m: number;
    effective_source_resolution_m?: number | null;
    resampled?: boolean;
  };
  mask: {
    method: string;
    masked_scl_classes: number[];
    cloud_masked_pixel_count: number;
    source_nodata_pixel_count: number;
    formula_nodata_pixel_count: number;
    geometry_mask_applied?: boolean;
    outside_geometry_pixel_count?: number;
  };
  pixels: {
    total: number;
    valid: number;
    masked: number;
    valid_fraction: number;
  };
  statistics: {
    min: number | null;
    max: number | null;
    mean: number | null;
    median: number | null;
  };
  provenance: {
    provider_metadata: string;
    derived_index: string;
    verified: boolean;
    persisted: boolean;
  };
};

type StudyScene = {
  scene_id: string;
  datetime: string | null;
  acquisition_age_hours: number | null;
  cloud_cover_pct: number | null;
  platform: string | null;
  provider: string;
  statistics: { min: number | null; max: number | null; mean: number | null; median: number | null };
  pixels: { total: number; valid: number; masked: number; valid_fraction: number };
  formula_version: string;
  processing_plan_fingerprint: string;
  quality_indicator: {
    score: number;
    grade: string;
    usability: string;
    standard_claim: boolean;
  };
};

type TimeSeriesStudy = {
  study_type: string;
  provider: string;
  collection: string;
  sensor_product: string;
  bbox_wgs84: [number, number, number, number];
  period: { start: string; end: string };
  scene_count: number;
  requested_scene_count: number;
  series: StudyScene[];
  trend: {
    scene_count: number;
    direction: "increasing" | "decreasing" | "stable" | "insufficient_data";
    delta: number | null;
    slope_per_day: number | null;
    first_mean?: number | null;
    last_mean?: number | null;
    interpretation_status: string;
    note?: string;
  };
  quality_summary: { mean_operational_score: number | null; indicator: string };
  methodology: {
    quality_framework: string;
    evidence_chain: Record<string,string>;
    standards: Array<{id:string;name:string;organization:string;role:string;url:string;claim:string}>;
  };
  limitations: string[];
};

type FieldIndexResult = {
  statistics: { min: number | null; max: number | null; mean: number | null; median: number | null };
  pixels: { total: number; valid: number; masked: number; valid_fraction: number };
  formula_version: string;
  formula: string;
  application_domain: string;
  reference_url: string | null;
};

type SoilContextProperty = {
  status: string;
  mean_0_20: number | null;
  spatial_spread: number | null;
  prediction_stdev_0_20: number | null;
  sample_count: number;
  label: string;
  unit: string;
  resolution_m: number;
  depth_cm: string;
};

type CropProfile = {
  id: string;
  label: string;
  declared_crop: string | null;
  crop_identity_status: string;
  category: string;
  priority_indices: string[];
  modules: string[];
  limitations: string[];
};

type FieldIntelligenceStudy = {
  status: "READY" | "NO_USABLE_SCENE";
  parcel_id?: number | null;
  sample_geometry?: string;
  geometry_mask_applied?: boolean;
  study_type?: string;
  bbox_wgs84: [number, number, number, number];
  period: { start: string; end: string };
  crop_profile: CropProfile;
  scene: (SatelliteScene & { acquisition_age_hours?: number | null }) | null;
  quality_indicator?: { score: number; grade: string; usability: string; standard_claim: boolean };
  spectral_processing?: {
    grid: { crs: string; width: number; height: number; resolution_m: number; effective_source_resolution_m?: number | null };
    mask: { method: string; masked_scl_classes: number[]; cloud_masked_pixel_count: number; source_nodata_pixel_count: number; geometry_mask_applied?: boolean; outside_geometry_pixel_count?: number };
    processing_plan_fingerprint: string;
  };
  domains: Record<string, {
    status: string;
    indices?: Record<string, FieldIndexResult>;
    provider?: string | null;
    context?: {
      provider: string;
      resolution_m: number;
      properties: Record<string, SoilContextProperty>;
      available_properties: string[];
      unavailable_properties: string[];
      evidence_status: string;
      attribution: string;
      limitations: string[];
    } | null;
    profile?: CropProfile;
    interpretation: string;
  }>;
  global_sources?: Array<{
    id: string;
    name: string;
    license: string;
    role: string;
    status: string;
    url: string;
  }>;
  soil_context: {
    provider: string;
    resolution_m: number;
    properties: Record<string, SoilContextProperty>;
    available_properties: string[];
    unavailable_properties: string[];
    evidence_status: string;
    attribution: string;
    limitations: string[];
  } | null;
  evidence?: Record<string, string | boolean>;
  limitations?: string[];
};


function bboxPolygon(bbox: [number, number, number, number]): PolygonGeometry {
  const [west,south,east,north]=bbox;
  return {
    type:"Polygon",
    coordinates:[[
      [west,south],
      [east,south],
      [east,north],
      [west,north],
      [west,south],
    ]],
  };
}

function rasterBudget(bbox: [number, number, number, number]) {
  const [west, south, east, north] = bbox;
  const valid = [west, south, east, north].every(Number.isFinite)
    && west >= -180 && east <= 180 && south >= -90 && north <= 90
    && west < east && south < north;
  if (!valid) {
    return { allowed: false, pixels: 0, width: 0, height: 0, areaKm2: 0 };
  }
  const midLat = ((south + north) / 2) * Math.PI / 180;
  const widthM = (east - west) * 111_320 * Math.max(Math.cos(midLat), 0.01);
  const heightM = (north - south) * 110_574;
  const width = Math.max(1, Math.ceil(widthM / 10));
  const height = Math.max(1, Math.ceil(heightM / 10));
  const pixels = width * height;
  return {
    allowed: width <= 2048 && height <= 2048 && pixels <= 1_000_000,
    pixels,
    width,
    height,
    areaKm2: Math.max(0, (widthM * heightM) / 1_000_000),
  };
}

function parcelBbox(feature: ParcelBoundaryFeature | null): [number, number, number, number] | null {
  if (!feature || !Array.isArray(feature.geometry.coordinates)) return null;
  const ring = feature.geometry.coordinates[0];
  if (!Array.isArray(ring)) return null;
  const points = ring
    .filter((point): point is [number, number] =>
      Array.isArray(point)
      && point.length >= 2
      && Number.isFinite(Number(point[0]))
      && Number.isFinite(Number(point[1]))
    )
    .map((point) => [Number(point[0]), Number(point[1])] as [number, number]);
  if (!points.length) return null;
  const lons = points.map(([lon]) => lon);
  const lats = points.map(([, lat]) => lat);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
}

export default function Gis() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<GisSite[] | null>(null);
  const [gisStatus,setGisStatus] = useState<GisOperationalStatus | null>(null);
  const [gisStatusError,setGisStatusError] = useState<unknown>(null);
  const [wilayas, setWilayas] = useState<WilayaMeta[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const wilayaFilter = searchParams.get("wilaya") || "";
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const { projectId: activeProjectId, parcelId: selectedParcelId } = useOperationalContext();
  const [parcels, setParcels] = useState<ParcelRecord[]>([]);
  const boundaryImportRef = useRef<HTMLInputElement | null>(null);
  const [boundaryBusy, setBoundaryBusy] = useState(false);
  const [boundaryError, setBoundaryError] = useState<unknown>(null);
  const [nearest, setNearest] = useState<SpatialFeature[]>([]);
  const [spatialEngine, setSpatialEngine] = useState("—");
  const [error, setError] = useState<unknown>(null);
  const [satelliteScenes, setSatelliteScenes] = useState<SatelliteScene[]>([]);
  const [parcelBoundaries, setParcelBoundaries] = useState<ParcelBoundaryFeature[]>([]);
  const [satelliteLoading, setSatelliteLoading] = useState(false);
  const [satelliteError, setSatelliteError] = useState<unknown>(null);
  const [viewportBbox, setViewportBbox] = useState<[number, number, number, number]>([-8.8, 18.4, 12.2, 37.5]);
  const [manualAnalysisBbox, setManualAnalysisBbox] = useState<[number, number, number, number] | null>(null);
  const [draftPolygon,setDraftPolygon] = useState<PolygonGeometry | null>(null);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldCrop, setNewFieldCrop] = useState("");
  const [fieldSaving, setFieldSaving] = useState(false);
  const [fieldError, setFieldError] = useState<unknown>(null);
  const [fieldIntelligenceLoading, setFieldIntelligenceLoading] = useState(false);
  const [fieldIntelligenceError, setFieldIntelligenceError] = useState<unknown>(null);
  const [fieldIntelligenceResult, setFieldIntelligenceResult] = useState<FieldIntelligenceStudy | null>(null);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultStart = useMemo(() => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - 30);
    return date.toISOString().slice(0, 10);
  }, []);
  const [sceneStart, setSceneStart] = useState(defaultStart);
  const [sceneEnd, setSceneEnd] = useState(today);
  const [cloudCover, setCloudCover] = useState(25);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<RemoteIndex>("ndvi");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<unknown>(null);
  const [analysisResult, setAnalysisResult] = useState<RasterAnalysis | null>(null);
  const [satelliteOverlay, setSatelliteOverlay] = useState<SatelliteRasterOverlay | null>(null);
  const [satelliteViewLoading, setSatelliteViewLoading] = useState(false);
  const [analysisOverlay, setAnalysisOverlay] = useState<AnalysisRasterOverlay | null>(null);
  const [analysisSaving, setAnalysisSaving] = useState(false);
  const [analysisSaved, setAnalysisSaved] = useState(false);
  const [studyLoading, setStudyLoading] = useState(false);
  const [studyError, setStudyError] = useState<unknown>(null);
  const [studyResult, setStudyResult] = useState<TimeSeriesStudy | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  useEffect(() => {
    api.get<GisOperationalStatus>("/gis/operational-status")
      .then(setGisStatus)
      .catch(setGisStatusError);
    api.get<{ count: number; sites: GisSite[] }>("/gis/sites")
      .then((r) => setData(r.sites))
      .catch(setError);
    api.get<{ count: number; wilayas: WilayaMeta[] }>("/meta/wilayas")
      .then((r) => setWilayas(r.wilayas))
      .catch(() => setWilayas([]));
    api.get<SitesGeoJSON>("/gis/sites.geojson")
      .then((r) => setSpatialEngine(r.metadata.spatial_engine))
      .catch(setError);
    api.get<ParcelBoundariesGeoJSON>("/gis/parcels.geojson")
      .then((r) => setParcelBoundaries(r.features))
      .catch(() => setParcelBoundaries([]));
    api.get<ParcelRecord[]>("/agriculture/parcels")
      .then((rows) => setParcels(rows.filter((row) => !row.archived)))
      .catch(setError);
  }, []);

  const filtered = useMemo(() => {
    if (!data) return null;
    if (!wilayaFilter) return data;
    const w = wilayas.find((x) => x.code === wilayaFilter);
    const names = [wilayaFilter, ...(w ? [w.ar, w.fr, w.en] : [])].map((name) => name.trim().toLocaleLowerCase());
    return data.filter((g) => names.includes(g.site.wilaya.trim().toLocaleLowerCase()));
  }, [data, wilayaFilter, wilayas]);

  const locale = i18n.language;
  const lang = locale === "fr" ? "fr" : locale === "en" ? "en" : "ar";
  const copy = lang === "fr"
    ? { eyebrow: "SIG NATIONAL · FOGGARA-DZ", title: "Territoire, ressources et projets dans une vue opérationnelle.", sites: "Sites visibles", projects: "Projets", resources: "Ressources", layers: "Couches opérationnelles", table: "Registre spatial", all: "Toute l’Algérie", selected: "Site sélectionné", nearest: "Sites les plus proches", distance: "Distance", engine: "Moteur spatial", noNearby: "Aucun autre site à proximité" }
    : lang === "en"
      ? { eyebrow: "NATIONAL GIS · FOGGARA-DZ", title: "Territory, resources and projects in one operational view.", sites: "Visible sites", projects: "Projects", resources: "Resources", layers: "Operational layers", table: "Spatial register", all: "All Algeria", selected: "Selected site", nearest: "Nearest sites", distance: "Distance", engine: "Spatial engine", noNearby: "No other nearby sites" }
      : { eyebrow: "GIS الوطني · FOGGARA-DZ", title: "الإقليم والموارد والمشاريع في رؤية تشغيلية واحدة.", sites: "المواقع الظاهرة", projects: "المشاريع", resources: "الموارد", layers: "الطبقات التشغيلية", table: "السجل المكاني", all: "كل الجزائر", selected: "الموقع المحدد", nearest: "أقرب المواقع", distance: "المسافة", engine: "المحرك المكاني", noNearby: "لا توجد مواقع قريبة أخرى" };

  const startCopy = lang === "fr"
    ? {
        title: "Ajoutez d’abord une géographie réelle",
        body: "Le SIG reste national même sans données d’organisation. Pour exploiter les parcelles, la télédétection et les ressources, créez un site réel puis une parcelle.",
        setup: "Créer le premier site",
        agriculture: "Ouvrir l’espace agricole",
        steps: ["Site avec wilaya et coordonnées", "Parcelle avec géométrie ou GeoJSON", "Recherche Sentinel-2 et analyse spatiale"],
      }
    : lang === "en"
      ? {
          title: "Add real geography first",
          body: "The GIS remains a national map even when the organization has no records. To use parcels, remote sensing and resources, create a real site and then a parcel.",
          setup: "Create first site",
          agriculture: "Open agriculture workspace",
          steps: ["Site with wilaya and coordinates", "Parcel geometry or GeoJSON", "Sentinel-2 search and spatial analysis"],
        }
      : {
          title: "أضف جغرافيا حقيقية أولًا",
          body: "يبقى GIS خريطة وطنية حتى عندما لا تملك المؤسسة سجلات بعد. لتشغيل القطع والاستشعار عن بعد والموارد، أنشئ موقعًا حقيقيًا ثم قطعة زراعية.",
          setup: "إنشاء أول موقع",
          agriculture: "فتح مساحة الزراعة",
          steps: ["موقع بولاية وإحداثيات", "حدود قطعة أو GeoJSON", "بحث Sentinel-2 وتحليل مكاني"],
        };

  const satelliteCopy = lang === "fr"
    ? { title: "Catalogue satellite en direct", provider: "Sentinel-2 L2A · Element 84 Earth Search", start: "Du", end: "Au", clouds: "Nuages max.", search: "Rechercher dans la vue", searching: "Recherche…", found: "scènes trouvées", empty: "Aucune scène dans la vue et la période choisies.", metadata: "Métadonnées fournisseur observées — aucune valeur NDVI n’est inventée.", searchParcel: "Rechercher pour la parcelle", searchView: "Rechercher dans la vue", parcelScope: "Parcelle sélectionnée", viewScope: "Vue courante", areaScope: "Zone d’analyse sélectionnée", trueColor: "Vue satellite réelle", trueColorLoading: "Chargement satellite…" }
    : lang === "en"
      ? { title: "Live satellite catalogue", provider: "Sentinel-2 L2A · Element 84 Earth Search", start: "From", end: "To", clouds: "Max clouds", search: "Search current view", searching: "Searching…", found: "scenes found", empty: "No scenes found for the current view and period.", metadata: "Observed provider metadata — no NDVI value is invented.", searchParcel: "Search selected parcel", searchView: "Search current view", parcelScope: "Selected parcel", viewScope: "Current view", areaScope: "Selected analysis area", trueColor: "Real satellite view", trueColorLoading: "Loading satellite…" }
      : { title: "كتالوج الأقمار الصناعية الحي", provider: "Sentinel-2 L2A · Element 84 Earth Search", start: "من", end: "إلى", clouds: "أقصى غيوم", search: "ابحث في نطاق الخريطة", searching: "جارٍ البحث…", found: "مشاهد موجودة", empty: "لا توجد مشاهد في النطاق والفترة المحددين.", metadata: "بيانات وصفية حقيقية من المزود — لا يتم اختراع أي قيمة NDVI.", searchParcel: "ابحث للقطعة المحددة", searchView: "ابحث في نطاق الخريطة", parcelScope: "القطعة المحددة", viewScope: "نطاق الخريطة", areaScope: "منطقة التحليل المحددة", trueColor: "عرض فضائي حقيقي", trueColorLoading: "جارٍ تحميل الصورة الفضائية…" };

  const analysisCopy = lang === "fr"
    ? { title: "Analyse satellite réelle", scene: "Scène", index: "Indice", run: "Analyser la vue", runParcel: "Analyser la parcelle", running: "Analyse…", zoom: "Zoomez davantage sur la parcelle avant l’analyse.", ready: "Zone prête", area: "zone estimée", pixels: "pixels 10 m", mean: "Moyenne", median: "Médiane", min: "Minimum", max: "Maximum", valid: "Pixels valides", masked: "Masqués", computed: "COMPUTED", notVerified: "NON VÉRIFIÉ", selectScene: "Sélectionnez une scène Sentinel-2.", note: "Calcul en direct depuis les COG Sentinel-2 avec masque SCL. Aucun résultat n’est déclaré vérifié.", save: "Enregistrer dans la parcelle", saving: "Enregistrement…", saved: "Enregistré comme INFERRED", sourceRes: "Résolution source", resampled: "rééchantillonné", study: "Étude temporelle", studying: "Étude…", studyTitle: "Étude multi-temporelle réelle", studyScenes: "Scènes analysées", studyTrend: "Tendance", studyDelta: "Variation", studySlope: "Pente / jour", studyQuality: "Qualité opérationnelle", trendIncreasing: "hausse", trendDecreasing: "baisse", trendStable: "stable", trendInsufficient: "données insuffisantes", validPixels: "pixels valides", researchBasis: "Base scientifique et traçabilité" }
    : lang === "en"
      ? { title: "Real satellite analysis", scene: "Scene", index: "Index", run: "Analyze current view", runParcel: "Analyze selected parcel", running: "Analyzing…", zoom: "Zoom further into the field before analysis.", ready: "Area ready", area: "estimated area", pixels: "10 m pixels", mean: "Mean", median: "Median", min: "Minimum", max: "Maximum", valid: "Valid pixels", masked: "Masked", computed: "COMPUTED", notVerified: "NOT VERIFIED", selectScene: "Select a Sentinel-2 scene.", note: "Computed live from Sentinel-2 COGs with SCL masking. Results are never marked verified.", save: "Save to parcel", saving: "Saving…", saved: "Saved as INFERRED", sourceRes: "Source resolution", resampled: "resampled", study: "Time-series study", studying: "Studying…", studyTitle: "Real multi-temporal study", studyScenes: "Analyzed scenes", studyTrend: "Trend", studyDelta: "Change", studySlope: "Slope / day", studyQuality: "Operational quality", trendIncreasing: "increasing", trendDecreasing: "decreasing", trendStable: "stable", trendInsufficient: "insufficient data", validPixels: "valid pixels", researchBasis: "Scientific basis and traceability" }
      : { title: "التحليل الفضائي الحقيقي", scene: "المشهد", index: "المؤشر", run: "حلّل نطاق الخريطة", runParcel: "حلّل القطعة المحددة", running: "جارٍ التحليل…", zoom: "كبّر الخريطة أكثر إلى مستوى الحقل قبل التحليل.", ready: "النطاق جاهز", area: "المساحة التقديرية", pixels: "بكسلات 10م", mean: "المتوسط", median: "الوسيط", min: "الأدنى", max: "الأعلى", valid: "البكسلات الصالحة", masked: "المحجوبة", computed: "COMPUTED", notVerified: "غير متحقق", selectScene: "اختر مشهد Sentinel-2 أولًا.", note: "حساب حي من ملفات Sentinel-2 COG مع قناع SCL. النتائج لا تُصنّف VERIFIED.", save: "احفظ في سجل القطعة", saving: "جارٍ الحفظ…", saved: "حُفظ كـ INFERRED", sourceRes: "دقة المصدر", resampled: "أعيد أخذ العينات", study: "دراسة زمنية", studying: "جارٍ إعداد الدراسة…", studyTitle: "دراسة فعلية متعددة الأزمنة", studyScenes: "المشاهد المحللة", studyTrend: "الاتجاه", studyDelta: "التغير", studySlope: "الميل / يوم", studyQuality: "الجودة التشغيلية", trendIncreasing: "تصاعدي", trendDecreasing: "تنازلي", trendStable: "مستقر", trendInsufficient: "بيانات غير كافية", validPixels: "بكسلات صالحة", researchBasis: "الأساس العلمي وقابلية التتبع" };

  const guideCopy = lang === "fr"
    ? {
        title: "Analyse de parcelle — mode simple",
        body: "Choisissez une parcelle, puis lancez une analyse complète. Les détails STAC, GeoJSON et indices restent disponibles dans les outils avancés.",
        project: "1 · Projet (facultatif)",
        parcel: "2 · Parcelle",
        analyze: "3 · Analyser",
        result: "4 · Résultat",
        projectMissing: "Un projet n’est pas obligatoire pour analyser une zone. Vous pouvez en lier un plus tard.",
        chooseProject: "Gérer les projets", optional: "Facultatif",
        chooseParcel: "Choisir une parcelle",
        areaHint: "Aucune parcelle ? Utilisez « Zone d’analyse » sur la carte, choisissez 2 coins, puis enregistrez la parcelle.",
        analyzeNow: "Analyser la parcelle",
        analyzing: "Analyse en cours…",
        advanced: "Outils avancés",
        hideAdvanced: "Masquer les outils avancés",
        noResult: "Aucune analyse lancée pour cette parcelle.",
        vegetation: "Vigueur végétale",
        moisture: "Humidité",
        soil: "Sol",
        quality: "Qualité",
        selectedArea: "Zone sélectionnée",
        ready: "Prêt",
        missing: "À compléter",
      }
    : lang === "en"
      ? {
          title: "Field analysis — simple mode",
          body: "Choose a field, then run one complete analysis. STAC, GeoJSON and raw index controls remain available under Advanced tools.",
          project: "1 · Project (optional)",
          parcel: "2 · Field",
          analyze: "3 · Analyze",
          result: "4 · Result",
          projectMissing: "A project is optional for area analysis. You may link one later.",
          chooseProject: "Manage projects", optional: "Optional",
          chooseParcel: "Choose a field",
          areaHint: "No field yet? Use “Select analysis area” on the map, pick 2 corners, then save the field.",
          analyzeNow: "Analyze field",
          analyzing: "Analyzing…",
          advanced: "Advanced tools",
          hideAdvanced: "Hide advanced tools",
          noResult: "No analysis has been run for this field.",
          vegetation: "Vegetation vigor",
          moisture: "Moisture",
          soil: "Soil",
          quality: "Quality",
          selectedArea: "Selected area",
          ready: "Ready",
          missing: "Missing",
        }
      : {
          title: "تحليل الحقل — الوضع البسيط",
          body: "اختر القطعة ثم شغّل تحليلًا واحدًا شاملًا. تفاصيل STAC وGeoJSON واختيار المؤشرات تبقى داخل الأدوات المتقدمة.",
          project: "1 · المشروع (اختياري)",
          parcel: "2 · القطعة",
          analyze: "3 · التحليل",
          result: "4 · النتيجة",
          projectMissing: "المشروع اختياري لتحليل منطقة من الخريطة. يمكنك ربطه لاحقًا.",
          chooseProject: "إدارة المشاريع", optional: "اختياري",
          chooseParcel: "اختر القطعة",
          areaHint: "لا توجد قطعة؟ اضغط «حدد منطقة التحليل» على الخريطة، اختر زاويتين، ثم احفظ القطعة.",
          analyzeNow: "حلّل الحقل الآن",
          analyzing: "جارٍ تحليل الحقل…",
          advanced: "أدوات متقدمة",
          hideAdvanced: "إخفاء الأدوات المتقدمة",
          noResult: "لم يتم تشغيل تحليل لهذه القطعة بعد.",
          vegetation: "حيوية النبات",
          moisture: "الرطوبة",
          soil: "التربة",
          quality: "جودة البيانات",
          selectedArea: "منطقة محددة",
          ready: "جاهز",
          missing: "ناقص",
        };

  const parcelCopy = lang === "fr"
    ? { title: "Espace parcellaire", select: "Choisir une parcelle", none: "Aucune parcelle", mapped: "Limite cartographiée", unmapped: "Limite à définir", importGeoJson: "Importer GeoJSON", exportGeoJson: "Exporter GeoJSON", clearBoundary: "Supprimer la limite", clearConfirm: "Supprimer la limite cartographique de cette parcelle ?", importError: "Le fichier doit contenir un Polygon GeoJSON.", hint: "Sélectionnez une parcelle, puis dessinez sa limite sur la carte ou importez un Polygon GeoJSON. La validation finale est effectuée par le serveur." }
    : lang === "en"
      ? { title: "Parcel workspace", select: "Select parcel", none: "No parcel selected", mapped: "Boundary mapped", unmapped: "Boundary required", importGeoJson: "Import GeoJSON", exportGeoJson: "Export GeoJSON", clearBoundary: "Clear boundary", clearConfirm: "Remove the mapped boundary from this parcel?", importError: "The file must contain a GeoJSON Polygon.", hint: "Select any parcel, then draw its boundary on the map or import a GeoJSON Polygon. Final geometry validation is server-side." }
      : { title: "مساحة عمل القطعة", select: "اختر قطعة", none: "لم تُحدد قطعة", mapped: "الحدود مرسومة", unmapped: "تحتاج إلى حدود", importGeoJson: "استيراد GeoJSON", exportGeoJson: "تصدير GeoJSON", clearBoundary: "مسح الحدود", clearConfirm: "هل تريد إزالة الحدود المكانية لهذه القطعة؟", importError: "يجب أن يحتوي الملف على Polygon بصيغة GeoJSON.", hint: "اختر أي قطعة ثم ارسم حدودها على الخريطة أو استورد Polygon بصيغة GeoJSON. التحقق النهائي من الهندسة يتم في الخادم." };

  const fieldCopy = lang === "fr"
    ? { create: "Créer la parcelle depuis la zone", name: "Nom de la parcelle", crop: "Culture", namePlaceholder: "Ex. Oasis Nord", cropPlaceholder: "Dattier, blé, tomate…", selectedArea: "Zone manuelle sélectionnée", save: "Enregistrer la parcelle", saving: "Enregistrement…", refine: "Après l’enregistrement, vous pouvez redessiner une limite polygonale précise.", analyzeAll: "ANALYSER TOUT", analyzingAll: "Analyse globale…", allTitle: "Intelligence complète de la parcelle", allHint: "Végétation · humidité · eau · sol de surface · contexte sol · culture", soil: "Contexte sol iSDA", cropProfile: "Profil culture", latestScene: "Dernière scène utilisable", quality: "Qualité", noData: "Aucune donnée disponible", providerModel: "Modèle spatial — non vérifié terrain" }
    : lang === "en"
      ? { create: "Create field from selected area", name: "Field name", crop: "Crop", namePlaceholder: "e.g. North Oasis", cropPlaceholder: "Date palm, wheat, tomato…", selectedArea: "Manual area selected", save: "Save field", saving: "Saving…", refine: "After saving, you can redraw a precise polygon boundary.", analyzeAll: "ANALYZE ALL", analyzingAll: "Full analysis…", allTitle: "Complete field intelligence", allHint: "Vegetation · moisture · water · soil surface · soil context · crop", soil: "iSDA soil context", cropProfile: "Crop profile", latestScene: "Latest usable scene", quality: "Quality", noData: "No data available", providerModel: "Spatial model — not field verified" }
      : { create: "إنشاء القطعة من المساحة المحددة", name: "اسم القطعة", crop: "المحصول", namePlaceholder: "مثال: واحة الشمال", cropPlaceholder: "نخيل تمر، قمح، طماطم…", selectedArea: "تم تحديد المساحة يدويًا", save: "حفظ القطعة", saving: "جارٍ الحفظ…", refine: "بعد الحفظ يمكنك إعادة رسم حدود Polygon دقيقة.", analyzeAll: "تحليل الكل", analyzingAll: "جارٍ التحليل الشامل…", allTitle: "الذكاء المتكامل للقطعة", allHint: "النبات · الرطوبة · المياه · سطح التربة · سياق التربة · المحصول", soil: "سياق التربة iSDA", cropProfile: "ملف المحصول", latestScene: "أحدث مشهد صالح", quality: "الجودة", noData: "لا توجد بيانات", providerModel: "نموذج مكاني — غير متحقق ميدانيًا" };

  const summary = useMemo(() => {
    const rows = filtered ?? [];
    return {
      sites: rows.length,
      projects: rows.reduce((n, row) => n + row.projects.length, 0),
      resources: rows.reduce((n, row) => n + row.resources.length, 0),
      assets: rows.reduce((n, row) => n + row.assets.length, 0),
    };
  }, [filtered]);

  const selectWilaya = (code: string) => {
    const next = new URLSearchParams(searchParams);
    if (code) next.set("wilaya", code);
    else next.delete("wilaya");
    setSearchParams(next);
  };

  const activeProjectSiteId = useMemo(
    () => (data ?? []).find((entry) => entry.projects.some((project) => project.id === activeProjectId))?.site.id ?? null,
    [data, activeProjectId],
  );
  const scopedParcels = useMemo(
    () => activeProjectSiteId ? parcels.filter((parcel) => parcel.site_id === activeProjectSiteId) : parcels,
    [parcels, activeProjectSiteId],
  );
  const selectedSite = useMemo(
    () => (data ?? []).find((entry) => entry.site.id === (selectedSiteId ?? activeProjectSiteId)) ?? null,
    [data, selectedSiteId, activeProjectSiteId],
  );

  useEffect(() => {
    if (!activeProjectSiteId || !scopedParcels.length) return;
    if (!selectedParcelId || !scopedParcels.some((parcel) => parcel.id === selectedParcelId)) {
      setActiveParcelId(scopedParcels[0].id);
    }
  }, [activeProjectSiteId, scopedParcels, selectedParcelId]);

  const selectedParcel = useMemo(
    () => parcelBoundaries.find((feature) => feature.properties.id === selectedParcelId) ?? null,
    [parcelBoundaries, selectedParcelId],
  );
  const selectedParcelRecord = useMemo(
    () => parcels.find((parcel) => parcel.id === selectedParcelId) ?? null,
    [parcels, selectedParcelId],
  );
  const selectedParcelBbox = useMemo(() => parcelBbox(selectedParcel), [selectedParcel]);
  const analysisBbox = selectedParcelBbox ?? manualAnalysisBbox ?? viewportBbox;

  const selectedScene = useMemo(
    () => satelliteScenes.find((scene) => scene.id === selectedSceneId) ?? null,
    [satelliteScenes, selectedSceneId],
  );
  const currentRasterBudget = useMemo(() => rasterBudget(analysisBbox), [analysisBbox]);
  const activeProject = useMemo(
    () => (data ?? []).flatMap((entry) => entry.projects).find((project) => project.id === activeProjectId) ?? null,
    [data, activeProjectId],
  );
  const fieldIndexMean = (key: string) => {
    if (!fieldIntelligenceResult || fieldIntelligenceResult.status !== "READY") return null;
    for (const domain of Object.values(fieldIntelligenceResult.domains)) {
      const mean = domain.indices?.[key]?.statistics.mean;
      if (typeof mean === "number") return mean;
    }
    return null;
  };
  const ndviMean = fieldIndexMean("ndvi");
  const moistureMean = fieldIndexMean("ndmi") ?? fieldIndexMean("ndwi") ?? fieldIndexMean("lswi");
  const soilPh = fieldIntelligenceResult?.soil_context?.properties?.ph?.mean_0_20 ?? null;
  // An AOI or saved parcel is a valid analysis target even without a project.
  // The backend performs bounded, real provider/raster processing and enforces ownership.
  // For saved parcels, the server resolves the authoritative geometry by ID.
  // Unsaved drawn polygons must be saved before analysis; a bbox-only query
  // would include neighbouring farms and misrepresent the actual field.
  const savedParcelHasLocation = Boolean(selectedParcelRecord && (
    selectedParcelRecord.boundary_geojson
    || (typeof selectedParcelRecord.lat === "number" && typeof selectedParcelRecord.lon === "number")
  ));
  const simpleAnalysisReady = Boolean(
    selectedParcelId
      ? savedParcelHasLocation
        && (!selectedParcelRecord?.boundary_geojson
          || (currentRasterBudget.allowed && currentRasterBudget.pixels <= 250_000))
      : manualAnalysisBbox && !draftPolygon && newFieldCrop.trim()
        && currentRasterBudget.allowed && currentRasterBudget.pixels <= 250_000
  );

  useEffect(() => {
    setAnalysisResult(null);
    setAnalysisError(null);
    setAnalysisOverlay(null);
    setAnalysisSaved(false);
    setStudyResult(null);
    setStudyError(null);
  }, [selectedIndex]);

  useEffect(() => {
    setAnalysisResult(null);
    setAnalysisError(null);
    setAnalysisOverlay(null);
    setSatelliteOverlay(null);
    setAnalysisSaved(false);
  }, [selectedSceneId]);

  useEffect(() => {
    setSatelliteScenes([]);
    setSelectedSceneId(null);
    setAnalysisResult(null);
    setAnalysisOverlay(null);
    setSatelliteOverlay(null);
    setAnalysisSaved(false);
    setStudyResult(null);
    setStudyError(null);
    setFieldIntelligenceResult(null);
    setFieldIntelligenceError(null);
  }, [selectedParcelId]);

  useEffect(() => {
    setSatelliteScenes([]);
    setSelectedSceneId(null);
    setAnalysisResult(null);
    setAnalysisOverlay(null);
    setSatelliteOverlay(null);
    setAnalysisSaved(false);
    setStudyResult(null);
    setStudyError(null);
    setFieldIntelligenceResult(null);
    setFieldIntelligenceError(null);
  }, [manualAnalysisBbox]);

  useEffect(() => {
    return () => {
      if (analysisOverlay?.url) URL.revokeObjectURL(analysisOverlay.url);
    };
  }, [analysisOverlay?.url]);

  useEffect(() => {
    return () => {
      if (satelliteOverlay?.url) URL.revokeObjectURL(satelliteOverlay.url);
    };
  }, [satelliteOverlay?.url]);


  const searchSatelliteScenes = async () => {
    setSatelliteLoading(true);
    setSatelliteError(null);
    try {
      const params = new URLSearchParams({
        start: sceneStart,
        end: sceneEnd,
        cloud_cover_lte: String(cloudCover),
      });
      let path: string;
      if (selectedParcelId) {
        path = `/agriculture/parcels/${selectedParcelId}/remote-sensing/scenes?${params.toString()}`;
      } else {
        params.set("bbox", analysisBbox.map((value) => Number(value.toFixed(6))).join(","));
        params.set("limit", "30");
        path = `/remote-sensing/catalog/scenes?${params.toString()}`;
      }
      const result = await api.get<{ count: number; scenes: SatelliteScene[] }>(path);
      setSatelliteScenes(result.scenes);
      setSelectedSceneId((current) => result.scenes.some((scene) => scene.id === current) ? current : null);
      setAnalysisResult(null);
      setAnalysisOverlay(null);
      setSatelliteOverlay(null);
    } catch (err) {
      setSatelliteScenes([]);
      setSatelliteError(err);
    } finally {
      setSatelliteLoading(false);
    }
  };

  const loadSatelliteView = async () => {
    if (!selectedSceneId || !currentRasterBudget.allowed) return;
    setSatelliteViewLoading(true);
    setSatelliteError(null);
    try {
      let path: string;
      if (selectedParcelId) {
        const params = new URLSearchParams({ scene_id: selectedSceneId });
        path = `/agriculture/parcels/${selectedParcelId}/remote-sensing/true-color.png?${params.toString()}`;
      } else {
        const params = new URLSearchParams({
          bbox: analysisBbox.map((value) => Number(value.toFixed(6))).join(","),
        });
        path = `/remote-sensing/catalog/scenes/${encodeURIComponent(selectedSceneId)}/true-color.png?${params.toString()}`;
      }
      const image = await api.getBlob(path, 60_000);
      const url = URL.createObjectURL(image);
      setSatelliteOverlay({
        url,
        bbox: analysisBbox,
      });
    } catch (err) {
      setSatelliteOverlay(null);
      setSatelliteError(err);
    } finally {
      setSatelliteViewLoading(false);
    }
  };

  const analyzeCurrentView = async () => {
    if (!selectedSceneId || !currentRasterBudget.allowed) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      let statisticsPath: string;
      let previewPath: string;
      if (selectedParcelId) {
        const params = new URLSearchParams({
          scene_id: selectedSceneId,
          index: selectedIndex,
        });
        statisticsPath = `/agriculture/parcels/${selectedParcelId}/remote-sensing/statistics?${params.toString()}`;
        previewPath = `/agriculture/parcels/${selectedParcelId}/remote-sensing/preview.png?${params.toString()}`;
      } else {
        const params = new URLSearchParams({
          index: selectedIndex,
          bbox: analysisBbox.map((value) => Number(value.toFixed(6))).join(","),
        });
        statisticsPath = `/remote-sensing/catalog/scenes/${encodeURIComponent(selectedSceneId)}/statistics?${params.toString()}`;
        previewPath = `/remote-sensing/catalog/scenes/${encodeURIComponent(selectedSceneId)}/preview.png?${params.toString()}`;
      }
      const result = await api.get<RasterAnalysis>(statisticsPath);
      const preview = await api.getBlob(previewPath, 60_000);
      const previewUrl = URL.createObjectURL(preview);
      setAnalysisResult(result);
      setAnalysisOverlay({
        url: previewUrl,
        bbox: result.analysis_bbox_wgs84,
        index: result.index,
      });
    } catch (err) {
      setAnalysisResult(null);
      setAnalysisError(err);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const runTimeSeriesStudy = async () => {
    if (!currentRasterBudget.allowed || studyLoading || !sceneStart || !sceneEnd) return;
    setStudyLoading(true);
    setStudyError(null);
    setStudyResult(null);
    try {
      const params = new URLSearchParams({
        bbox: analysisBbox.map((value) => Number(value.toFixed(6))).join(","),
        start: sceneStart,
        end: sceneEnd,
        index: selectedIndex,
        cloud_cover_lte: String(cloudCover),
        max_scenes: "3",
      });
      const result = await api.get<TimeSeriesStudy>(`/remote-sensing/studies/timeseries?${params.toString()}`);
      setStudyResult(result);
    } catch (err) {
      setStudyError(err);
    } finally {
      setStudyLoading(false);
    }
  };

  const saveParcelAnalysis = async () => {
    if (!selectedParcelId || !selectedSceneId || !["ndvi", "lswi"].includes(selectedIndex)) return;
    setAnalysisSaving(true);
    setAnalysisError(null);
    try {
      await api.post(
        `/agriculture/parcels/${selectedParcelId}/remote-sensing/analyze`,
        { scene_id: selectedSceneId, index: selectedIndex },
      );
      setAnalysisSaved(true);
    } catch (err) {
      setAnalysisError(err);
    } finally {
      setAnalysisSaving(false);
    }
  };

  const refreshParcelSpatialData = async () => {
    const [boundaries, parcelRows] = await Promise.all([
      api.get<ParcelBoundariesGeoJSON>("/gis/parcels.geojson"),
      api.get<ParcelRecord[]>("/agriculture/parcels"),
    ]);
    setParcelBoundaries(boundaries.features);
    setParcels(parcelRows.filter((row) => !row.archived));
  };

  const createFieldFromAoi = async () => {
    if (!manualAnalysisBbox || !newFieldName.trim() || !newFieldCrop.trim() || fieldSaving) return;
    setFieldSaving(true);
    setFieldError(null);
    try {
      const budget = rasterBudget(manualAnalysisBbox);
      const [west,south,east,north] = manualAnalysisBbox;
      const created = await api.post<ParcelRecord>("/agriculture/parcels", {
        name: newFieldName.trim(),
        crop: newFieldCrop.trim(),
        area_ha: Math.max(0.001, Number((draftPolygon ? polygonAreaHectares(draftPolygon) : budget.areaKm2 * 100).toFixed(6))),
        location: `GIS AOI ${((south+north)/2).toFixed(5)}, ${((west+east)/2).toFixed(5)}`,
        boundary_geojson: draftPolygon ?? bboxPolygon(manualAnalysisBbox),
        site_id: activeProjectSiteId,
        stage: "initial",
      });
      await refreshParcelSpatialData();
      setActiveParcelId(created.id);
      setManualAnalysisBbox(null);
      setDraftPolygon(null);
      setNewFieldName("");
      setFieldIntelligenceResult(null);
    } catch (err) {
      setFieldError(err);
    } finally {
      setFieldSaving(false);
    }
  };

  const analyzeAllField = async () => {
    if (!simpleAnalysisReady || fieldIntelligenceLoading || !sceneStart || !sceneEnd) return;
    setFieldIntelligenceLoading(true);
    setFieldIntelligenceError(null);
    setFieldIntelligenceResult(null);
    try {
      const params = new URLSearchParams({
        start: sceneStart,
        end: sceneEnd,
        cloud_cover_lte: String(cloudCover),
        include_soil: "true",
      });
      if (selectedParcelId) {
        // The backend checks tenant ownership and masks pixels to the stored polygon.
        params.set("parcel_id", String(selectedParcelId));
      } else {
        params.set("bbox", analysisBbox.map((value) => Number(value.toFixed(6))).join(","));
        params.set("crop", newFieldCrop.trim());
      }
      const result = await api.get<FieldIntelligenceStudy>(`/remote-sensing/studies/field-intelligence?${params.toString()}`);
      setFieldIntelligenceResult(result);
      if (result.scene?.id) setSelectedSceneId(result.scene.id);
    } catch (err) {
      setFieldIntelligenceError(err);
    } finally {
      setFieldIntelligenceLoading(false);
    }
  };

  const resetParcelAnalysis = () => {
    setSatelliteScenes([]);
    setSelectedSceneId(null);
    setAnalysisResult(null);
    setAnalysisOverlay(null);
    setSatelliteOverlay(null);
    setAnalysisSaved(false);
  };

  const saveParcelBoundary = async (geometry: PolygonGeometry) => {
    if (!selectedParcelId) {
      const bounds=polygonBoundingBox(geometry);
      if (!bounds) {
        setBoundaryError(new Error(parcelCopy.importError));
        return;
      }
      // New users can draw the polygon before creating a project or parcel.
      setDraftPolygon(geometry);
      setManualAnalysisBbox(bounds);
      setActiveParcelId(null);
      setBoundaryError(null);
      return;
    }
    setBoundaryBusy(true);
    setBoundaryError(null);
    try {
      await api.patch(
        `/agriculture/parcels/${selectedParcelId}`,
        { boundary_geojson: geometry },
      );
      await refreshParcelSpatialData();
      resetParcelAnalysis();
    } catch (err) {
      setBoundaryError(err);
    } finally {
      setBoundaryBusy(false);
    }
  };

  const importParcelBoundary = async (file: File | null) => {
    if (!file || !selectedParcelId) return;
    setBoundaryError(null);
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const geometry = extractPolygonGeometry(parsed);
      if (!geometry) throw new Error(parcelCopy.importError);
      await saveParcelBoundary(geometry);
    } catch (err) {
      setBoundaryError(err);
    } finally {
      if (boundaryImportRef.current) boundaryImportRef.current.value = "";
    }
  };

  const exportParcelBoundary = () => {
    if (!selectedParcelRecord?.boundary_geojson) return;
    const feature = {
      type: "Feature",
      properties: {
        id: selectedParcelRecord.id,
        name: selectedParcelRecord.name,
        crop: selectedParcelRecord.crop,
        area_ha: selectedParcelRecord.area_ha,
        location: selectedParcelRecord.location,
      },
      geometry: selectedParcelRecord.boundary_geojson,
    };
    const blob = new Blob([JSON.stringify(feature, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `foggara-parcel-${selectedParcelRecord.id}.geojson`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const clearParcelBoundary = async () => {
    if (!selectedParcelId || !selectedParcelRecord?.boundary_geojson) return;
    if (!window.confirm(parcelCopy.clearConfirm)) return;
    setBoundaryBusy(true);
    setBoundaryError(null);
    try {
      await api.patch(
        `/agriculture/parcels/${selectedParcelId}`,
        { boundary_geojson: null },
      );
      await refreshParcelSpatialData();
      resetParcelAnalysis();
    } catch (err) {
      setBoundaryError(err);
    } finally {
      setBoundaryBusy(false);
    }
  };

  const selectSite = async (siteId: number) => {
    setSelectedSiteId(siteId);
    const entry = (data ?? []).find((row) => row.site.id === siteId);
    if (!entry) {
      setNearest([]);
      return;
    }
    try {
      const result = await api.get<{ count: number; items: SpatialFeature[] }>(
        `/gis/sites/nearest?lon=${entry.site.lon}&lat=${entry.site.lat}&limit=6`,
      );
      setNearest(result.items.filter((item) => item.properties.id !== siteId).slice(0, 5));
    } catch (err) {
      setNearest([]);
      setError(err);
    }
  };

  return (
    <div className={`fg-command-center fg-gis-workspace ${advancedOpen ? "is-advanced" : ""}`} dir={i18n.dir()}>
      <section className="fg-gis-heading">
        <div>
          <p className="fg-command-eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
        </div>
        <select
          aria-label={t("gis.filterWilaya")}
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={wilayaFilter}
          onChange={(e) => selectWilaya(e.target.value)}
        >
          <option value="">{copy.all}</option>
          {wilayas.map((w) => (
            <option key={w.code} value={w.code}>
              {w.code} — {locale === "fr" ? w.fr : locale === "en" ? w.en : w.ar}
            </option>
          ))}
        </select>
      </section>

      <ErrorText error={error} />
      <section className="fg-gis-db-diagnostics" aria-label={lang==="ar"?"جاهزية قاعدة بيانات GIS":lang==="fr"?"État de la base SIG":"GIS database status"}>
        <strong>{lang==="ar"?"قاعدة البيانات الفعلية":lang==="fr"?"Base de données effective":"Actual database"}</strong>
        {gisStatus ? <>
          <span dir="ltr">{gisStatus.database.engine.toUpperCase()}</span>
          <span>{lang==="ar"?"مواقع":lang==="fr"?"Sites":"Sites"}: {gisStatus.organization.sites}</span>
          <span>{lang==="ar"?"قطع محفوظة":lang==="fr"?"Parcelles enregistrées":"Saved parcels"}: {gisStatus.organization.parcels}</span>
          <span>{lang==="ar"?"حدود مكانية":lang==="fr"?"Limites cartographiées":"Mapped boundaries"}: {gisStatus.organization.mapped_parcels}</span>
          <span>{lang==="ar"?"قياسات":lang==="fr"?"Observations":"Observations"}: {gisStatus.organization.observations}</span>
          {gisStatus.database.engine!=="postgresql" ? <small>{lang==="ar"?"تحذير: تخزين PostgreSQL المستمر غير مثبت. تحقق من إعداد DATABASE_URL.":lang==="fr"?"Attention : stockage PostgreSQL persistant non confirmé. Vérifier DATABASE_URL.":"Warning: persistent PostgreSQL storage not confirmed. Check DATABASE_URL."}</small> : null}
        </> : <span>{gisStatusError ? (lang==="ar"?"تعذر التحقق من اتصال قاعدة البيانات":lang==="fr"?"Connexion base non vérifiée":"Could not verify database connection") : "…"}</span>}
      </section>

      <div className="fg-gis-map-first">
      {data === null && !error ? (
        <Skeleton className="h-[430px] w-full rounded-2xl" />
      ) : (
        <NationalMap
          sites={data ?? []}
          wilayas={wilayas}
          satelliteScenes={satelliteScenes}
          parcelBoundaries={parcelBoundaries}
          draftParcelBoundary={draftPolygon}
          satelliteOverlay={satelliteOverlay}
          analysisOverlay={analysisOverlay}
          selectedSceneId={selectedSceneId}
          selectedWilaya={wilayaFilter}
          selectedSiteId={selectedParcelId ? null : (selectedSiteId ?? activeProjectSiteId)}
          selectedParcelId={selectedParcelId}
          selectedParcelPoint={selectedParcelRecord?.lat != null && selectedParcelRecord?.lon != null
            ? { lat: selectedParcelRecord.lat, lon: selectedParcelRecord.lon }
            : null}
          onViewportChange={setViewportBbox}
          analysisSelectionBbox={manualAnalysisBbox}
          onAnalysisSelectionChange={(bbox) => {
            setManualAnalysisBbox(bbox);
            setDraftPolygon(null);
            if (bbox) {
              setActiveParcelId(null);
              setSelectedSiteId(null);
            }
          }}
          onSelectScene={(sceneId) => setSelectedSceneId(sceneId)}
          onSelectWilaya={(code) => selectWilaya(code === wilayaFilter ? "" : code)}
          onSelectSite={(siteId) => void selectSite(siteId)}
          onSelectParcel={(parcelId) => {
            setManualAnalysisBbox(null);
            setDraftPolygon(null);
            setActiveParcelId(selectedParcelId === parcelId ? null : parcelId);
            setSelectedSiteId(null);
          }}
          onDrawParcelBoundary={(geometry) => void saveParcelBoundary(geometry)}
          locale={lang}
          guided={!advancedOpen}
          guideAreaSelection={!selectedParcelId && !manualAnalysisBbox}
        />
      )}
      </div>

      <section className="fg-gis-guide" aria-label={guideCopy.title}>
        <div className="fg-gis-guide-head">
          <div>
            <span>FOGGARA GIS · SIMPLE WORKFLOW</span>
            <h2>{guideCopy.title}</h2>
            <p>{guideCopy.body}</p>
          </div>
          <button type="button" className="fg-gis-advanced-toggle" onClick={() => setAdvancedOpen((value) => !value)}>
            {advancedOpen ? guideCopy.hideAdvanced : guideCopy.advanced}
          </button>
        </div>

        <div className="fg-gis-steps">
          <div className={activeProjectId ? "done" : ""}><b>01</b><span>{guideCopy.project}</span><strong>{activeProject?.title ?? guideCopy.optional}</strong></div>
          <div className={selectedParcelId || manualAnalysisBbox ? "done" : ""}><b>02</b><span>{guideCopy.parcel}</span><strong>{selectedParcelRecord?.name ?? (manualAnalysisBbox ? guideCopy.selectedArea : guideCopy.missing)}</strong></div>
          <div className={fieldIntelligenceResult?.status === "READY" ? "done" : ""}><b>03</b><span>{guideCopy.analyze}</span><strong>{fieldIntelligenceLoading ? guideCopy.analyzing : simpleAnalysisReady ? guideCopy.ready : guideCopy.missing}</strong></div>
          <div className={fieldIntelligenceResult?.status === "READY" ? "done" : ""}><b>04</b><span>{guideCopy.result}</span><strong>{fieldIntelligenceResult?.status === "READY" ? guideCopy.ready : guideCopy.missing}</strong></div>
        </div>

        {!activeProjectId ? (
          <div className="fg-gis-guide-action">
            <p>{guideCopy.projectMissing}</p>
            <Link to="/app/projects">{guideCopy.chooseProject}</Link>
          </div>
        ) : null}
          <div className="fg-gis-simple-controls">
            <label>
              <span>{guideCopy.chooseParcel}</span>
              <select value={selectedParcelId ?? ""} onChange={(event) => {
                const next = Number(event.target.value);
                setActiveParcelId(Number.isFinite(next) && next > 0 ? next : null);
                if (Number.isFinite(next) && next > 0) setManualAnalysisBbox(null);
              }}>
                <option value="">{guideCopy.chooseParcel}</option>
                {scopedParcels.map((parcel) => <option key={parcel.id} value={parcel.id}>{parcel.name} · {parcel.crop} · {parcel.area_ha} ha</option>)}
              </select>
            </label>
            <div className="fg-gis-simple-primary">
              <button type="button" disabled={!simpleAnalysisReady || fieldIntelligenceLoading} onClick={() => void analyzeAllField()}>
                {fieldIntelligenceLoading ? guideCopy.analyzing : guideCopy.analyzeNow}
              </button>
              {!selectedParcelId && !manualAnalysisBbox ? <p>{guideCopy.areaHint}</p> : null}
              {manualAnalysisBbox ? <p dir="ltr" className="fg-gis-aoi-readout">{draftPolygon ? "POLYGON / " : "RECTANGLE / "} WGS84 BBOX: {manualAnalysisBbox.map(n=>n.toFixed(5)).join(", ")} · {currentRasterBudget.areaKm2.toFixed(4)} km² · {currentRasterBudget.pixels.toLocaleString()} px</p> : null}
              {!currentRasterBudget.allowed && manualAnalysisBbox ? <p>{analysisCopy.zoom}</p> : null}
              {draftPolygon ? <p>{lang==="ar"?"سيُحفظ المضلع المرسوم نفسه، وليس المستطيل المحيط.":lang==="fr"?"Le polygone dessiné sera enregistré, pas son rectangle englobant.":"The drawn polygon will be saved, not its bounding rectangle."}</p> : null}
              {draftPolygon ? <p>{lang==="ar"?"احفظ القطعة أولًا حتى تُحسب المؤشرات داخل حدود المضلع، وليس المستطيل المحيط به.":lang==="fr"?"Enregistrez d’abord la parcelle pour calculer les indices à l’intérieur du polygone.":"Save the parcel first to compute indices inside its polygon, rather than its bounding box."}</p> : null}
            </div>
          </div>

        {manualAnalysisBbox && !selectedParcelId ? (
          <div className="fg-gis-create-simple">
            <label><span>{fieldCopy.name}</span><input value={newFieldName} onChange={(e)=>setNewFieldName(e.target.value)} placeholder={fieldCopy.namePlaceholder}/></label>
            <label><span>{fieldCopy.crop}</span><input value={newFieldCrop} onChange={(e)=>setNewFieldCrop(e.target.value)} placeholder={fieldCopy.cropPlaceholder}/></label>
            <button type="button" disabled={fieldSaving || !newFieldName.trim() || !newFieldCrop.trim()} onClick={() => void createFieldFromAoi()}>
              {fieldSaving ? fieldCopy.saving : fieldCopy.save}
            </button>
          </div>
        ) : null}
        <ErrorText error={fieldError} />
        <ErrorText error={fieldIntelligenceError} />

        <div className="fg-gis-simple-result">
          {fieldIntelligenceResult?.status === "READY" ? (
            <>
              <div><span>{guideCopy.vegetation}</span><strong dir="ltr">{ndviMean == null ? "—" : ndviMean.toFixed(3)}</strong><small>NDVI</small></div>
              <div><span>{guideCopy.moisture}</span><strong dir="ltr">{moistureMean == null ? "—" : moistureMean.toFixed(3)}</strong><small>NDMI / NDWI / LSWI</small></div>
              <div><span>{guideCopy.soil}</span><strong dir="ltr">{soilPh == null ? "—" : soilPh.toFixed(2)}</strong><small>pH · 0–20 cm</small></div>
              <div><span>{guideCopy.quality}</span><strong dir="ltr">{fieldIntelligenceResult.quality_indicator?.score ?? "—"}</strong><small>{fieldIntelligenceResult.quality_indicator?.grade ?? "NOT VERIFIED"}</small></div>
              <p className="fg-gis-result-provenance">
                {fieldIntelligenceResult.geometry_mask_applied
                  ? (lang==="ar"?"حساب المؤشرات داخل المضلع المحفوظ فقط":lang==="fr"?"Indices calculés uniquement à l’intérieur du polygone enregistré":"Indices computed within the saved polygon only")
                  : (lang==="ar"?"تحليل مستطيل/نطاق تقديري، وليس حدود قطعة مثبتة":lang==="fr"?"Analyse d’une emprise estimée, pas d’un contour cadastral":"Estimated BBOX analysis, not a surveyed field boundary")}
                {" · "}{fieldIntelligenceResult.scene?.datetime ?? "—"}
                {" · "}{lang==="ar"?"محسوب وغير متحقق ميدانيًا":lang==="fr"?"Calculé, non vérifié sur le terrain":"Computed; not ground verified"}
              </p>
            </>
          ) : fieldIntelligenceResult?.status === "NO_USABLE_SCENE"
            ? <p>{lang==="ar"?"لم يتوفر مشهد فضائي صالح لهذه المنطقة والفترة. لا توجد نتائج محسوبة.":lang==="fr"?"Aucune scène satellite utilisable pour cette zone et cette période. Aucun indice calculé.":"No usable satellite scene for this area and period. No indices were computed."}</p>
            : <p>{guideCopy.noResult}</p>}
        </div>
      </section>

      {data !== null && data.length === 0 && parcels.length === 0 ? (
        <div className="fg-gis-empty-hint"><OperationalEmptyState
          icon={MapPinned}
          title={startCopy.title}
          body={startCopy.body}
          steps={startCopy.steps}
          primary={{ label: startCopy.setup, to: "/app/setup" }}
          secondary={{ label: startCopy.agriculture, to: "/app/agriculture" }}
        /></div>
      ) : null}

      <section className="fg-command-kpis fg-gis-advanced" aria-label={copy.layers}>
        <div className="fg-command-kpi"><div><span>{copy.sites}</span></div><strong>{filtered === null ? "—" : summary.sites}</strong></div>
        <div className="fg-command-kpi"><div><span>{copy.projects}</span></div><strong>{filtered === null ? "—" : summary.projects}</strong></div>
        <div className="fg-command-kpi"><div><span>{copy.resources}</span></div><strong>{filtered === null ? "—" : summary.resources}</strong></div>
        <div className="fg-command-kpi"><div><span>{t("gis.assets")}</span></div><strong>{filtered === null ? "—" : summary.assets}</strong></div>
      </section>

      <section className="fg-gis-advanced rounded-2xl border bg-card p-4 shadow-sm" aria-label={parcelCopy.title}>
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-lg font-bold">{parcelCopy.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{parcelCopy.hint}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(240px,1fr)_auto]">
            <label className="grid gap-1 text-xs font-medium">
              <span>{parcelCopy.select}</span>
              <select
                className="rounded-md border bg-background px-3 py-2"
                value={selectedParcelId ?? ""}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setActiveParcelId(Number.isFinite(next) && next > 0 ? next : null);
                  if (Number.isFinite(next) && next > 0) setManualAnalysisBbox(null);
                  setSelectedSiteId(null);
                }}
              >
                <option value="">{parcelCopy.none}</option>
                {scopedParcels.map((parcel) => (
                  <option key={parcel.id} value={parcel.id}>
                    #{parcel.id} · {parcel.name} · {parcel.location}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap items-end gap-2">
              <input
                ref={boundaryImportRef}
                type="file"
                accept=".geojson,.json,application/geo+json,application/json"
                className="hidden"
                onChange={(event) => void importParcelBoundary(event.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                className="rounded-md border bg-background px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!selectedParcelId || boundaryBusy}
                onClick={() => boundaryImportRef.current?.click()}
              >
                {parcelCopy.importGeoJson}
              </button>
              <button
                type="button"
                className="rounded-md border bg-background px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!selectedParcelRecord?.boundary_geojson || boundaryBusy}
                onClick={exportParcelBoundary}
              >
                {parcelCopy.exportGeoJson}
              </button>
              <button
                type="button"
                className="rounded-md border border-destructive/40 bg-background px-3 py-2 text-xs font-semibold text-destructive disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!selectedParcelRecord?.boundary_geojson || boundaryBusy}
                onClick={() => void clearParcelBoundary()}
              >
                {parcelCopy.clearBoundary}
              </button>
            </div>
          </div>
        </div>
        {manualAnalysisBbox ? (
          <div className="mt-4 grid gap-3 rounded-xl border border-violet-200 bg-violet-50/40 p-3 lg:grid-cols-[1fr_1fr_auto]">
            <label className="grid gap-1 text-xs font-medium">
              <span>{fieldCopy.name}</span>
              <input className="rounded-md border bg-background px-3 py-2" value={newFieldName} onChange={(e)=>setNewFieldName(e.target.value)} placeholder={fieldCopy.namePlaceholder}/>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              <span>{fieldCopy.crop}</span>
              <input list="foggara-crops" className="rounded-md border bg-background px-3 py-2" value={newFieldCrop} onChange={(e)=>setNewFieldCrop(e.target.value)} placeholder={fieldCopy.cropPlaceholder}/>
              <datalist id="foggara-crops">
                <option value="Date palm"/>
                <option value="Wheat"/>
                <option value="Barley"/>
                <option value="Maize"/>
                <option value="Potato"/>
                <option value="Tomato"/>
                <option value="Olive"/>
                <option value="Citrus"/>
              </datalist>
            </label>
            <button type="button" className="self-end rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={fieldSaving||!newFieldName.trim()||!newFieldCrop.trim()} onClick={()=>void createFieldFromAoi()}>
              {fieldSaving?fieldCopy.saving:fieldCopy.save}
            </button>
            <div className="lg:col-span-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">{fieldCopy.selectedArea}</Badge>
              <span>{fieldCopy.refine}</span>
            </div>
            <div className="lg:col-span-3"><ErrorText error={fieldError}/></div>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {selectedParcelRecord ? (
            <>
              <Badge variant="outline">#{selectedParcelRecord.id}</Badge>
              <Badge variant="outline">{selectedParcelRecord.name}</Badge>
              <Badge variant="outline">{selectedParcelRecord.area_ha} ha</Badge>
              <Badge variant="outline">
                {selectedParcelRecord.boundary_geojson ? parcelCopy.mapped : parcelCopy.unmapped}
              </Badge>
            </>
          ) : (
            <span className="text-muted-foreground">{parcelCopy.none}</span>
          )}
        </div>
        <ErrorText error={boundaryError} />
      </section>

      <section className="fg-gis-advanced rounded-2xl border bg-card p-4 shadow-sm" aria-label={satelliteCopy.title}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">{satelliteCopy.provider}</p>
            <h2 className="mt-1 text-lg font-bold">{satelliteCopy.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{satelliteCopy.metadata}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="grid gap-1 text-xs font-medium">
              <span>{satelliteCopy.start}</span>
              <input className="rounded-md border bg-background px-2 py-2" type="date" value={sceneStart} max={sceneEnd} onChange={(e) => setSceneStart(e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              <span>{satelliteCopy.end}</span>
              <input className="rounded-md border bg-background px-2 py-2" type="date" value={sceneEnd} min={sceneStart} max={today} onChange={(e) => setSceneEnd(e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              <span>{satelliteCopy.clouds}: {cloudCover}%</span>
              <input className="h-10" type="range" min="0" max="100" step="5" value={cloudCover} onChange={(e) => setCloudCover(Number(e.target.value))} />
            </label>
            <button
              type="button"
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={satelliteLoading || !sceneStart || !sceneEnd}
              onClick={() => void searchSatelliteScenes()}
            >
              {satelliteLoading ? satelliteCopy.searching : selectedParcelId ? satelliteCopy.searchParcel : satelliteCopy.searchView}
            </button>
          </div>
        </div>
        <ErrorText error={satelliteError} />
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">LIVE STAC</Badge>
          <Badge variant="outline">{selectedParcelRecord ? `${satelliteCopy.parcelScope}: ${selectedParcelRecord.name}` : manualAnalysisBbox ? satelliteCopy.areaScope : satelliteCopy.viewScope}</Badge>
          <span>{satelliteScenes.length} {satelliteCopy.found}</span>
          {satelliteScenes.length === 0 && !satelliteLoading ? <span>{satelliteCopy.empty}</span> : null}
        </div>
      </section>

      <section className="fg-gis-advanced rounded-2xl border bg-card p-4 shadow-sm" aria-label={analysisCopy.title}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">{analysisCopy.title}</h2>
              <Badge variant="outline">{analysisCopy.computed}</Badge>
              <Badge variant="outline">{analysisCopy.notVerified}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{analysisCopy.note}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_130px_auto]">
            <label className="grid gap-1 text-xs font-medium">
              <span>{analysisCopy.scene}</span>
              <select
                className="rounded-md border bg-background px-2 py-2"
                value={selectedSceneId ?? ""}
                onChange={(e) => setSelectedSceneId(e.target.value || null)}
              >
                <option value="">{analysisCopy.selectScene}</option>
                {satelliteScenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>{scene.id}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              <span>{analysisCopy.index}</span>
              <select
                className="rounded-md border bg-background px-2 py-2 font-semibold uppercase"
                value={selectedIndex}
                onChange={(e) => setSelectedIndex(e.target.value as RemoteIndex)}
              >
                <option value="ndvi">NDVI</option>
                <option value="evi">EVI</option>
                <option value="savi">SAVI</option>
                <option value="ndwi">NDWI</option>
                <option value="ndmi">NDMI</option>
                <option value="lswi">LSWI</option>
                <option value="bsi">BSI</option>
              </select>
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-md bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!selectedSceneId || !currentRasterBudget.allowed || satelliteViewLoading}
                onClick={() => void loadSatelliteView()}
              >
                {satelliteViewLoading ? satelliteCopy.trueColorLoading : satelliteCopy.trueColor}
              </button>
              <button
                type="button"
                className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!selectedSceneId || !currentRasterBudget.allowed || analysisLoading}
                onClick={() => void analyzeCurrentView()}
              >
                {analysisLoading ? analysisCopy.running : selectedParcelRecord ? analysisCopy.runParcel : analysisCopy.run}
              </button>
              <button
                type="button"
                className="rounded-md bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!currentRasterBudget.allowed || currentRasterBudget.pixels>250000 || fieldIntelligenceLoading || !sceneStart || !sceneEnd}
                onClick={() => void analyzeAllField()}
              >
                {fieldIntelligenceLoading ? fieldCopy.analyzingAll : fieldCopy.analyzeAll}
              </button>
              <button
                type="button"
                className="rounded-md bg-violet-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!currentRasterBudget.allowed || studyLoading || !sceneStart || !sceneEnd}
                onClick={() => void runTimeSeriesStudy()}
              >
                {studyLoading ? analysisCopy.studying : analysisCopy.study}
              </button>
              {selectedParcelId && (selectedIndex === "ndvi" || selectedIndex === "lswi") && analysisResult ? (
                <button
                  type="button"
                  className="rounded-md border bg-background px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={analysisSaving}
                  onClick={() => void saveParcelAnalysis()}
                >
                  {analysisSaving ? analysisCopy.saving : analysisSaved ? analysisCopy.saved : analysisCopy.save}
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">
            {currentRasterBudget.allowed ? analysisCopy.ready : analysisCopy.zoom}
          </Badge>
          {selectedParcelRecord ? <Badge variant="outline">{selectedParcelRecord.name} · {selectedParcelRecord.area_ha} ha</Badge> : manualAnalysisBbox ? <Badge variant="outline">{satelliteCopy.areaScope}</Badge> : null}
          <span className="rounded-md border px-2 py-1 text-muted-foreground">
            {analysisCopy.area}: {currentRasterBudget.areaKm2.toFixed(2)} km²
          </span>
          <span className="rounded-md border px-2 py-1 text-muted-foreground">
            {currentRasterBudget.pixels.toLocaleString(locale)} {analysisCopy.pixels}
          </span>
          {selectedScene ? <span className="rounded-md border px-2 py-1 font-mono text-[11px]">{selectedScene.id}</span> : null}
        </div>

        <ErrorText error={analysisError} />
        <ErrorText error={studyError} />
        <ErrorText error={fieldIntelligenceError} />

        {analysisResult ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            {[
              [analysisCopy.mean, analysisResult.statistics.mean],
              [analysisCopy.median, analysisResult.statistics.median],
              [analysisCopy.min, analysisResult.statistics.min],
              [analysisCopy.max, analysisResult.statistics.max],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border bg-background p-3">
                <span className="text-xs text-muted-foreground">{label}</span>
                <strong className="mt-1 block text-xl tabular-nums" dir="ltr">
                  {typeof value === "number" ? value.toFixed(4) : "—"}
                </strong>
              </div>
            ))}
            <div className="rounded-xl border bg-background p-3">
              <span className="text-xs text-muted-foreground">{analysisCopy.valid}</span>
              <strong className="mt-1 block text-xl tabular-nums" dir="ltr">
                {(analysisResult.pixels.valid_fraction * 100).toFixed(1)}%
              </strong>
            </div>
            <div className="rounded-xl border bg-background p-3">
              <span className="text-xs text-muted-foreground">{analysisCopy.masked}</span>
              <strong className="mt-1 block text-xl tabular-nums" dir="ltr">
                {analysisResult.pixels.masked.toLocaleString(locale)}
              </strong>
            </div>
            <div className="sm:col-span-2 lg:col-span-4 xl:col-span-6 flex flex-wrap gap-2 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
              <span>{analysisResult.formula_version}</span>
              <span>·</span>
              <span>{analysisResult.grid.resolution_m} m grid</span>
              {analysisResult.grid.effective_source_resolution_m ? (
                <>
                  <span>·</span>
                  <span>{analysisCopy.sourceRes}: {analysisResult.grid.effective_source_resolution_m} m{analysisResult.grid.resampled ? ` · ${analysisCopy.resampled}` : ""}</span>
                </>
              ) : null}
              <span>·</span>
              <span>{analysisResult.grid.crs}</span>
              <span>·</span>
              <span>{analysisResult.mask.method}</span>
              <span>·</span>
              <strong>{analysisResult.provenance.derived_index}</strong>
            </div>
          </div>
        ) : null}
      </section>

      {fieldIntelligenceResult?.status==="READY" ? (
        <section className="fg-field-intelligence fg-gis-advanced" aria-label={fieldCopy.allTitle}>
          <div className="fg-field-intelligence-head">
            <div>
              <span>FIELD / AOI INTELLIGENCE · SENTINEL-2 + iSDAsoil</span>
              <h2>{fieldCopy.allTitle}</h2>
              <p>{fieldCopy.allHint}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{fieldIntelligenceResult.crop_profile.declared_crop||fieldIntelligenceResult.crop_profile.label}</Badge>
              {fieldIntelligenceResult.quality_indicator?<Badge variant="outline">{fieldCopy.quality}: {fieldIntelligenceResult.quality_indicator.grade} · {fieldIntelligenceResult.quality_indicator.score}/100</Badge>:null}
            </div>
          </div>
          <div className="fg-field-intelligence-meta">
            <div><small>{fieldCopy.cropProfile}</small><strong>{fieldIntelligenceResult.crop_profile.label}</strong><span>{fieldIntelligenceResult.crop_profile.crop_identity_status}</span></div>
            <div><small>{fieldCopy.latestScene}</small><strong>{fieldIntelligenceResult.scene?.datetime?new Date(fieldIntelligenceResult.scene.datetime).toLocaleDateString(locale):"—"}</strong><span>{fieldIntelligenceResult.scene?.platform??"Sentinel-2"}</span></div>
            <div><small>AOI</small><strong>{currentRasterBudget.areaKm2.toFixed(2)} km²</strong><span>{fieldIntelligenceResult.spectral_processing?.grid.resolution_m??10} m</span></div>
            <div><small>EVIDENCE</small><strong>OBSERVED → COMPUTED → INFERRED</strong><span>NOT VERIFIED</span></div>
          </div>
          <div className="fg-field-index-grid">
            {Object.entries(fieldIntelligenceResult.domains).flatMap(([domain,value])=>Object.entries(value.indices??{}).map(([key,item])=>
              <article key={`${domain}-${key}`}>
                <span>{domain.replaceAll("_"," ")}</span>
                <h3>{key.toUpperCase()}</h3>
                <strong dir="ltr">{item.statistics.mean==null?"—":item.statistics.mean.toFixed(4)}</strong>
                <small dir="ltr">{(item.pixels.valid_fraction*100).toFixed(1)}% valid · {item.application_domain}</small>
              </article>
            ))}
          </div>
          <div className="fg-field-soil">
            <div>
              <span>SOIL / 30 m / INFERRED</span>
              <h3>{fieldCopy.soil}</h3>
              <p>{fieldCopy.providerModel}</p>
            </div>
            <div className="fg-field-soil-grid">
              {fieldIntelligenceResult.soil_context?.available_properties.length
                ? fieldIntelligenceResult.soil_context.available_properties.map(key=>{
                    const item=fieldIntelligenceResult.soil_context?.properties[key];
                    if(!item)return null;
                    return <div key={key}><small>{item.label} · 0–20 cm</small><strong dir="ltr">{item.mean_0_20==null?"—":`${item.mean_0_20.toFixed(2)} ${item.unit}`}</strong><span dir="ltr">σ {item.prediction_stdev_0_20==null?"—":item.prediction_stdev_0_20.toFixed(2)} · {item.resolution_m} m</span></div>;
                  })
                : <p>{fieldCopy.noData}</p>}
            </div>
          </div>
          {fieldIntelligenceResult.global_sources?.length ? (
            <div className="fg-field-global-sources">
              {fieldIntelligenceResult.global_sources.map(source=><div key={source.id}>
                <strong>{source.name}</strong>
                <span>{source.role}</span>
                <small>{source.status} · {source.license}</small>
              </div>)}
            </div>
          ) : null}
          <div className="fg-field-intelligence-notes">
            {fieldIntelligenceResult.crop_profile.limitations.map(item=><p key={item}>{item}</p>)}
            {fieldIntelligenceResult.limitations?.slice(0,3).map(item=><p key={item}>{item}</p>)}
          </div>
        </section>
      ) : fieldIntelligenceResult?.status==="NO_USABLE_SCENE" ? (
        <section className="fg-field-intelligence fg-gis-advanced"><p>{satelliteCopy.empty}</p></section>
      ) : null}

      {studyResult ? (
        <section className="fg-eo-study fg-gis-advanced" aria-label={analysisCopy.studyTitle}>
          <div className="fg-eo-study-head">
            <div>
              <span>SENTINEL-2 L2A · STAC · QA4EO-INSPIRED TRACEABILITY</span>
              <h2>{analysisCopy.studyTitle} · {selectedIndex.toUpperCase()}</h2>
              <p>{studyResult.period.start} → {studyResult.period.end} · {studyResult.provider}</p>
            </div>
            <Badge variant="outline">{studyResult.trend.interpretation_status}</Badge>
          </div>
          <div className="fg-eo-study-kpis">
            <div><small>{analysisCopy.studyScenes}</small><strong>{studyResult.scene_count}</strong></div>
            <div><small>{analysisCopy.studyTrend}</small><strong>{studyResult.trend.direction==="increasing"?analysisCopy.trendIncreasing:studyResult.trend.direction==="decreasing"?analysisCopy.trendDecreasing:studyResult.trend.direction==="stable"?analysisCopy.trendStable:analysisCopy.trendInsufficient}</strong></div>
            <div><small>{analysisCopy.studyDelta}</small><strong dir="ltr">{studyResult.trend.delta==null?"—":studyResult.trend.delta.toFixed(4)}</strong></div>
            <div><small>{analysisCopy.studySlope}</small><strong dir="ltr">{studyResult.trend.slope_per_day==null?"—":studyResult.trend.slope_per_day.toFixed(6)}</strong></div>
            <div><small>{analysisCopy.studyQuality}</small><strong dir="ltr">{studyResult.quality_summary.mean_operational_score==null?"—":`${studyResult.quality_summary.mean_operational_score.toFixed(1)}/100`}</strong></div>
          </div>
          <div className="fg-eo-study-series">
            {studyResult.series.map(scene=><article key={scene.scene_id}>
              <div><strong>{scene.datetime?new Date(scene.datetime).toLocaleDateString(locale):scene.scene_id}</strong><small>{scene.platform??"Sentinel-2"} · {scene.quality_indicator.grade}/{scene.quality_indicator.usability}</small></div>
              <b dir="ltr">{scene.statistics.mean==null?"—":scene.statistics.mean.toFixed(4)}</b>
              <span dir="ltr">{(scene.pixels.valid_fraction*100).toFixed(1)}% {analysisCopy.validPixels}</span>
              <span dir="ltr">{scene.cloud_cover_pct==null?"—":`${Number(scene.cloud_cover_pct).toFixed(1)}% ☁`}</span>
            </article>)}
          </div>
          <div className="fg-eo-study-method">
            <strong>{analysisCopy.researchBasis}</strong>
            <span>{studyResult.methodology.quality_framework}</span>
            <div>{studyResult.methodology.standards.map(item=><span key={item.id}>{item.organization} · {item.name}</span>)}</div>
          </div>
          <p className="fg-footnote">{studyResult.trend.note}</p>
          {studyResult.limitations.slice(0,2).map(item=><p className="fg-footnote" key={item}>{item}</p>)}
        </section>
      ) : null}

      {satelliteScenes.length > 0 ? (
        <section className="fg-gis-advanced rounded-2xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-bold">{satelliteCopy.title}</h2>
            <Badge variant="outline">{satelliteScenes.length}</Badge>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {satelliteScenes.slice(0, 12).map((scene) => (
              <article
                key={scene.id}
                className={`rounded-xl border p-3 text-sm transition-colors ${selectedSceneId === scene.id ? "border-amber-500 bg-amber-50/40" : ""}`}
              >
                <button
                  type="button"
                  className="w-full text-start"
                  aria-pressed={selectedSceneId === scene.id}
                  onClick={() => setSelectedSceneId(scene.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <strong className="break-all text-xs">{scene.id}</strong>
                    <Badge variant="outline">{scene.cloud_cover_pct == null ? "—" : `${Number(scene.cloud_cover_pct).toFixed(1)}% ☁`}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{scene.datetime ? new Date(scene.datetime).toLocaleString(locale) : "—"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{scene.platform ?? scene.constellation ?? "Sentinel-2"}</p>
                  <p className="mt-2 text-[11px] text-sky-700">{scene.provenance}</p>
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="fg-gis-spatial-panel fg-gis-advanced" aria-label={copy.selected}>
        <div className="fg-gis-spatial-summary">
          <span>EPSG:4326 · {copy.engine}: <b>{spatialEngine}</b></span>
          {selectedSite ? (
            <>
              <h2>{copy.selected}: {selectedSite.site.name}</h2>
              <p>{selectedSite.site.wilaya}{selectedSite.site.commune ? ` · ${selectedSite.site.commune}` : ""}</p>
              <strong dir="ltr">{selectedSite.site.lat.toFixed(5)}, {selectedSite.site.lon.toFixed(5)}</strong>
            </>
          ) : (
            <p>{lang === "fr" ? "Sélectionnez un point sur la carte pour lancer une requête spatiale." : lang === "en" ? "Select a point on the map to run a spatial query." : "اختر نقطة على الخريطة لتشغيل استعلام مكاني."}</p>
          )}
        </div>
        <div className="fg-gis-nearest">
          <h3>{copy.nearest}</h3>
          {selectedSite && nearest.length === 0 ? <p>{copy.noNearby}</p> : (
            <ol>
              {nearest.map((item) => (
                <li key={item.properties.id}>
                  <button type="button" onClick={() => void selectSite(item.properties.id)}>
                    <span>{item.properties.name}<small>{item.properties.wilaya}</small></span>
                    <strong dir="ltr">{((item.properties.distance_m ?? 0) / 1000).toFixed(1)} km</strong>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="fg-gis-register fg-gis-advanced">
        <div className="fg-command-section-title">
          <div><span>GIS / SITES / RESOURCES / PROJECTS</span><h2>{copy.table}</h2></div>
          <Badge variant="outline">{wilayaFilter || String(wilayas.length || 69)}</Badge>
        </div>
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{t("gis.manualOnly")}</p>

        {filtered === null && !error ? (
          <Skeleton className="h-64 w-full" />
        ) : filtered && filtered.length === 0 ? (
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">{t("gis.empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("gis.site")}</TableHead>
                  <TableHead>{t("gis.wilaya")}</TableHead>
                  <TableHead>{t("gis.commune")}</TableHead>
                  <TableHead>{t("gis.coords")}</TableHead>
                  <TableHead>{t("gis.projects")}</TableHead>
                  <TableHead>{t("gis.resources")}</TableHead>
                  <TableHead>{t("gis.assets")}</TableHead>
                  <TableHead>{t("gis.serviceRequests")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(filtered ?? []).map((g) => (
                  <TableRow key={g.site.id} className={selectedSiteId === g.site.id ? "bg-accent/50" : undefined} onClick={() => void selectSite(g.site.id)}>
                    <TableCell className="font-medium">
                      {g.site.name}<DemoBadge show={g.site.is_demo} />
                    </TableCell>
                    <TableCell>{g.site.wilaya}</TableCell>
                    <TableCell>{g.site.commune ?? t("common.none")}</TableCell>
                    <TableCell className="tabular-nums" dir="ltr">{g.site.lat.toFixed(4)}, {g.site.lon.toFixed(4)}</TableCell>
                    <TableCell>
                      {g.projects.length === 0 ? t("common.none") : (
                        <ul className="space-y-0.5">
                          {g.projects.map((p) => (
                            <li key={p.id}>#{p.id} {p.title} <Badge variant="outline">{t(`project.statuses.${p.status}`, p.status)}</Badge></li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell>
                      {g.resources.length === 0 ? t("common.none") : (
                        <ul className="space-y-0.5">{g.resources.map((r) => <li key={r.id}>#{r.id} {r.name}</li>)}</ul>
                      )}
                    </TableCell>
                    <TableCell>
                      {g.assets.length === 0 ? t("common.none") : (
                        <ul className="space-y-0.5">{g.assets.map((a) => <li key={a.id}>#{a.id} {a.name}</li>)}</ul>
                      )}
                    </TableCell>
                    <TableCell>
                      {g.service_requests.length === 0 ? t("common.none") : (
                        <ul className="space-y-0.5">
                          {g.service_requests.map((r) => (
                            <li key={r.id}>#{r.id} <Badge variant="outline">{t(`service.statuses.${r.status}`, r.status)}</Badge></li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
