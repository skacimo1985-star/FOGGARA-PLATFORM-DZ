import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Activity, Download, Printer, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { Measurement } from "@/types";
import { ErrorText, DemoBadge } from "@/components/common";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import { Skeleton } from "@/components/ui/skeleton";

const UNITS: Record<string, string[]> = {
  flow_rate: ["L/s", "m3/h"], water_level: ["m"], ph: ["pH"], temperature: ["°C"],
  turbidity: ["NTU"], pressure: ["bar", "kPa"], dissolved_oxygen: ["mg/L"],
  rainfall: ["mm"], electrical_power: ["kW"], voltage: ["V"], humidity: ["%RH"], soil_moisture: ["%"],
};

interface Series {
  project_id: number; parameter: string; unit: string; quality: string; include_demo: boolean;
  window_from: string; window_to: string; generated_at: string;
  items: Measurement[]; total: number; limit: number; truncated: boolean;
  summary: { count: number; minimum: number | null; maximum: number | null; average: number | null };
}

/** Exact time/value positions; no smoothing, predictions, or mixed-unit overlay. */
function TrendChart({ series }: { series: Series }) {
  const { t, i18n } = useTranslation();
  const points = series.items.filter(m => Number.isFinite(m.value) && Number.isFinite(Date.parse(m.measured_at)));
  if (!points.length) return null;
  const W = 760, H = 250, left = 65, right = 20, top = 20, bottom = 40;
  const times = points.map(m => Date.parse(m.measured_at));
  const minT = Math.min(...times), maxT = Math.max(...times);
  const values = points.map(m => m.value);
  const min = Math.min(...values), max = Math.max(...values);
  const padding = min === max ? Math.max(Math.abs(min) * .05, 1) : (max - min) * .1;
  const low = min - padding, high = max + padding;
  const x = (time: number) => left + (maxT === minT ? .5 : (time - minT) / (maxT - minT)) * (W - left - right);
  const y = (value: number) => top + (1 - (value - low) / (high - low)) * (H - top - bottom);
  const number = (value: number) => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }).format(value);
  const date = (time: number) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Africa/Algiers", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(time);
  const kind = (m: Measurement) => m.is_demo ? "demo" : m.quality_status === "validated" && m.verification_status === "verified" ? "verified" : "observed";
  return <figure className="an-chart" aria-label={t("trends.chartTitle")}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="measurement-chart-title" style={{ direction: "ltr" }}>
      <title id="measurement-chart-title">{t("trends.chartTitle")} — {t(`measurement.params.${series.parameter}`)} ({series.unit})</title>
      {[0, .5, 1].map(f => { const value = low + (high - low) * f; return <g key={f}>
        <line x1={left} x2={W - right} y1={y(value)} y2={y(value)} className="an-grid" />
        <text x={left - 9} y={y(value) + 4} textAnchor="end" className="an-axis">{number(value)}</text>
      </g>; })}
      <text x={left} y={H - 12} className="an-axis">{date(minT)}</text>
      <text x={W - right} y={H - 12} textAnchor="end" className="an-axis">{date(maxT)}</text>
      {points.slice(1).map((m, i) => {
        const previous = points[i];
        // Never draw a line that implies continuity between different evidence classes.
        if (kind(previous) !== kind(m)) return null;
        return <line key={`l${m.id}`} x1={x(times[i])} y1={y(previous.value)} x2={x(times[i + 1])} y2={y(m.value)} className={`an-line an-${kind(m)}`} />;
      })}
      {points.map((m, i) => <circle key={m.id} cx={x(times[i])} cy={y(m.value)} r={3.5} className={`an-point an-${kind(m)}`}>
        <title>{`#${m.id} · ${date(times[i])} · ${number(m.value)} ${m.unit} · ${m.source} · ${t(`measurement.qualityStatuses.${m.quality_status}`)}${m.is_demo ? " · DEMO" : ""}`}</title>
      </circle>)}
    </svg>
    <figcaption className="an-legend">
      <span><i className="an-dot an-verified" />{t("provenance.VERIFIED")}</span>
      <span><i className="an-dot an-observed" />{t("provenance.OBSERVED")}</span>
      {series.include_demo && <span><i className="an-dot an-demo" />DEMO</span>}
      <span>{t("trends.timezone")}</span>
    </figcaption>
  </figure>;
}

