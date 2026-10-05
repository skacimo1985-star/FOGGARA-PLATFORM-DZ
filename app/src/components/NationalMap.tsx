import { useMemo } from "react";
import type { GisSite, WilayaMeta } from "@/types";

type Props = {
  sites: GisSite[];
  wilayas: WilayaMeta[];
  selectedWilaya?: string;
  onSelectWilaya?: (code: string) => void;
  locale?: string;
  compact?: boolean;
};

const BOUNDS = { minLon: -8.8, maxLon: 12.2, minLat: 18.4, maxLat: 37.5 };

// Schematic national outline used only as an offline operational plotting surface.
// Site positions themselves are projected from their stored coordinates.
const OUTLINE: [number, number][] = [
  [-8.65, 27.7], [-8.45, 29.0], [-6.2, 31.2], [-3.2, 34.5],
  [-1.9, 35.3], [0.2, 36.7], [2.8, 36.9], [5.0, 36.4],
  [7.7, 36.9], [8.65, 36.1], [8.6, 34.0], [10.2, 32.2],
  [11.9, 31.8], [11.8, 25.0], [9.4, 21.1], [6.0, 19.0],
  [2.3, 19.8], [-0.8, 21.3], [-4.5, 24.4], [-8.65, 27.7],
];

function project(lon: number, lat: number) {
  const x = ((lon - BOUNDS.minLon) / (BOUNDS.maxLon - BOUNDS.minLon)) * 100;
  const y = 100 - ((lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 100;
  return { x, y };
}

function wilayaCode(siteWilaya: string, wilayas: WilayaMeta[]) {
  const normalized = siteWilaya.trim().toLocaleLowerCase();
  return wilayas.find((w) =>
    [w.code, w.ar, w.fr, w.en].some((name) => name.trim().toLocaleLowerCase() === normalized)
  )?.code ?? "";
}

export function NationalMap({
  sites,
  wilayas,
  selectedWilaya = "",
  onSelectWilaya,
  locale = "ar",
  compact = false,
}: Props) {
  const outline = useMemo(
    () => OUTLINE.map(([lon, lat]) => {
      const p = project(lon, lat);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)}`;
    }).join(" "),
    [],
  );

  const plotted = useMemo(
    () => sites
      .filter((g) => Number.isFinite(g.site.lat) && Number.isFinite(g.site.lon))
      .map((g) => ({
        ...g,
        code: wilayaCode(g.site.wilaya, wilayas),
        point: project(g.site.lon, g.site.lat),
      })),
    [sites, wilayas],
  );

  const labels = locale === "fr"
    ? { title: "Carte opérationnelle nationale", sites: "sites", note: "Points issus des coordonnées enregistrées · contour schématique hors limites administratives" }
    : locale === "en"
      ? { title: "National operational map", sites: "sites", note: "Points use stored coordinates · schematic outline, not administrative boundaries" }
      : { title: "الخريطة التشغيلية الوطنية", sites: "مواقع", note: "النقاط من الإحداثيات المسجلة · المحيط تخطيطي وليس حدودًا إدارية" };

  return (
    <section className={`fg-national-map ${compact ? "compact" : ""}`} aria-label={labels.title}>
      <div className="fg-national-map-head">
        <div>
          <span className="fg-map-kicker">ALGERIA · 58 WILAYAS</span>
          <h2>{labels.title}</h2>
        </div>
        <strong>{plotted.length} {labels.sites}</strong>
      </div>
      <div className="fg-national-map-canvas">
        <svg viewBox="0 0 100 100" role="img" aria-label={labels.title}>
          <defs>
            <linearGradient id="fg-map-fill" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity=".18" />
              <stop offset="100%" stopColor="currentColor" stopOpacity=".04" />
            </linearGradient>
            <filter id="fg-dot-glow">
              <feGaussianBlur stdDeviation=".55" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>
          <polyline className="fg-algeria-outline" points={outline} />
          <g className="fg-map-grid">
            {[20, 40, 60, 80].map((n) => <line key={`v-${n}`} x1={n} y1="10" x2={n} y2="92" />)}
            {[25, 45, 65, 85].map((n) => <line key={`h-${n}`} x1="8" y1={n} x2="94" y2={n} />)}
          </g>
          {plotted.map((g) => {
            const selected = !!selectedWilaya && g.code === selectedWilaya;
            const intensity = Math.min(4, g.projects.length + g.resources.length + g.assets.length);
            return (
              <g
                key={g.site.id}
                className={`fg-map-site ${selected ? "selected" : ""}`}
                transform={`translate(${g.point.x} ${g.point.y})`}
                onClick={() => g.code && onSelectWilaya?.(g.code)}
                role={onSelectWilaya ? "button" : undefined}
                tabIndex={onSelectWilaya ? 0 : undefined}
                onKeyDown={(e) => {
                  if (onSelectWilaya && g.code && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    onSelectWilaya(g.code);
                  }
                }}
              >
                <title>{g.site.name} · {g.site.wilaya} · {g.projects.length} project(s)</title>
                <circle className="fg-map-pulse" r={selected ? 3.2 : 2.1 + intensity * .12} />
                <circle className="fg-map-dot" r={selected ? 1.55 : 1.05 + intensity * .08} />
              </g>
            );
          })}
        </svg>
      </div>
      <div className="fg-national-map-foot">
        <span><i className="fg-map-legend-dot" /> {labels.sites}</span>
        <small>{labels.note}</small>
      </div>
    </section>
  );
}
