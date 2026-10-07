import { useEffect, useMemo, useRef, useState } from "react";
import type { GisSite, WilayaMeta } from "@/types";

export type AnalysisRasterOverlay = {
  url: string;
  bbox: [number, number, number, number];
  index: "ndvi" | "evi" | "savi" | "ndwi" | "lswi";
};

export type SatelliteRasterOverlay = {
  url: string;
  bbox: [number, number, number, number];
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
  analysisOverlay?: AnalysisRasterOverlay | null;
  satelliteOverlay?: SatelliteRasterOverlay | null;
  selectedSceneId?: string | null;
  selectedWilaya?: string;
  selectedSiteId?: number | null;
  selectedParcelId?: number | null;
  onSelectWilaya?: (code: string) => void;
  onSelectSite?: (siteId: number) => void;
  onSelectParcel?: (parcelId: number) => void;
  onSelectScene?: (sceneId: string) => void;
  onViewportChange?: (bbox: [number, number, number, number]) => void;
  drawMode?: boolean;
  draftBoundary?: Point[];
  onDraftBoundaryChange?: (points: Point[]) => void;
  locale?: string;
  compact?: boolean;
  minimal?: boolean;
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
  setTerrain: (options: { source: string; exaggeration?: number } | null) => void;
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
  setWorkerUrl?: (url: string) => void;
};

const MAPLIBRE_MODULE_URL = "/vendor/maplibre-gl.mjs";
const MAPLIBRE_WORKER_URL = "/vendor/maplibre-gl-worker.mjs";
const OPENFREEMAP_STYLES = {
  map: "https://tiles.openfreemap.org/styles/liberty",
  dark: "https://tiles.openfreemap.org/styles/dark",
  relief: "https://tiles.openfreemap.org/styles/bright",
  satellite: "https://tiles.openfreemap.org/styles/liberty",
} as const;
const MAPTERHORN_TERRAIN = "https://tiles.mapterhorn.com/tilejson.json";
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