export function MeasurementTrends({ projectId, projectTitle }: { projectId: number; projectTitle: string }) {
  const { t, i18n } = useTranslation();
  const [parameter, setParameter] = useState("flow_rate");
  const [unit, setUnit] = useState("L/s");
  const [days, setDays] = useState(30);
  const [quality, setQuality] = useState("validated");
  const [includeDemo, setIncludeDemo] = useState(false);
  const [windowTo, setWindowTo] = useState(() => new Date().toISOString());
  const [result, setResult] = useState<{ key: string; data: Series } | null>(null);
  const [failure, setFailure] = useState<{ key: string; error: unknown } | null>(null);
  const [exportError, setExportError] = useState<unknown>(null);
  const [exporting, setExporting] = useState(false);
  const query = new URLSearchParams({ parameter, unit, days: String(days), quality, include_demo: String(includeDemo), window_to: windowTo, limit: "500" }).toString();
  const requestKey = `${projectId}?${query}`;
  const series = result?.key === requestKey ? result.data : null;
  const error = failure?.key === requestKey ? failure.error : null;
  useEffect(() => {
    let active = true;
    api.get<Series>(`/projects/${projectId}/measurement-series?${query}`)
      .then(data => { if (active) setResult({ key: requestKey, data }); })
      .catch(error => { if (active) setFailure({ key: requestKey, error }); });
    return () => { active = false; };
  }, [projectId, query, requestKey]);
  const fmt = (value: number | null) => value === null ? "—" : new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 4 }).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(i18n.language, { timeZone: "Africa/Algiers", dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  function printReport() {
    const records = document.querySelector<HTMLDetailsElement>(".an-records");
    const wasOpen = records?.open;
    if (records) records.open = true;
    window.addEventListener("afterprint", () => { if (records) records.open = Boolean(wasOpen); }, { once: true });
    window.print();
  }
  async function download() {
    setExporting(true); setExportError(null);
    try { await api.download(`/projects/${projectId}/measurement-series/export.csv?${query}`, `foggara-project-${projectId}-${parameter}.csv`); }
    catch (error) { setExportError(error); }
    finally { setExporting(false); }
  }
  return <section className="an-workspace" aria-labelledby="trends-title">
    <header className="an-heading">
      <div><p className="os-eyebrow">FOGGARA / WEFEH</p><h2 id="trends-title"><Activity size={23} />{t("trends.title")}</h2><p className="an-subtitle">{projectTitle}</p></div>
      <div className="an-actions an-no-print">
        <button type="button" className="os-secondary" onClick={() => setWindowTo(new Date().toISOString())}><RefreshCw size={15} />{t("trends.refresh")}</button>
        <button type="button" className="os-secondary" onClick={download} disabled={!series?.items.length || exporting}><Download size={15} />{t("trends.csv")}</button>
        <button type="button" className="os-secondary" onClick={printReport} disabled={!series}><Printer size={15} />{t("trends.print")}</button>
      </div>
    </header>
    <div className="an-filters an-no-print">
      <label>{t("measurement.parameter")}<select value={parameter} onChange={e => { setParameter(e.target.value); setUnit(UNITS[e.target.value][0]); }}>
        {Object.keys(UNITS).map(p => <option key={p} value={p}>{t(`measurement.params.${p}`)}</option>)}
      </select></label>
      <label>{t("measurement.unit")}<select value={unit} onChange={e => setUnit(e.target.value)} dir="ltr">{UNITS[parameter].map(u => <option key={u}>{u}</option>)}</select></label>
      <label>{t("analytics.window")}<select value={days} onChange={e => setDays(Number(e.target.value))}>{[7, 30, 90, 365].map(n => <option key={n} value={n}>{t("trends.days", { count: n })}</option>)}</select></label>
      <label>{t("measurement.quality")}<select value={quality} onChange={e => setQuality(e.target.value)}>
        <option value="validated">{t("trends.reviewedOnly")}</option><option value="pending">{t("trends.pendingOnly")}</option><option value="all">{t("trends.allAccepted")}</option>
      </select></label>
      <label className="an-checkbox"><input type="checkbox" checked={includeDemo} onChange={e => setIncludeDemo(e.target.checked)} />{t("trends.includeDemo")}</label>
    </div>
    <ErrorText error={error} /><ErrorText error={exportError} />
    {!series && !error && <div role="status"><span className="sr-only">{t("common.loading")}</span><Skeleton className="h-64 w-full" /></div>}
    {series && <>
      <p className="an-scope">{t(`measurement.params.${parameter}`)} · <b dir="ltr">{series.unit}</b> · {t(quality === "validated" ? "trends.reviewedOnly" : quality === "pending" ? "trends.pendingOnly" : "trends.allAccepted")}
        <br />{date(series.window_from)} → {date(series.window_to)} · {t("trends.timezone")}{includeDemo && " · DEMO"}</p>
      <div className="an-stats">{[
        ["count", series.summary.count], ["average", series.summary.average], ["minimum", series.summary.minimum], ["maximum", series.summary.maximum],
      ].map(([label, value]) => <article key={label}><span>{t(`trends.${label}`)}</span><strong dir="ltr">{fmt(value as number | null)}{label !== "count" && <small>{series.unit}</small>}</strong></article>)}</div>
      <p className="an-note"><ShieldCheck size={16} />{t("trends.basis")}</p>
      {includeDemo && <p className="an-warning" role="status">{t("trends.demoWarning")}</p>}
      {series.truncated && <p className="an-warning" role="status">{t("trends.truncated", { shown: series.items.length, total: series.total })}</p>}
      {series.items.length ? <>
        <TrendChart series={series} />
        <details className="an-records"><summary>{t("trends.records", { count: series.items.length })}</summary>
          <div className="an-table-scroll"><table><caption className="sr-only">{t("trends.records", { count: series.items.length })}</caption><thead><tr>
            <th scope="col">ID</th><th scope="col">{t("measurement.measuredAt")}</th><th scope="col">{t("measurement.value")}</th><th scope="col">{t("measurement.source")}</th><th scope="col">{t("measurement.method")}</th><th scope="col">{t("measurement.verification")}</th>
          </tr></thead><tbody>{series.items.map(m => <tr key={m.id}><td>#{m.id}</td><td>{date(m.measured_at)}</td><td dir="ltr">{fmt(m.value)} {m.unit}</td><td>{m.source}</td><td>{m.method}</td><td>
            <ProvenanceBadge kind={m.quality_status === "validated" && m.verification_status === "verified" ? "VERIFIED" : "OBSERVED"} /><DemoBadge show={m.is_demo} />
          </td></tr>)}</tbody></table></div>
        </details>
      </> : <div className="an-empty"><Activity size={30} /><h3>{t("trends.emptyTitle")}</h3><p>{t("trends.emptyBody")}</p><Link to={`/app/projects/${projectId}`} className="os-primary an-no-print">{t("measurement.add")}</Link></div>}
      <p className="an-note">{t("trends.generatedAt")}: {date(series.generated_at)}</p>
    </>}
  </section>;
}
