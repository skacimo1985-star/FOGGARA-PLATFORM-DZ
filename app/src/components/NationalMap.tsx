import { useEffect, useMemo, useRef, useState } from "react";
import type { GisSite, WilayaMeta } from "@/types";

export type SatelliteRasterOverlay = {
  url: string;
  bbox: [number, number, number, number];
};

export type AnalysisRasterOverlay = {
  url: string;
  bbox: [number, number, number, number];
  index: "ndvi" | "evi" | "savi" | "ndwi" | "ndmi" | "lswi" | "bsi";
};

export type ParcelBoundaryFeature = {
  type: "Feature";
  id: number;
  geometry: {
    type: "Polygon";
    coordinates: unknown;
  };
  properties: {
    id: number;
    name: string;
    crop: string;
    area_ha: number;
    location: string;
    site_id: number | null;
    is_demo: boolean;
    selected?: boolean;
  };
};

export type SatelliteScene = {
  id: string;
  collection: string;
  datetime: string | null;
  cloud_cover_pct: number | null;
  platform: string | null;
  constellation: string | null;
  bbox: [number, number, number, number] | null;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: unknown;
  };
  asset_keys: string[];
  stac_item_url: string | null;
  provider: string;
  provenance: string;
};

type Props = {
  sites: GisSite[];
  wilayas: WilayaMeta[];
  satelliteScenes?: SatelliteScene[];
  parcelBoundaries?: ParcelBoundaryFeature[];
  draftParcelBoundary?: { type: "Polygon"; coordinates: [number, number][][] } | null;
  satelliteOverlay?: SatelliteRasterOverlay | null;
  analysisOverlay?: AnalysisRasterOverlay | null;
  selectedSceneId?: string | null;
  selectedWilaya?: string;
  selectedSiteId?: number | null;
  selectedParcelId?: number | null;
  selectedParcelPoint?: { lat: number; lon: number } | null;
  onSelectWilaya?: (code: string) => void;
  onSelectSite?: (siteId: number) => void;
  onSelectParcel?: (parcelId: number) => void;
  onDrawParcelBoundary?: (geometry: { type: "Polygon"; coordinates: [number, number][][] }) => void;
  onSelectScene?: (sceneId: string) => void;
  onViewportChange?: (bbox: [number, number, number, number]) => void;
  analysisSelectionBbox?: [number, number, number, number] | null;
  onAnalysisSelectionChange?: (bbox: [number, number, number, number] | null) => void;
  locale?: string;
  compact?: boolean;
  guided?: boolean;
  guideAreaSelection?: boolean;
};

type Point = [number, number];

type SiteFeature = {
  type: "Feature";
  id: number;
  geometry: { type: "Point"; coordinates: Point };
  properties: {
    siteId: number;
    wilayaCode: string;
    wilaya: string;
    name: string;
    selected: boolean;
    intensity: number;
    isDemo: boolean;
  };
};

type SiteFeatureCollection = {
  type: "FeatureCollection";
  features: SiteFeature[];
};

type GeoJsonSource = {
  setData: (data: unknown) => void;
};

type ImageSource = {
  updateImage: (options: { url: string; coordinates: [Point, Point, Point, Point] }) => void;
};

type MapEvent = {
  features?: Array<{ properties?: Record<string, unknown> }>;
  lngLat?: { lng: number; lat: number };
  error?: unknown;
};

type MapInstance = {
  addControl: (control: unknown, position?: string) => void;
  addSource: (id: string, source: Record<string, unknown>) => void;
  addLayer: (layer: Record<string, unknown>) => void;
  getSource: (id: string) => unknown;
  getCanvas: () => HTMLCanvasElement;
  setPaintProperty: (layerId: string, name: string, value: unknown) => void;
  setLayoutProperty: (layerId: string, name: string, value: unknown) => void;
  setTerrain: (terrain: Record<string, unknown> | null) => void;
  fitBounds: (bounds: [Point, Point], options?: Record<string, unknown>) => void;
  flyTo: (options: Record<string, unknown>) => void;
  getBounds: () => {
    getWest: () => number;
    getSouth: () => number;
    getEast: () => number;
    getNorth: () => number;
  };
  on: {
    (event: string, handler: (event: MapEvent) => void): void;
    (event: string, layer: string, handler: (event: MapEvent) => void): void;
  };
  remove: () => void;
  resize: () => void;
};

type MapLibreModule = {
  Map: new (options: Record<string, unknown>) => MapInstance;
  NavigationControl: new (options?: Record<string, unknown>) => unknown;
  FullscreenControl: new (options?: Record<string, unknown>) => unknown;
  ScaleControl?: new (options?: Record<string, unknown>) => unknown;
  setWorkerUrl?: (url: string) => void;
};

const MAPLIBRE_MODULE_URL = "/vendor/maplibre-gl.mjs";
const MAPLIBRE_WORKER_URL = "/vendor/maplibre-gl-worker.mjs";
const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const TERRAIN_TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const ALGERIA_BOUNDS: [Point, Point] = [[-8.8, 18.4], [12.2, 37.5]];
const TRANSPARENT_PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/2m8pJwAAAABJRU5ErkJggg==";

function overlayCoordinates(bbox: [number, number, number, number]): [Point, Point, Point, Point] {
  const [west, south, east, north] = bbox;
  return [[west, north], [east, north], [east, south], [west, south]];
}

function wilayaCode(siteWilaya: string, wilayas: WilayaMeta[]) {
  const normalized = siteWilaya.trim().toLocaleLowerCase();
  return wilayas.find((w) =>
    [w.code, w.ar, w.fr, w.en].some((name) => name.trim().toLocaleLowerCase() === normalized)
  )?.code ?? "";
}

function isGeoJsonSource(value: unknown): value is GeoJsonSource {
  if (typeof value !== "object" || value === null || !("setData" in value)) return false;
  return typeof (value as { setData?: unknown }).setData === "function";
}

function isImageSource(value: unknown): value is ImageSource {
  if (typeof value !== "object" || value === null || !("updateImage" in value)) return false;
  return typeof (value as { updateImage?: unknown }).updateImage === "function";
}