function draftCollection(points: Point[]) {
  const features: unknown[] = points.map((point, index) => ({
    type: "Feature",
    id: `draft-${index}`,
    properties: { kind: "vertex", order: index + 1 },
    geometry: { type: "Point", coordinates: point },
  }));
  if (points.length >= 2) {
    features.push({
      type: "Feature",
      properties: { kind: "edge" },
      geometry: { type: "LineString", coordinates: points },
    });
  }
  if (points.length >= 3) {
    features.push({
      type: "Feature",
      properties: { kind: "polygon" },
      geometry: { type: "Polygon", coordinates: [[...points, points[0]]] },
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

export function NationalMap({
  sites,
  wilayas,
  satelliteScenes = [],
  parcelBoundaries = [],
  analysisOverlay = null,
  satelliteOverlay = null,
  selectedSceneId = null,
  selectedWilaya = "",
  selectedSiteId = null,
  selectedParcelId = null,
  onSelectWilaya,
  onSelectSite,
  onSelectParcel,
  onSelectScene,
  onViewportChange,
  drawMode = false,
  draftBoundary = [],
  onDraftBoundaryChange,
  locale = "ar",
  compact = false,
  minimal = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const onSelectSiteRef = useRef(onSelectSite);
  const onSelectWilayaRef = useRef(onSelectWilaya);
  const onSelectSceneRef = useRef(onSelectScene);
  const onSelectParcelRef = useRef(onSelectParcel);
  const onViewportChangeRef = useRef(onViewportChange);
  const drawModeRef = useRef(drawMode);
  const draftBoundaryRef = useRef<Point[]>(draftBoundary);
  const onDraftBoundaryChangeRef = useRef(onDraftBoundaryChange);
  const featuresRef = useRef<SiteFeatureCollection>({ type: "FeatureCollection", features: [] });
  const sceneFeaturesRef = useRef({ type: "FeatureCollection", features: [] as unknown[] });
  const parcelFeaturesRef = useRef({ type: "FeatureCollection", features: [] as ParcelBoundaryFeature[] });
  const analysisOverlayRef = useRef<AnalysisRasterOverlay | null>(analysisOverlay);
  const satelliteOverlayRef = useRef<SatelliteRasterOverlay | null>(satelliteOverlay);
  const [engineState, setEngineState] = useState<"loading" | "ready" | "error">("loading");
  const [baseMode, setBaseMode] = useState<"map" | "dark" | "relief" | "satellite">("map");
  const [layerMenuOpen, setLayerMenuOpen] = useState(false);
  const [layers, setLayers] = useState({ parcels: true, scenes: true, sites: true, analysis: true });

  onSelectSiteRef.current = onSelectSite;
  onSelectWilayaRef.current = onSelectWilaya;
  onSelectSceneRef.current = onSelectScene;
  onSelectParcelRef.current = onSelectParcel;
  onViewportChangeRef.current = onViewportChange;
  drawModeRef.current = drawMode;
  draftBoundaryRef.current = draftBoundary;
  onDraftBoundaryChangeRef.current = onDraftBoundaryChange;
  analysisOverlayRef.current = analysisOverlay;
  satelliteOverlayRef.current = satelliteOverlay;

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
    features: parcelBoundaries.map((feature) => ({
      ...feature,
      properties: {
        ...feature.properties,
        selected: feature.id === selectedParcelId,
      },
    })),
  }), [parcelBoundaries, selectedParcelId]);
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
        mapMode: "Carte", darkMode: "Sombre", reliefMode: "Relief", satelliteMode: "Sentinel", layers: "Calques",
        noSatellite: "Lancez une analyse Sentinel pour charger l’image RGB de la parcelle.",
        traffic: "Trafic", trafficUnavailable: "Nécessite un fournisseur de trafic temps réel configuré.",
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
          mapMode: "Map", darkMode: "Dark", reliefMode: "Relief", satelliteMode: "Sentinel", layers: "Layers",
          noSatellite: "Run a Sentinel analysis to load the parcel RGB image.",
          traffic: "Traffic", trafficUnavailable: "Requires a configured real-time traffic provider.",
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
          mapMode: "خريطة", darkMode: "داكن", reliefMode: "تضاريس", satelliteMode: "Sentinel", layers: "طبقات",
          noSatellite: "شغّل تحليل Sentinel لتحميل صورة RGB الحقيقية للقطعة.",
          traffic: "المرور", trafficUnavailable: "يحتاج مزود حركة مرور حي مهيأ.",
        };

  useEffect(() => {
    let cancelled = false;
    setEngineState("loading");
    let map: MapInstance | null = null;
    let loadTimeout: number | null = null;

    const boot = async () => {
      try {
        const module = await import(/* @vite-ignore */ MAPLIBRE_MODULE_URL) as unknown as MapLibreModule;
        if (cancelled || !containerRef.current) return;

        module.setWorkerUrl?.(MAPLIBRE_WORKER_URL);
        map = new module.Map({
          container: containerRef.current,
          style: OPENFREEMAP_STYLES[baseMode],
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

        loadTimeout = window.setTimeout(() => {
          if (!cancelled) setEngineState((state) => state === "ready" ? state : "error");
        }, 15_000);

        map.on("load", () => {
          if (cancelled || !map) return;
          if (loadTimeout !== null) window.clearTimeout(loadTimeout);

          if (baseMode === "relief") {
            map.addSource("terrain-dem", { type: "raster-dem", url: MAPTERHORN_TERRAIN, tileSize: 512 });
            map.addLayer({
              id: "terrain-hillshade",
              type: "hillshade",
              source: "terrain-dem",
              paint: { "hillshade-exaggeration": 0.42, "hillshade-shadow-color": "#26382f" },
            });
            map.setTerrain({ source: "terrain-dem", exaggeration: 1.25 });
          }

          const initialSatellite = satelliteOverlayRef.current;
          map.addSource("sentinel-rgb-overlay", {
            type: "image",
            url: initialSatellite?.url ?? TRANSPARENT_PIXEL,
            coordinates: overlayCoordinates(initialSatellite?.bbox ?? [-8.8, 18.4, 12.2, 37.5]),
          });
          map.addLayer({
            id: "sentinel-rgb-overlay",
            type: "raster",
            source: "sentinel-rgb-overlay",
            paint: {
              "raster-opacity": baseMode === "satellite" && initialSatellite ? 1 : 0,
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
              "fill-color": ["case", ["boolean", ["get", "selected"], false], "#f0b75d", "#178568"],
              "fill-opacity": ["case", ["boolean", ["get", "selected"], false], 0.34, 0.17],
            },
          });
          map.addLayer({
            id: "agri-parcel-outline",
            type: "line",
            source: "agri-parcel-boundaries",
            paint: {
              "line-color": ["case", ["boolean", ["get", "selected"], false], "#d97706", "#0f6f56"],
              "line-width": ["case", ["boolean", ["get", "selected"], false], 3.6, 2.2],
              "line-opacity": 0.92,
            },
          });

          map.addSource("field-draft", {
            type: "geojson",
            data: draftCollection(draftBoundaryRef.current),
          });
          map.addLayer({
            id: "field-draft-fill",
            type: "fill",
            source: "field-draft",
            filter: ["==", ["geometry-type"], "Polygon"],
            paint: { "fill-color": "#f59e0b", "fill-opacity": 0.22 },
          });
          map.addLayer({
            id: "field-draft-line",
            type: "line",
            source: "field-draft",
            filter: ["in", ["geometry-type"], ["literal", ["LineString", "Polygon"]]],
            paint: { "line-color": "#d97706", "line-width": 3.2, "line-dasharray": [1.4, 1] },
          });
          map.addLayer({
            id: "field-draft-points",
            type: "circle",
            source: "field-draft",
            filter: ["==", ["geometry-type"], "Point"],
            paint: {
              "circle-radius": 5.5,
              "circle-color": "#f59e0b",
              "circle-stroke-color": "#ffffff",
              "circle-stroke-width": 2,
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

          map.on("click", (event) => {
            if (!drawModeRef.current || !event.lngLat || !onDraftBoundaryChangeRef.current) return;
            if (draftBoundaryRef.current.length >= 500) return;
            const next: Point = [
              Number(event.lngLat.lng.toFixed(8)),
              Number(event.lngLat.lat.toFixed(8)),
            ];
            onDraftBoundaryChangeRef.current([...draftBoundaryRef.current, next]);
          });

          map.on("mouseenter", "satellite-scenes-fill", () => {
            if (map && onSelectSceneRef.current && !drawModeRef.current) map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "satellite-scenes-fill", () => {
            if (map) map.getCanvas().style.cursor = "";
          });
          map.on("click", "satellite-scenes-fill", (event) => {
            if (drawModeRef.current) return;
            const sceneId = String(event.features?.[0]?.properties?.sceneId ?? "");
            if (sceneId && onSelectSceneRef.current) onSelectSceneRef.current(sceneId);
          });

          map.on("mouseenter", "agri-parcel-fill", () => {
            if (map && onSelectParcelRef.current) map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "agri-parcel-fill", () => {
            if (map) map.getCanvas().style.cursor = "";
          });
          map.on("click", "agri-parcel-fill", (event) => {
            if (drawModeRef.current) return;
            const parcelId = Number(event.features?.[0]?.properties?.id);
            if (Number.isFinite(parcelId) && onSelectParcelRef.current) onSelectParcelRef.current(parcelId);
          });

          map.on("mouseenter", "foggara-sites", () => {
            if (map && (onSelectSiteRef.current || onSelectWilayaRef.current)) map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "foggara-sites", () => {
            if (map) map.getCanvas().style.cursor = "";
          });
          map.on("click", "foggara-sites", (event) => {
            if (drawModeRef.current) return;
            const properties = event.features?.[0]?.properties;
            const siteId = Number(properties?.siteId);
            const code = String(properties?.wilayaCode ?? "");
            if (Number.isFinite(siteId) && onSelectSiteRef.current) onSelectSiteRef.current(siteId);
            else if (code && onSelectWilayaRef.current) onSelectWilayaRef.current(code);
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
  }, [compact, baseMode]);

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
    const source = mapRef.current?.getSource("field-draft");
    if (isGeoJsonSource(source)) source.setData(draftCollection(draftBoundary));
    const canvas = mapRef.current?.getCanvas();
    if (canvas) canvas.style.cursor = drawMode ? "crosshair" : "";
  }, [draftBoundary, drawMode]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("sentinel-rgb-overlay");
    if (!map || !isImageSource(source)) return;
    const bbox: [number, number, number, number] = satelliteOverlay?.bbox ?? [-8.8, 18.4, 12.2, 37.5];
    source.updateImage({
      url: satelliteOverlay?.url ?? TRANSPARENT_PIXEL,
      coordinates: overlayCoordinates(bbox),
    });
    map.setPaintProperty("sentinel-rgb-overlay", "raster-opacity", baseMode === "satellite" && satelliteOverlay ? 1 : 0);
  }, [baseMode, satelliteOverlay]);

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
    if (!map || engineState !== "ready") return;

    const selectedParcel = parcelBoundaries.find((feature) => feature.id === selectedParcelId);
    const rawRing = selectedParcel?.geometry?.coordinates;
    const parcelPoints: Point[] = Array.isArray(rawRing) && Array.isArray(rawRing[0])
      ? (rawRing[0] as unknown[]).filter((value): value is number[] =>
          Array.isArray(value) && value.length >= 2
          && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))
        ).map((value) => [Number(value[0]), Number(value[1])])
      : [];
    const parcelBounds = boundsFor(parcelPoints);
    if (parcelBounds) {
      map.fitBounds(parcelBounds, {
        padding: compact ? 26 : 72,
        maxZoom: compact ? 15 : 17,
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
  }, [compact, engineState, parcelBoundaries, plotted, selectedParcelId, selectedSiteId, selectedWilaya]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || engineState !== "ready") return;
    for (const [id, visible] of [
      ["agri-parcel-fill", layers.parcels],
      ["agri-parcel-outline", layers.parcels],
      ["satellite-scenes-fill", layers.scenes],
      ["satellite-scenes-outline", layers.scenes],
      ["foggara-site-halo", layers.sites],
      ["foggara-sites", layers.sites],
    ] as const) {
      map.setLayoutProperty(id, "visibility", visible ? "visible" : "none");
    }
    map.setPaintProperty("analysis-overlay", "raster-opacity", layers.analysis && analysisOverlay ? 0.78 : 0);
  }, [analysisOverlay, baseMode, engineState, layers]);

  return (
    <section className={`fg-national-map ${compact ? "compact" : ""} ${minimal ? "minimal" : ""}`} aria-label={labels.title}>
      {!minimal && <div className="fg-national-map-head">
        <div>
          <span className="fg-map-kicker">ALGERIA · {wilayas.length || 69} WILAYAS</span>
          <h2>{labels.title}</h2>
        </div>
        <div className="fg-map-head-meta">
          <span>{labels.source}</span>
          <strong>{plotted.length} {labels.sites} · {parcelBoundaries.length} {labels.parcels} · {satelliteScenes.length} {labels.scenes}</strong>
        </div>
      </div>}

      <div className="fg-national-map-canvas">
        <div className="fg-map-mode-switcher" role="toolbar" aria-label={labels.layers}>
          {([
            ["map", labels.mapMode],
            ["dark", labels.darkMode],
            ["relief", labels.reliefMode],
            ["satellite", labels.satelliteMode],
          ] as const).map(([mode,label]) => (
            <button
              type="button"
              key={mode}
              className={baseMode === mode ? "active" : ""}
              onClick={() => setBaseMode(mode)}
              title={mode === "satellite" && !satelliteOverlay ? labels.noSatellite : label}
            >{label}</button>
          ))}
          <button type="button" className={layerMenuOpen ? "active" : ""} onClick={() => setLayerMenuOpen(v => !v)}>{labels.layers}</button>
        </div>
        {layerMenuOpen ? <div className="fg-map-layer-menu">
          {([
            ["parcels", labels.parcels],
            ["scenes", labels.scenes],
            ["sites", labels.sites],
            ["analysis", analysisOverlay ? analysisOverlay.index.toUpperCase() : "NDVI / LSWI"],
          ] as const).map(([key,label]) => <label key={key}><input type="checkbox" checked={layers[key]} onChange={e => setLayers(prev => ({...prev,[key]:e.target.checked}))}/><span>{label}</span></label>)}
          <div className="fg-map-traffic-disabled" title={labels.trafficUnavailable}><span>{labels.traffic}</span><small>{labels.trafficUnavailable}</small></div>
        </div> : null}
        {baseMode === "satellite" && !satelliteOverlay ? <div className="fg-map-satellite-hint">{labels.noSatellite}</div> : null}
        <div ref={containerRef} className="fg-maplibre-host" role="application" aria-label={labels.title} />
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

      {!minimal && <div className="fg-national-map-foot">
        <span><i className="fg-map-legend-dot" /> {labels.sites}</span>
        <span><i className="fg-map-legend-dot" style={{ background: "#178568" }} /> {labels.parcels}</span>
        <span><i className="fg-map-legend-dot" style={{ background: "#0ea5e9" }} /> {labels.scenes}</span>
        {analysisOverlay ? <span className="font-semibold uppercase">{analysisOverlay.index} · COMPUTED</span> : null}
        <small>{labels.note}</small>
      </div>}
    </section>
  );
}
