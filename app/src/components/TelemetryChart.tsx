import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { TelemetryReading } from "@/types";

/**
 * مخطط سلسلة زمنية SVG خفيف (Phase 04 §9) — بلا أي اعتمادية رسوم.
 * يميّز القراءات المرصودة عن المحاكاة لونًا وشكلًا، ويعرض الوحدة والطوابع الزمنية.
 */
const W = 640;
const H = 200;
const PAD = { top: 14, right: 16, bottom: 30, left: 52 };

export function TelemetryChart({
  readings,
  unit,
}: {
  readings: TelemetryReading[];
  unit: string;
}) {
  const { t } = useTranslation();

  const { points, yMin, yMax, tMin, tMax } = useMemo(() => {
    const valid = readings
      .filter((r) => r.value !== null)
      .map((r) => ({ t: new Date(r.observed_at).getTime(), v: r.value as number, sim: r.simulation_run_id !== null }))
      .sort((a, b) => a.t - b.t);
    if (valid.length === 0) {
      return { points: [], yMin: 0, yMax: 0, tMin: 0, tMax: 0 };
    }
    const vs = valid.map((p) => p.v);
    const ts = valid.map((p) => p.t);
    let lo = Math.min(...vs);
    let hi = Math.max(...vs);
    if (lo === hi) { lo -= 1; hi += 1; }
    const pad = (hi - lo) * 0.08;
    return { points: valid, yMin: lo - pad, yMax: hi + pad, tMin: Math.min(...ts), tMax: Math.max(...ts) };
  }, [readings]);

  if (points.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("chart.empty")}</p>;
  }

  const x = (tv: number) =>
    PAD.left + (tMax === tMin ? 0.5 : (tv - tMin) / (tMax - tMin)) * (W - PAD.left - PAD.right);
  const y = (vv: number) =>
    PAD.top + (1 - (vv - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);

  const observed = points.filter((p) => !p.sim);
  const simulated = points.filter((p) => p.sim);
  const line = (pts: typeof points) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");

  const fmtTick = (tv: number) =>
    new Date(tv).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-52 w-full" role="img"
           aria-label={`${t("chart.title")} (${unit})`}>
        {/* محاور */}
        <line x1={PAD.left} y1={H - PAD.bottom} x2={W - PAD.right} y2={H - PAD.bottom}
              stroke="var(--ink)" strokeOpacity="0.3" />
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={H - PAD.bottom}
              stroke="var(--ink)" strokeOpacity="0.3" />
        {/* شرائح Y */}
        {[0, 0.5, 1].map((f) => {
          const vv = yMin + f * (yMax - yMin);
          const yy = y(vv);
          return (
            <g key={f}>
              <line x1={PAD.left} y1={yy} x2={W - PAD.right} y2={yy}
                    stroke="var(--ink)" strokeOpacity="0.08" />
              <text x={PAD.left - 6} y={yy + 3.5} textAnchor="end" fontSize="10"
                    fill="var(--ink)" fillOpacity="0.65">
                {Number(vv.toFixed(2))}
              </text>
            </g>
          );
        })}
        {/* طابعا زمنيان (بداية/نهاية) */}
        <text x={PAD.left} y={H - 8} textAnchor="start" fontSize="10" fill="var(--ink)" fillOpacity="0.65">
          {fmtTick(tMin)}
        </text>
        <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize="10" fill="var(--ink)" fillOpacity="0.65">
          {fmtTick(tMax)}
        </text>
        <text x={PAD.left} y={PAD.top - 4} fontSize="10" fontWeight="bold" fill="var(--ink)" fillOpacity="0.75">
          {unit}
        </text>
        {/* الخطوط: مرصود متصل / محاكى متقطع */}
        {observed.length > 1 && (
          <path d={line(observed)} fill="none" stroke="var(--oasis-strong)" strokeWidth="2" />
        )}
        {simulated.length > 1 && (
          <path d={line(simulated)} fill="none" stroke="var(--signal)" strokeWidth="1.6"
                strokeDasharray="5 4" opacity="0.8" />
        )}
        {/* النقاط: دائرة=مرصود، معيّن=محاكى */}
        {observed.map((p, i) => (
          <circle key={`o${i}`} cx={x(p.t)} cy={y(p.v)} r="3" fill="var(--oasis-strong)" />
        ))}
        {simulated.map((p, i) => (
          <rect key={`s${i}`} x={x(p.t) - 2.6} y={y(p.v) - 2.6} width="5.2" height="5.2"
                fill="var(--signal)" transform={`rotate(45 ${x(p.t)} ${y(p.v)})`} />
        ))}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-oasis-strong" aria-hidden="true" />
          {t("chart.observed")} ({observed.length})
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rotate-45 bg-signal" aria-hidden="true" />
          {t("chart.simulated")} ({simulated.length})
        </span>
        <span>{points.length} {t("chart.points")}</span>
      </div>
    </div>
  );
}