function polygonPoints(feature: ParcelBoundaryFeature): Point[] {
  const coordinates = feature.geometry.coordinates;
  if (!Array.isArray(coordinates) || !Array.isArray(coordinates[0])) return [];
  return coordinates[0]
    .filter((point): point is [number, number] =>
      Array.isArray(point)
      && point.length >= 2
      && Number.isFinite(Number(point[0]))
      && Number.isFinite(Number(point[1]))
    )
    .map((point) => [Number(point[0]), Number(point[1])] as Point);
}

function draftGeoJson(points: Point[]) {
  const features: unknown[] = [];
  if (points.length >= 2) {
    features.push({
      type: "Feature",
      geometry: { type: "LineString", coordinates: points },
      properties: { kind: "line" },
    });
  }
  if (points.length >= 3) {
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[...points, points[0]]] },
      properties: { kind: "polygon" },
    });
  }
  for (let index = 0; index < points.length; index += 1) {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: points[index] },
      properties: { kind: "vertex", index },
    });
  }
  return { type: "FeatureCollection", features };
}

function boundsFor(points: Point[]): [Point, Point] | null {
  if (points.length === 0) return null;
  let minLon = points[0][0];
  let maxLon = points[0][0];
  let minLat = points[0][1];
  let maxLat = points[0][1];
  for (const [lon, lat] of points.slice(1)) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [[minLon, minLat], [maxLon, maxLat]];
}

const EARTH_RADIUS_M = 6_371_008.8;

function toRadians(value: number) {
  return value * Math.PI / 180;
}

function haversineMeters(a: Point, b: Point) {
  const dLat = toRadians(b[1] - a[1]);
  const dLon = toRadians(b[0] - a[0]);
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pathDistanceMeters(points: Point[]) {
  return points.slice(1).reduce(
    (total, point, index) => total + haversineMeters(points[index], point),
    0,
  );
}

function polygonAreaSquareMeters(points: Point[]) {
  if (points.length < 3) return 0;
  const meanLat = toRadians(points.reduce((sum, point) => sum + point[1], 0) / points.length);
  const projected = points.map(([lon, lat]) => [
    EARTH_RADIUS_M * toRadians(lon) * Math.cos(meanLat),
    EARTH_RADIUS_M * toRadians(lat),
  ] as Point);
  let twiceArea = 0;
  for (let index = 0; index < projected.length; index += 1) {
    const current = projected[index];
    const next = projected[(index + 1) % projected.length];
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(twiceArea) / 2;
}

function analysisSelectionGeoJson(bbox: [number, number, number, number] | null) {
  if (!bbox) return { type: "FeatureCollection", features: [] };
  const [west, south, east, north] = bbox;
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { kind: "analysis-selection" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ]],
      },
    }],
  };
}

function measurementGeoJson(points: Point[], areaMode: boolean) {
  const features: unknown[] = [];
  if (points.length >= 2) {
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: areaMode && points.length >= 3 ? [...points, points[0]] : points,
      },
      properties: { kind: "measurement-line" },
    });
  }
  if (areaMode && points.length >= 3) {
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[...points, points[0]]] },
      properties: { kind: "measurement-area" },
    });
  }
  points.forEach((point, index) => {
    features.push({
      type: "Feature",
      geometry: { type: "Point", coordinates: point },
      properties: { kind: "measurement-point", index },
    });
  });
  return { type: "FeatureCollection", features };
}

function formatDistance(meters: number, locale: string) {
  if (meters >= 1000) return `${(meters / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} km`;
  return `${meters.toLocaleString(locale, { maximumFractionDigits: 0 })} m`;
}

function formatArea(squareMeters: number, locale: string) {
  if (squareMeters >= 10_000) return `${(squareMeters / 10_000).toLocaleString(locale, { maximumFractionDigits: 2 })} ha`;
  return `${squareMeters.toLocaleString(locale, { maximumFractionDigits: 0 })} m²`;
}

