import { useEffect, useMemo, useRef, useState } from "react";
import type { GisSite, WilayaMeta } from "@/types";

export type AnalysisRasterOverlay = {
  url: string;
  bbox: [number, number, number, number];
  index: "ndvi" | "evi" | "savi" | "ndwi";
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
  analysisOverlay?: AnalysisRasterOverlay | null;
  selectedSceneId?: string | null;
  selectedWilaya?: string;
  selectedSiteId?: number | null;
  onSelectWilaya?: (code: string) => void;
  onSelectSite?: (siteId: number) => void;
  onSelectScene?: (sceneId: string) => void;
  onViewportChange?: (bbox: [number, number, number, number]) => void;
  locale?: string;
  compact?: boolean;
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
  error?: unknown;
};

type MapInstance = {
  addControl: (control: unknown, position?: string) => void;
  addSource: (id: string, source: Record<string, unknown>) => void;
  addLayer: (layer: Record<string, unknown>) => void;
  getSource: (id: string) => unknown;
  getCanvas: () => HTMLCanvasElement;
  setPaintProperty: (layerId: string, name: string, value: unknown) => void;
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
const OPENFREEMAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
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
  analysisOverlay = null,
  selectedSceneId = null,
  selectedWilaya = "",
  selectedSiteId = null,
  onSelectWilaya,
  onSelectSite,
  onSelectScene,
  onViewportChange,
  locale = "ar",
  compact = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const onSelectSiteRef = useRef(onSelectSite);
  const onSelectWilayaRef = useRef(onSelectWilaya);
  const onSelectSceneRef = useRef(onSelectScene);
  const onViewportChangeRef = useRef(onViewportChange);
  const featuresRef = useRef<SiteFeatureCollection>({ type: "FeatureCollection", features: [] });
  const sceneFeaturesRef = useRef({ type: "FeatureCollection", features: [] as unknown[] });
  const analysisOverlayRef = useRef<AnalysisRasterOverlay | null>(analysisOverlay);
  const [engineState, setEngineState] = useState<"loading" | "ready" | "error">("loading");

  onSelectSiteRef.current = onSelectSite;
  onSelectWilayaRef.current = onSelectWilaya;
  onSelectSceneRef.current = onSelectScene;
  onViewportChangeRef.current = onViewportChange;
  analysisOverlayRef.current = analysisOverlay;

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

        loadTimeout = window.setTimeout(() => {
          if (!cancelled) setEngineState((state) => state === "ready" ? state : "error");
        }, 15_000);

        map.on("load", () => {
          if (cancelled || !map) return;
          if (loadTimeout !== null) window.clearTimeout(loadTimeout);

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
            if (map) map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "satellite-scenes-fill", () => {
            if (map) map.getCanvas().style.cursor = "";
          });
          map.on("click", "satellite-scenes-fill", (event) => {
            const sceneId = String(event.features?.[0]?.properties?.sceneId ?? "");
            if (sceneId && onSelectSceneRef.current) onSelectSceneRef.current(sceneId);
          });

          map.on("mouseenter", "foggara-sites", () => {
            if (map) map.getCanvas().style.cursor = "pointer";
          });
          map.on("mouseleave", "foggara-sites", () => {
            if (map) map.getCanvas().style.cursor = "";
          });
          map.on("click", "foggara-sites", (event) => {
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
  }, [compact, engineState, plotted, selectedSiteId, selectedWilaya]);

  return (
    <section className={`fg-national-map ${compact ? "compact" : ""}`} aria-label={labels.title}>
      <div className="fg-national-map-head">
        <div>
          <span className="fg-map-kicker">ALGERIA · {wilayas.length || 69} WILAYAS</span>
          <h2>{labels.title}</h2>
        </div>
        <div className="fg-map-head-meta">
          <span>{labels.source}</span>
          <strong>{plotted.length} {labels.sites} · {satelliteScenes.length} {labels.scenes}</strong>
        </div>
      </div>

      <div className="fg-national-map-canvas">
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

      <div className="fg-national-map-foot">
        <span><i className="fg-map-legend-dot" /> {labels.sites}</span>
        <span><i className="fg-map-legend-dot" style={{ background: "#0ea5e9" }} /> {labels.scenes}</span>
        {analysisOverlay ? <span className="font-semibold uppercase">{analysisOverlay.index} · COMPUTED</span> : null}
        <small>{labels.note}</small>
      </div>
    </section>
  );
}
