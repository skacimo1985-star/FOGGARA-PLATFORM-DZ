import { useEffect, useMemo, useRef, useState } from "react";
import type { GisSite, WilayaMeta } from "@/types";

type Props = {
  sites: GisSite[];
  wilayas: WilayaMeta[];
  selectedWilaya?: string;
  selectedSiteId?: number | null;
  onSelectWilaya?: (code: string) => void;
  onSelectSite?: (siteId: number) => void;
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
  setData: (data: SiteFeatureCollection) => void;
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
  fitBounds: (bounds: [Point, Point], options?: Record<string, unknown>) => void;
  flyTo: (options: Record<string, unknown>) => void;
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
  selectedWilaya = "",
  selectedSiteId = null,
  onSelectWilaya,
  onSelectSite,
  locale = "ar",
  compact = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const onSelectSiteRef = useRef(onSelectSite);
  const onSelectWilayaRef = useRef(onSelectWilaya);
  const featuresRef = useRef<SiteFeatureCollection>({ type: "FeatureCollection", features: [] });
  const [engineState, setEngineState] = useState<"loading" | "ready" | "error">("loading");

  onSelectSiteRef.current = onSelectSite;
  onSelectWilayaRef.current = onSelectWilaya;

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

  const labels = locale === "fr"
    ? {
        title: "Carte opérationnelle nationale",
        sites: "sites",
        loading: "Chargement de la carte ouverte…",
        unavailable: "Fond cartographique momentanément indisponible",
        unavailableNote: "Les données FOGGARA restent accessibles dans le registre spatial ci-dessous.",
        note: "Fond OpenStreetMap via OpenFreeMap · points issus des coordonnées enregistrées",
        source: "Open map",
      }
    : locale === "en"
      ? {
          title: "National operational map",
          sites: "sites",
          loading: "Loading open map…",
          unavailable: "Basemap temporarily unavailable",
          unavailableNote: "FOGGARA data remains available in the spatial register below.",
          note: "OpenStreetMap basemap via OpenFreeMap · points use stored coordinates",
          source: "Open map",
        }
      : {
          title: "الخريطة التشغيلية الوطنية",
          sites: "مواقع",
          loading: "جارٍ تحميل الخريطة المفتوحة…",
          unavailable: "الخريطة الأساسية غير متاحة مؤقتًا",
          unavailableNote: "تبقى بيانات FOGGARA متاحة في السجل المكاني أسفل الخريطة.",
          note: "خريطة OpenStreetMap عبر OpenFreeMap · النقاط من الإحداثيات المسجلة",
          source: "خريطة مفتوحة",
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

          map.fitBounds(ALGERIA_BOUNDS, { padding: compact ? 18 : 34, duration: 0 });
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
          <strong>{plotted.length} {labels.sites}</strong>
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
        <small>{labels.note}</small>
      </div>
    </section>
  );
}