export function NationalMap({
  sites,
  wilayas,
  satelliteScenes = [],
  parcelBoundaries = [],
  draftParcelBoundary = null,
  satelliteOverlay = null,
  analysisOverlay = null,
  selectedSceneId = null,
  selectedWilaya = "",
  selectedSiteId = null,
  selectedParcelId = null,
  selectedParcelPoint = null,
  onSelectWilaya,
  onSelectSite,
  onSelectParcel,
  onDrawParcelBoundary,
  onSelectScene,
  onViewportChange,
  analysisSelectionBbox = null,
  onAnalysisSelectionChange,
  locale = "ar",
  compact = false,
  guided = false,
  guideAreaSelection = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const onSelectSiteRef = useRef(onSelectSite);
  const onSelectParcelRef = useRef(onSelectParcel);
  const onDrawParcelBoundaryRef = useRef(onDrawParcelBoundary);
  const onSelectWilayaRef = useRef(onSelectWilaya);
  const onSelectSceneRef = useRef(onSelectScene);
  const onViewportChangeRef = useRef(onViewportChange);
  const onAnalysisSelectionChangeRef = useRef(onAnalysisSelectionChange);
  const featuresRef = useRef<SiteFeatureCollection>({ type: "FeatureCollection", features: [] });
  const sceneFeaturesRef = useRef({ type: "FeatureCollection", features: [] as unknown[] });
  const parcelFeaturesRef = useRef({ type: "FeatureCollection", features: [] as ParcelBoundaryFeature[] });
  const satelliteOverlayRef = useRef<SatelliteRasterOverlay | null>(satelliteOverlay);
  const analysisOverlayRef = useRef<AnalysisRasterOverlay | null>(analysisOverlay);
  const analysisSelectionBboxRef = useRef<[number, number, number, number] | null>(analysisSelectionBbox);
  const [engineState, setEngineState] = useState<"loading" | "ready" | "error">("loading");
  const [mapMode, setMapMode] = useState<"street" | "satellite" | "relief" | "analysis">("street");
  const [visibleLayers, setVisibleLayers] = useState({
    sites: true,
    parcels: true,
    scenes: true,
    analysis: true,
  });
  const [drawingBoundary, setDrawingBoundary] = useState(false);
  const [draftPoints, setDraftPoints] = useState<Point[]>([]);
  const [cursorCoordinate, setCursorCoordinate] = useState<Point | null>(null);
  const [measureMode, setMeasureMode] = useState<"none" | "distance" | "area">("none");
  const [measurePoints, setMeasurePoints] = useState<Point[]>([]);
  const [satelliteOpacity, setSatelliteOpacity] = useState(96);
  const [analysisOpacity, setAnalysisOpacity] = useState(90);
  const [selectingAnalysisArea, setSelectingAnalysisArea] = useState(false);
  const [, setAnalysisCorner] = useState<Point | null>(null);
  const drawingBoundaryRef = useRef(false);
  const measureModeRef = useRef<"none" | "distance" | "area">("none");
  const selectingAnalysisAreaRef = useRef(false);

  onSelectSiteRef.current = onSelectSite;
  onSelectParcelRef.current = onSelectParcel;
  onDrawParcelBoundaryRef.current = onDrawParcelBoundary;
  drawingBoundaryRef.current = drawingBoundary;
  measureModeRef.current = measureMode;
  onSelectWilayaRef.current = onSelectWilaya;
  onSelectSceneRef.current = onSelectScene;
  onViewportChangeRef.current = onViewportChange;
  onAnalysisSelectionChangeRef.current = onAnalysisSelectionChange;
  selectingAnalysisAreaRef.current = selectingAnalysisArea;
  satelliteOverlayRef.current = satelliteOverlay;
  analysisOverlayRef.current = analysisOverlay;
  analysisSelectionBboxRef.current = analysisSelectionBbox;

  const plotted = useMemo(
    () => sites
      .filter((g) => Number.isFinite(g.site.lat) && Number.isFinite(g.site.lon))
      .map((g) => ({
        ...g,
        code: wilayaCode(g.site.wilaya, wilayas),
      })),
    [sites, wilayas],
  );

  const featureCollection = useMemo<SiteFeatureCollection>(() => ({
    type: "FeatureCollection",
    features: plotted.map((g) => ({
      type: "Feature",
      id: g.site.id,
      geometry: {
        type: "Point",
        coordinates: [g.site.lon, g.site.lat],
      },
      properties: {
        siteId: g.site.id,
        wilayaCode: g.code,
        wilaya: g.site.wilaya,
        name: g.site.name,
        selected: selectedSiteId === g.site.id || (!!selectedWilaya && g.code === selectedWilaya),
        intensity: Math.min(4, g.projects.length + g.resources.length + g.assets.length),
        isDemo: g.site.is_demo,
      },
    })),
  }), [plotted, selectedSiteId, selectedWilaya]);

  featuresRef.current = featureCollection;

  const sceneFeatureCollection = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: satelliteScenes.map((scene) => ({
      type: "Feature" as const,
      id: scene.id,
      geometry: scene.geometry,
      properties: {
        sceneId: scene.id,
        datetime: scene.datetime,
        cloudCover: scene.cloud_cover_pct,
        provider: scene.provider,
        selected: scene.id === selectedSceneId,
      },
    })),
  }), [satelliteScenes, selectedSceneId]);
  sceneFeaturesRef.current = sceneFeatureCollection;

  const parcelFeatureCollection = useMemo(() => ({
    type: "FeatureCollection" as const,
    features: [
      ...parcelBoundaries.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          selected: feature.properties.id === selectedParcelId,
        },
      })),
      ...(draftParcelBoundary ? [{
        type: "Feature" as const,
        id: -1,
        geometry: draftParcelBoundary,
        properties: {
          id: -1, name: "Unsaved drawn polygon", crop: "", area_ha: 0,
          location: "", site_id: null, is_demo: false, selected: true,
        },
      }] : []),
    ],
  }), [parcelBoundaries, draftParcelBoundary, selectedParcelId]);
  parcelFeaturesRef.current = parcelFeatureCollection;

  const labels = locale === "fr"
    ? {
        title: "Carte opérationnelle nationale",
        sites: "sites",
        loading: "Chargement de la carte ouverte…",
        unavailable: "Fond cartographique momentanément indisponible",
        unavailableNote: "Les données FOGGARA restent accessibles dans le registre spatial ci-dessous.",
        note: "Fond OpenStreetMap via OpenFreeMap · points FOGGARA + empreintes Sentinel-2 en direct",
        source: "Open map",
        scenes: "scènes Sentinel-2",
        parcels: "parcelles cartographiées",
        street: "Plan", satellite: "Scène vraie couleur", relief: "Relief", analysis: "Indice raster",
        layerSites: "Sites", layerParcels: "Parcelles", layerScenes: "Sentinel", layerAnalysis: "Résultat",
        modes: "Vue", layers: "Couches", draw: "Dessiner la limite", finish: "Enregistrer", cancel: "Annuler", vertices: "points",
        tools: "Outils", reset: "Algérie", distance: "Distance", areaMeasure: "Surface", clearMeasure: "Effacer",
        selectArea: "Zone d’analyse", firstCorner: "Choisissez 2 coins", clearArea: "Effacer zone",
        opacity: "Opacité", coordinates: "Coordonnées", measured: "Mesure",
      }
    : locale === "en"
      ? {
          title: "National operational map",
          sites: "sites",
          loading: "Loading open map…",
          unavailable: "Basemap temporarily unavailable",
          unavailableNote: "FOGGARA data remains available in the spatial register below.",
          note: "OpenStreetMap via OpenFreeMap · FOGGARA points + live Sentinel-2 footprints",
          source: "Open map",
          scenes: "Sentinel-2 scenes",
          parcels: "mapped parcels",
          street: "Street", satellite: "True-color scene", relief: "Relief", analysis: "Index raster",
          layerSites: "Sites", layerParcels: "Parcels", layerScenes: "Sentinel", layerAnalysis: "Result",
          modes: "View", layers: "Layers", draw: "Draw boundary", finish: "Save boundary", cancel: "Cancel", vertices: "points",
          tools: "Tools", reset: "Algeria", distance: "Distance", areaMeasure: "Area", clearMeasure: "Clear",
          selectArea: "Select analysis area", firstCorner: "Pick 2 corners", clearArea: "Clear area",
          opacity: "Opacity", coordinates: "Coordinates", measured: "Measurement",
        }
      : {
          title: "الخريطة التشغيلية الوطنية",
          sites: "مواقع",
          loading: "جارٍ تحميل الخريطة المفتوحة…",
          unavailable: "الخريطة الأساسية غير متاحة مؤقتًا",
          unavailableNote: "تبقى بيانات FOGGARA متاحة في السجل المكاني أسفل الخريطة.",
          note: "OpenStreetMap عبر OpenFreeMap · نقاط FOGGARA + حدود مشاهد Sentinel-2 الحية",
          source: "خريطة مفتوحة",
          scenes: "مشاهد Sentinel-2",
          parcels: "قطع مرسومة",
          street: "شوارع", satellite: "مشهد حقيقي الألوان", relief: "تضاريس", analysis: "راستر المؤشر",
          layerSites: "المواقع", layerParcels: "القطع", layerScenes: "Sentinel", layerAnalysis: "النتيجة",
          modes: "الرؤية", layers: "الطبقات", draw: "ارسم حدود القطعة", finish: "احفظ الحدود", cancel: "إلغاء", vertices: "نقاط",
          tools: "أدوات", reset: "الجزائر", distance: "مسافة", areaMeasure: "مساحة", clearMeasure: "مسح",
          selectArea: "حدد منطقة التحليل", firstCorner: "اختر زاويتين", clearArea: "مسح المنطقة",
          opacity: "الشفافية", coordinates: "الإحداثيات", measured: "القياس",
        };

  useEffect(() => {
    let cancelled = false;
    let map: MapInstance | null = null;
    let loadTimeout: number | null = null;

    const boot = async () => {
      try {
        const module = await import(/* @vite-ignore */ MAPLIBRE_MODULE_URL) as unknown as MapLibreModule;
        if (cancelled || !containerRef.current) return;

        module.setWorkerUrl?.(MAPLIBRE_WORKER_URL);
        map = new module.Map({
          container: containerRef.current,
          style: OPENFREEMAP_STYLE,
          center: [2.6, 28.2],
          zoom: compact ? 3.5 : 4.1,
          minZoom: 2,
          maxZoom: 18,
          attributionControl: true,
          maplibreLogo: false,
        });
        mapRef.current = map;

        map.addControl(new module.NavigationControl({ showCompass: true, visualizePitch: true }), "top-left");
        map.addControl(new module.FullscreenControl(), "top-left");
        if (module.ScaleControl) {
          map.addControl(new module.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
        }

        loadTimeout = window.setTimeout(() => {
          if (!cancelled) setEngineState((state) => state === "ready" ? state : "error");
        }, 15_000);

        map.on("load", () => {
          if (cancelled || !map) return;
          if (loadTimeout !== null) window.clearTimeout(loadTimeout);

          map.addSource("terrain-dem", {
            type: "raster-dem",
            tiles: [TERRAIN_TILE_URL],
            tileSize: 256,
            encoding: "terrarium",
            maxzoom: 15,
            attribution: "Terrain Tiles · Mapzen / AWS Open Data",
          });
          map.addLayer({
            id: "terrain-hillshade",
            type: "hillshade",
            source: "terrain-dem",
            layout: { visibility: "none" },
            paint: {
              "hillshade-exaggeration": 0.34,
              "hillshade-shadow-color": "#26352f",
              "hillshade-highlight-color": "#f3ead7",
            },
          });

          const initialSatellite = satelliteOverlayRef.current;
          map.addSource("satellite-true-color", {
            type: "image",
            url: initialSatellite?.url ?? TRANSPARENT_PIXEL,
            coordinates: overlayCoordinates(initialSatellite?.bbox ?? [-8.8, 18.4, 12.2, 37.5]),
          });
          map.addLayer({
            id: "satellite-true-color",
            type: "raster",
            source: "satellite-true-color",
            paint: {
              "raster-opacity": 0,
              "raster-fade-duration": 0,
            },
          });

          const initialOverlay = analysisOverlayRef.current;
          map.addSource("analysis-overlay", {
            type: "image",
            url: initialOverlay?.url ?? TRANSPARENT_PIXEL,
            coordinates: overlayCoordinates(initialOverlay?.bbox ?? [-8.8, 18.4, 12.2, 37.5]),
          });
          map.addLayer({
            id: "analysis-overlay",
            type: "raster",
            source: "analysis-overlay",
            paint: {
              "raster-opacity": initialOverlay ? 0.78 : 0,
              "raster-fade-duration": 0,
            },
          });

          map.addSource("satellite-scenes", {
            type: "geojson",
            data: sceneFeaturesRef.current,
          });
          map.addLayer({
            id: "satellite-scenes-fill",
            type: "fill",
            source: "satellite-scenes",
            paint: {
              "fill-color": ["case", ["boolean", ["get", "selected"], false], "#f59e0b", "#0ea5e9"],
              "fill-opacity": ["case", ["boolean", ["get", "selected"], false], 0.2, 0.09],
            },
          });
          map.addLayer({
            id: "satellite-scenes-outline",
            type: "line",
            source: "satellite-scenes",
            paint: {
              "line-color": ["case", ["boolean", ["get", "selected"], false], "#d97706", "#0284c7"],
              "line-width": ["case", ["boolean", ["get", "selected"], false], 3, 2],
              "line-opacity": 0.86,
            },
          });

          map.addSource("agri-parcel-boundaries", {
            type: "geojson",
            data: parcelFeaturesRef.current,
          });
          map.addLayer({
            id: "agri-parcel-fill",
            type: "fill",
            source: "agri-parcel-boundaries",
            paint: {
              "fill-color": ["case", ["boolean", ["get", "selected"], false], "#f59e0b", "#178568"],
              "fill-opacity": ["case", ["boolean", ["get", "selected"], false], 0.3, 0.17],
            },
          });
          map.addLayer({
            id: "agri-parcel-outline",
            type: "line",
            source: "agri-parcel-boundaries",
            paint: {
              "line-color": ["case", ["boolean", ["get", "selected"], false], "#d97706", "#0f6f56"],
              "line-width": ["case", ["boolean", ["get", "selected"], false], 3.4, 2.2],
              "line-opacity": 0.92,
            },
          });

          map.addSource("parcel-draft", {
            type: "geojson",
            data: draftGeoJson([]),
          });
          map.addLayer({
            id: "parcel-draft-fill",
            type: "fill",
            source: "parcel-draft",
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: {
              "fill-color": "#f59e0b",
              "fill-opacity": 0.2,
            },
          });
          map.addLayer({
            id: "parcel-draft-line",
            type: "line",
            source: "parcel-draft",
            filter: ["==", ["geometry-type"], "LineString"],
            paint: {
              "line-color": "#d97706",
              "line-width": 3,
              "line-dasharray": [2, 1.2],
            },
          });
          map.addLayer({
            id: "parcel-draft-points",
            type: "circle",
            source: "parcel-draft",
            filter: ["==", ["geometry-type"], "Point"],
            paint: {
              "circle-radius": 5,
              "circle-color": "#f59e0b",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          });

          map.addSource("measurement-draft", {
            type: "geojson",
            data: measurementGeoJson([], false),
          });
          map.addLayer({
            id: "measurement-fill",
            type: "fill",
            source: "measurement-draft",
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: { "fill-color": "#2563eb", "fill-opacity": 0.16 },
          });
          map.addLayer({
            id: "measurement-line",
            type: "line",
            source: "measurement-draft",
            filter: ["==", ["geometry-type"], "LineString"],
            paint: {
              "line-color": "#1d4ed8",
              "line-width": 3,
              "line-dasharray": [2, 1],
            },
          });
          map.addLayer({
            id: "measurement-points",
            type: "circle",
            source: "measurement-draft",
            filter: ["==", ["geometry-type"], "Point"],
            paint: {
              "circle-radius": 4.5,
              "circle-color": "#2563eb",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
            },
          });

          map.addSource("analysis-selection", {
            type: "geojson",
            data: analysisSelectionGeoJson(analysisSelectionBboxRef.current),
          });
          map.addLayer({
            id: "analysis-selection-fill",
            type: "fill",
            source: "analysis-selection",
            paint: {
              "fill-color": "#7c3aed",
              "fill-opacity": 0.12,
            },
          });
          map.addLayer({
            id: "analysis-selection-line",
            type: "line",
            source: "analysis-selection",
            paint: {
              "line-color": "#7c3aed",
              "line-width": 3,
              "line-dasharray": [2, 1],
            },
          });

          map.addSource("foggara-sites", {
            type: "geojson",
            data: featuresRef.current,
          });
          map.addLayer({
            id: "foggara-site-halo",
            type: "circle",
            source: "foggara-sites",
            paint: {
              "circle-radius": ["case", ["boolean", ["get", "selected"], false], 14, 9],
              "circle-color": ["case", ["boolean", ["get", "selected"], false], "#f0b75d", "#2d9b72"],
              "circle-opacity": ["case", ["boolean", ["get", "selected"], false], 0.28, 0.16],
              "circle-blur": 0.35,
            },
          });
          map.addLayer({
            id: "foggara-sites",
            type: "circle",
            source: "foggara-sites",
            paint: {
              "circle-radius": ["case", ["boolean", ["get", "selected"], false], 7.5, ["+", 4.5, ["*", ["get", "intensity"], 0.55]]],
              "circle-color": ["case", ["boolean", ["get", "selected"], false], "#f0b75d", "#23825f"],
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": ["case", ["boolean", ["get", "selected"], false], 2.5, 1.5],
              "circle-opacity": 0.96,
            },
          });

          map.on("mouseenter", "satellite-scenes-fill", () => {
            if (map) map.getCanvas().style.cursor = drawingBoundaryRef.current || selectingAnalysisAreaRef.current || measureModeRef.current !== "none" ? "crosshair" : "pointer";
          });
          map.on("mouseleave", "satellite-scenes-fill", () => {
            if (map) map.getCanvas().style.cursor = drawingBoundaryRef.current || selectingAnalysisAreaRef.current || measureModeRef.current !== "none" ? "crosshair" : "";
          });
          map.on("click", "satellite-scenes-fill", (event) => {
            if (drawingBoundaryRef.current || selectingAnalysisAreaRef.current || measureModeRef.current !== "none") return;
            const sceneId = String(event.features?.[0]?.properties?.sceneId ?? "");
            if (sceneId && onSelectSceneRef.current) onSelectSceneRef.current(sceneId);
          });

          map.on("mouseenter", "agri-parcel-fill", () => {
            if (map) map.getCanvas().style.cursor = drawingBoundaryRef.current || selectingAnalysisAreaRef.current || measureModeRef.current !== "none" ? "crosshair" : "pointer";
          });
          map.on("mouseleave", "agri-parcel-fill", () => {
            if (map) map.getCanvas().style.cursor = drawingBoundaryRef.current || selectingAnalysisAreaRef.current || measureModeRef.current !== "none" ? "crosshair" : "";
          });
          map.on("click", "agri-parcel-fill", (event) => {
            if (drawingBoundaryRef.current || selectingAnalysisAreaRef.current || measureModeRef.current !== "none") return;
            const parcelId = Number(event.features?.[0]?.properties?.id);
            if (Number.isFinite(parcelId) && parcelId > 0 && onSelectParcelRef.current) {
              onSelectParcelRef.current(parcelId);
            }
          });

          map.on("mouseenter", "foggara-sites", () => {
            if (map) map.getCanvas().style.cursor = drawingBoundaryRef.current || selectingAnalysisAreaRef.current || measureModeRef.current !== "none" ? "crosshair" : "pointer";
          });
          map.on("mouseleave", "foggara-sites", () => {
            if (map) map.getCanvas().style.cursor = drawingBoundaryRef.current || selectingAnalysisAreaRef.current || measureModeRef.current !== "none" ? "crosshair" : "";
          });
          map.on("click", "foggara-sites", (event) => {
            if (drawingBoundaryRef.current || selectingAnalysisAreaRef.current || measureModeRef.current !== "none") return;
            const properties = event.features?.[0]?.properties;
            const siteId = Number(properties?.siteId);
            const code = String(properties?.wilayaCode ?? "");
            if (Number.isFinite(siteId) && onSelectSiteRef.current) onSelectSiteRef.current(siteId);
            else if (code && onSelectWilayaRef.current) onSelectWilayaRef.current(code);
          });

          map.on("click", (event) => {
            if (!event.lngLat) return;
            const point: Point = [Number(event.lngLat.lng), Number(event.lngLat.lat)];
            if (!point.every(Number.isFinite)) return;
            if (selectingAnalysisAreaRef.current) {
              setAnalysisCorner((first) => {
                if (!first) return point;
                const west = Math.min(first[0], point[0]);
                const south = Math.min(first[1], point[1]);
                const east = Math.max(first[0], point[0]);
                const north = Math.max(first[1], point[1]);
                if (east - west > 1e-6 && north - south > 1e-6) {
                  onAnalysisSelectionChangeRef.current?.([west, south, east, north]);
                }
                setSelectingAnalysisArea(false);
                return null;
              });
              return;
            }
            if (drawingBoundaryRef.current) {
              setDraftPoints((current) => [...current, point]);
              return;
            }
            if (measureModeRef.current !== "none") {
              setMeasurePoints((current) => [...current, point]);
            }
          });
          map.on("mousemove", (event) => {
            if (!event.lngLat) return;
            const point: Point = [Number(event.lngLat.lng), Number(event.lngLat.lat)];
            if (point.every(Number.isFinite)) setCursorCoordinate(point);
          });

          const reportViewport = () => {
            const bounds = map?.getBounds();
            if (!bounds || !onViewportChangeRef.current) return;
            onViewportChangeRef.current([
              bounds.getWest(),
              bounds.getSouth(),
              bounds.getEast(),
              bounds.getNorth(),
            ]);
          };
          map.on("moveend", reportViewport);
          map.fitBounds(ALGERIA_BOUNDS, { padding: compact ? 18 : 34, duration: 0 });
          reportViewport();
          setEngineState("ready");
        });
      } catch {
        if (!cancelled) setEngineState("error");
      }
    };

    void boot();

    return () => {
      cancelled = true;
      if (loadTimeout !== null) window.clearTimeout(loadTimeout);
      map?.remove();
      mapRef.current = null;
    };
  }, [compact]);

  useEffect(() => {
    const source = mapRef.current?.getSource("foggara-sites");
    if (isGeoJsonSource(source)) source.setData(featureCollection);
  }, [featureCollection]);

  useEffect(() => {
    const source = mapRef.current?.getSource("satellite-scenes");
    if (isGeoJsonSource(source)) source.setData(sceneFeatureCollection);
  }, [sceneFeatureCollection]);

  useEffect(() => {
    const source = mapRef.current?.getSource("agri-parcel-boundaries");
    if (isGeoJsonSource(source)) source.setData(parcelFeatureCollection);
  }, [parcelFeatureCollection]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("satellite-true-color");
    if (!map || !isImageSource(source)) return;
    const bbox: [number, number, number, number] = satelliteOverlay?.bbox ?? [-8.8, 18.4, 12.2, 37.5];
    source.updateImage({
      url: satelliteOverlay?.url ?? TRANSPARENT_PIXEL,
      coordinates: overlayCoordinates(bbox),
    });
  }, [satelliteOverlay]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("analysis-overlay");
    if (!map || !isImageSource(source)) return;
    const bbox: [number, number, number, number] = analysisOverlay?.bbox ?? [-8.8, 18.4, 12.2, 37.5];
    source.updateImage({
      url: analysisOverlay?.url ?? TRANSPARENT_PIXEL,
      coordinates: overlayCoordinates(bbox),
    });
    map.setPaintProperty("analysis-overlay", "raster-opacity", analysisOverlay ? 0.78 : 0);
  }, [analysisOverlay]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("parcel-draft");
    if (isGeoJsonSource(source)) source.setData(draftGeoJson(draftPoints));
    if (map) map.getCanvas().style.cursor = drawingBoundary || selectingAnalysisArea || measureMode !== "none" ? "crosshair" : "";
  }, [draftPoints, drawingBoundary, selectingAnalysisArea, measureMode]);

  useEffect(() => {
    const source = mapRef.current?.getSource("analysis-selection");
    if (isGeoJsonSource(source)) source.setData(analysisSelectionGeoJson(analysisSelectionBbox));
  }, [analysisSelectionBbox]);

  useEffect(() => {
    const source = mapRef.current?.getSource("measurement-draft");
    if (isGeoJsonSource(source)) {
      source.setData(measurementGeoJson(measurePoints, measureMode === "area"));
    }
  }, [measureMode, measurePoints]);

  useEffect(() => {
    if (analysisOverlay) {
      setMapMode("analysis");
      return;
    }
    if (satelliteOverlay) setMapMode("satellite");
  }, [analysisOverlay, satelliteOverlay]);

  useEffect(() => {
    if (!analysisOverlay && mapMode === "analysis") setMapMode(satelliteOverlay ? "satellite" : "street");
    if (!satelliteOverlay && mapMode === "satellite") setMapMode("street");
  }, [analysisOverlay, mapMode, satelliteOverlay]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || engineState !== "ready") return;

    const visibility = (visible: boolean) => visible ? "visible" : "none";
    map.setLayoutProperty("foggara-sites", "visibility", visibility(visibleLayers.sites));
    map.setLayoutProperty("foggara-site-halo", "visibility", visibility(visibleLayers.sites));
    map.setLayoutProperty("agri-parcel-fill", "visibility", visibility(visibleLayers.parcels));
    map.setLayoutProperty("agri-parcel-outline", "visibility", visibility(visibleLayers.parcels));
    map.setLayoutProperty("satellite-scenes-fill", "visibility", visibility(visibleLayers.scenes));
    map.setLayoutProperty("satellite-scenes-outline", "visibility", visibility(visibleLayers.scenes));

    const satelliteRasterOpacity = !satelliteOverlay
      ? 0
      : mapMode === "satellite"
        ? satelliteOpacity / 100
        : mapMode === "analysis"
          ? Math.min(0.65, satelliteOpacity / 100)
          : 0;
    map.setPaintProperty("satellite-true-color", "raster-opacity", satelliteRasterOpacity);

    const overlayOpacity = !analysisOverlay || !visibleLayers.analysis || mapMode !== "analysis"
      ? 0
      : analysisOpacity / 100;
    map.setPaintProperty("analysis-overlay", "raster-opacity", overlayOpacity);

    if (mapMode === "relief") {
      map.setLayoutProperty("terrain-hillshade", "visibility", "visible");
      map.setTerrain({ source: "terrain-dem", exaggeration: 1.15 });
    } else {
      map.setLayoutProperty("terrain-hillshade", "visibility", "none");
      map.setTerrain(null);
    }
  }, [analysisOpacity, analysisOverlay, engineState, mapMode, satelliteOpacity, satelliteOverlay, visibleLayers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || engineState !== "ready") return;

    const selectedParcel = parcelBoundaries.find((feature) => feature.properties.id === selectedParcelId);
    const parcelBounds = selectedParcel ? boundsFor(polygonPoints(selectedParcel)) : null;
    if (parcelBounds) {
      map.fitBounds(parcelBounds, {
        padding: compact ? 42 : 78,
        maxZoom: compact ? 14 : 16,
        duration: 650,
      });
      return;
    }

    if (
      selectedParcelId
      && selectedParcelPoint
      && Number.isFinite(selectedParcelPoint.lat)
      && Number.isFinite(selectedParcelPoint.lon)
    ) {
      map.flyTo({
        center: [selectedParcelPoint.lon, selectedParcelPoint.lat],
        zoom: compact ? 12 : 14,
        duration: 650,
      });
      return;
    }

    const selectedSite = plotted.find((entry) => entry.site.id === selectedSiteId);
    if (selectedSite) {
      map.flyTo({
        center: [selectedSite.site.lon, selectedSite.site.lat],
        zoom: compact ? 7 : 8,
        duration: 650,
      });
      return;
    }

    if (selectedWilaya) {
      const points = plotted
        .filter((entry) => entry.code === selectedWilaya)
        .map((entry) => [entry.site.lon, entry.site.lat] as Point);
      const bounds = boundsFor(points);
      if (bounds) {
        map.fitBounds(bounds, {
          padding: compact ? 34 : 64,
          maxZoom: compact ? 8 : 10,
          duration: 650,
        });
        return;
      }
    }

    map.fitBounds(ALGERIA_BOUNDS, { padding: compact ? 18 : 34, duration: 500 });
  }, [compact, engineState, parcelBoundaries, plotted, selectedParcelId, selectedParcelPoint, selectedSiteId, selectedWilaya]);

  const measuredDistance = pathDistanceMeters(measurePoints);
  const measuredArea = measureMode === "area" ? polygonAreaSquareMeters(measurePoints) : 0;
  const selectedScene = satelliteScenes.find((scene) => scene.id === selectedSceneId) ?? null;

  const toggleMeasureMode = (mode: "distance" | "area") => {
    setDrawingBoundary(false);
    setSelectingAnalysisArea(false);
    setAnalysisCorner(null);
    setDraftPoints([]);
    setMeasurePoints([]);
    setMeasureMode((current) => current === mode ? "none" : mode);
  };

  const resetMap = () => {
    mapRef.current?.fitBounds(ALGERIA_BOUNDS, { padding: compact ? 18 : 34, duration: 500 });
  };

  return (
    <section className={`fg-national-map ${compact ? "compact" : ""} ${guided ? "guided" : ""}`} aria-label={labels.title}>
      <div className="fg-national-map-head">
        <div>
          <span className="fg-map-kicker">ALGERIA · {wilayas.length || 69} WILAYAS</span>
          <h2>{labels.title}</h2>
        </div>
        <div className="fg-map-head-meta">
          <span>{labels.source}</span>
          <strong>{guided ? `${parcelBoundaries.length} ${labels.parcels}` : `${plotted.length} ${labels.sites} · ${parcelBoundaries.length} ${labels.parcels} · ${satelliteScenes.length} ${labels.scenes}`}</strong>
        </div>
      </div>

      <div className="fg-national-map-canvas">
        <div ref={containerRef} className="fg-maplibre-host" role="application" aria-label={labels.title} />
        <div className="fg-map-control-stack">
          <div className="fg-map-control-card" aria-label={labels.modes}>
            <small>{labels.modes}</small>
            <div>
              {([
                ["street", labels.street],
                ...(satelliteOverlay ? [["satellite", labels.satellite]] : []),
                ["relief", labels.relief],
                ...(analysisOverlay ? [["analysis", labels.analysis]] : []),
              ] as Array<["street" | "satellite" | "relief" | "analysis", string]>).map(([mode, label]) => (
                <button
                  type="button"
                  key={mode}
                  className={mapMode === mode ? "active" : ""}
                  aria-pressed={mapMode === mode}
                  onClick={() => setMapMode(mode)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {!guided ? <div className="fg-map-control-card" aria-label={labels.layers}>
            <small>{labels.layers}</small>
            <div className="fg-map-layer-buttons">
              {([
                ["sites", labels.layerSites],
                ["parcels", labels.layerParcels],
                ["scenes", labels.layerScenes],
                ...(analysisOverlay ? [["analysis", labels.layerAnalysis]] : []),
              ] as Array<[keyof typeof visibleLayers, string]>).map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className={visibleLayers[key] ? "active" : ""}
                  aria-pressed={visibleLayers[key]}
                  onClick={() => setVisibleLayers((current) => ({ ...current, [key]: !current[key] }))}
                >
                  {label}
                </button>
              ))}
            </div>
          </div> : null}
          <div className="fg-map-control-card" aria-label={labels.tools}>
            <small>{labels.tools}</small>
            <div className="fg-map-layer-buttons">
              <button type="button" onClick={resetMap}>{labels.reset}</button>
              <button
                type="button"
                className={`${selectingAnalysisArea ? "active" : ""} ${guideAreaSelection ? "guide-primary" : ""}`}
                aria-pressed={selectingAnalysisArea}
                onClick={() => {
                  setDrawingBoundary(false);
                  setDraftPoints([]);
                  setMeasureMode("none");
                  setMeasurePoints([]);
                  setAnalysisCorner(null);
                  setSelectingAnalysisArea((current) => !current);
                }}
              >
                {selectingAnalysisArea ? labels.firstCorner : labels.selectArea}
              </button>
              {analysisSelectionBbox ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectingAnalysisArea(false);
                    setAnalysisCorner(null);
                    onAnalysisSelectionChangeRef.current?.(null);
                  }}
                >
                  {labels.clearArea}
                </button>
              ) : null}
              <button
                type="button"
                className={measureMode === "distance" ? "active" : ""}
                aria-pressed={measureMode === "distance"}
                onClick={() => toggleMeasureMode("distance")}
              >
                {labels.distance}
              </button>
              <button
                type="button"
                className={measureMode === "area" ? "active" : ""}
                aria-pressed={measureMode === "area"}
                onClick={() => toggleMeasureMode("area")}
              >
                {labels.areaMeasure}
              </button>
              {measurePoints.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setMeasurePoints([]);
                    setMeasureMode("none");
                  }}
                >
                  {labels.clearMeasure}
                </button>
              ) : null}
            </div>
          </div>
          {(satelliteOverlay || analysisOverlay) ? (
            <div className="fg-map-control-card fg-map-opacity-card" aria-label={labels.opacity}>
              <small>{labels.opacity}</small>
              {satelliteOverlay ? (
                <label>
                  <span>{labels.satellite} · {satelliteOpacity}%</span>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={satelliteOpacity}
                    onChange={(event) => setSatelliteOpacity(Number(event.target.value))}
                  />
                </label>
              ) : null}
              {analysisOverlay ? (
                <label>
                  <span>{labels.analysis} · {analysisOpacity}%</span>
                  <input
                    type="range"
                    min="10"
                    max="100"
                    step="5"
                    value={analysisOpacity}
                    onChange={(event) => setAnalysisOpacity(Number(event.target.value))}
                  />
                </label>
              ) : null}
            </div>
          ) : null}
          {onDrawParcelBoundary ? (
            <div className="fg-map-control-card fg-map-draw-card">
              {!drawingBoundary ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectingAnalysisArea(false);
                    setAnalysisCorner(null);
                    setMeasureMode("none");
                    setMeasurePoints([]);
                    setDraftPoints([]);
                    setDrawingBoundary(true);
                  }}
                >
                  {labels.draw}
                </button>
              ) : (
                <>
                  <span>{draftPoints.length} {labels.vertices}</span>
                  <button
                    type="button"
                    disabled={draftPoints.length < 3}
                    onClick={() => {
                      if (draftPoints.length < 3 || !onDrawParcelBoundaryRef.current) return;
                      onDrawParcelBoundaryRef.current({
                        type: "Polygon",
                        coordinates: [[...draftPoints, draftPoints[0]]],
                      });
                      setDrawingBoundary(false);
                      setDraftPoints([]);
                    }}
                  >
                    {labels.finish}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDrawingBoundary(false);
                      setDraftPoints([]);
                    }}
                  >
                    {labels.cancel}
                  </button>
                </>
              )}
            </div>
          ) : null}
        </div>
        <div className="fg-map-readout" aria-live="polite">
          {cursorCoordinate ? (
            <span title={labels.coordinates} dir="ltr">
              {cursorCoordinate[1].toFixed(5)}, {cursorCoordinate[0].toFixed(5)}
            </span>
          ) : null}
          {analysisSelectionBbox ? (
            <strong dir="ltr">
              AOI: {analysisSelectionBbox.map((value) => value.toFixed(5)).join(", ")}
            </strong>
          ) : null}
          {measurePoints.length > 1 ? (
            <strong>
              {labels.measured}: {measureMode === "area" && measurePoints.length >= 3
                ? formatArea(measuredArea, locale)
                : formatDistance(measuredDistance, locale)}
            </strong>
          ) : null}
          {selectedScene ? (
            <span>
              Sentinel-2 · {selectedScene.datetime ? new Date(selectedScene.datetime).toLocaleDateString(locale) : selectedScene.id}
              {selectedScene.cloud_cover_pct == null ? "" : ` · ${Number(selectedScene.cloud_cover_pct).toFixed(1)}% ☁`}
            </span>
          ) : null}
        </div>
        {engineState === "loading" && (
          <div className="fg-map-engine-state" aria-live="polite">{labels.loading}</div>
        )}
        {engineState === "error" && (
          <div className="fg-map-engine-state error" role="status">
            <strong>{labels.unavailable}</strong>
            <span>{labels.unavailableNote}</span>
          </div>
        )}
      </div>

      <div className="fg-national-map-foot">
        <span><i className="fg-map-legend-dot" /> {labels.sites}</span>
        <span><i className="fg-map-legend-dot" style={{ background: "#178568" }} /> {labels.parcels}</span>
        <span><i className="fg-map-legend-dot" style={{ background: "#0ea5e9" }} /> {labels.scenes}</span>
        {analysisOverlay ? <span className="font-semibold uppercase">{analysisOverlay.index} · COMPUTED</span> : null}
        <small>{labels.note}</small>
      </div>
    </section>
  );
}
