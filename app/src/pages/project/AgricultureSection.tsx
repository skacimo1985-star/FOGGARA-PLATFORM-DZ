import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CloudSun, Leaf, Satellite, Sprout } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/useAuth";
import type { Evidence } from "@/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/common";
import { ProvenanceBadge, type ProvenanceClass } from "@/components/ProvenanceBadge";

interface AgriRecord { id: number; kind: string; source: string; observed_at: string; evidence_id: number; content: Record<string, unknown>; provenance: string; }
const services = ["soil", "moisture", "crop", "weather", "forewarning", "diagnosis", "irrigation", "calendar", "lswi"];
const fields: Record<string, string[]> = {
  satellite: ["product_id", "red", "nir", "swir1", "common_resolution_m"],
  soil: ["sample_id", "method", "nitrogen_mg_kg", "phosphorus_mg_kg", "potassium_mg_kg", "soc_g_kg", "ph", "moisture_percent"],
  weather: ["model_name", "latitude", "longitude"],
  irrigation: ["crop", "eto_mm_day", "kc", "effective_rain_mm", "area_ha", "efficiency", "kc_source"],
  calendar: ["crop", "location"],
  diagnosis: ["crop", "observation", "conclusion"],
  forewarning: ["crop", "observation", "conclusion"],
};
const numeric = new Set(["red", "nir", "swir1", "common_resolution_m", "nitrogen_mg_kg", "phosphorus_mg_kg", "potassium_mg_kg", "soc_g_kg", "ph", "moisture_percent", "latitude", "longitude", "eto_mm_day", "kc", "effective_rain_mm", "area_ha", "efficiency"]);
const soilOptional = new Set(["nitrogen_mg_kg", "phosphorus_mg_kg", "potassium_mg_kg", "soc_g_kg", "ph", "moisture_percent"]);
const displayKeys = ["ndvi", "lswi", "quality", "nitrogen_mg_kg", "phosphorus_mg_kg", "potassium_mg_kg", "soc_g_kg", "ph", "moisture_percent", "sample_id", "method", "crop", "location", "conclusion", "etc_mm_day", "net_mm_day", "gross_mm_day", "volume_m3_day", "product_id", "common_resolution_m"];

export function AgricultureSection({ projectId, evidences }: { projectId: number; evidences: Evidence[] }) {
  const { t, i18n } = useTranslation(); const { user } = useAuth(); const [records, setRecords] = useState<AgriRecord[]>([]);
  const [kind, setKind] = useState("soil"); const [dayCount, setDayCount] = useState(1); const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => { const result = await api.get<{ records: AgriRecord[] }>(`/projects/${projectId}/agriculture`); setRecords(result.records); }, [projectId]);
  useEffect(() => { reload().catch(setError); }, [reload]);
  const types = user?.role === "reviewer" || user?.role === "admin" ? Object.keys(fields) : Object.keys(fields).filter(k => k !== "diagnosis" && k !== "forewarning");
  function serviceAvailable(service: string) {
    if (service === "soil") return records.some(r => r.kind === "soil");
    if (service === "moisture") return records.some(r => r.kind === "soil" && r.content.moisture_percent != null);
    if (service === "crop" || service === "lswi") return records.some(r => r.kind === "satellite" && r.content[service === "crop" ? "ndvi" : "lswi"] != null);
    return records.some(r => r.kind === service);
  }
  return <div className="space-y-6"><div className="rounded-2xl border bg-paper p-5"><h2 className="flex items-center gap-2 text-xl font-semibold"><Satellite size={22} />{t("agri.title")}</h2><p className="mt-3 text-sm text-muted-foreground">{t("agri.subtitle")}</p><p className="mt-2 text-xs text-muted-foreground">{t("agri.liveNotice")}</p></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{services.map((service, i) => { const Icon = [Sprout, Leaf, Satellite, CloudSun][i % 4]; return <article key={service} className="rounded-xl border p-4 space-y-2"><Icon size={18} className="text-oasis-strong" /><h3 className="text-sm font-semibold">{t(`agri.services.${service}`)}</h3><p className="text-xs text-muted-foreground">{t(serviceAvailable(service) ? "agri.recorded" : "agri.unavailable")}</p>{(service === "crop" || service === "lswi") && <p className="text-xs text-oasis-strong">{t("agri.complimentary")}</p>}</article>; })}</div>
    <ErrorText error={error} />
    <form className="grid gap-4 rounded-2xl border p-5 sm:grid-cols-2" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form); setBusy(true); setError(null);
      const body: Record<string, unknown> = { evidence_id: Number(fd.get("evidence_id")), source: fd.get("source"), observed_at: new Date(String(fd.get("observed_at"))).toISOString() };
      for (const field of fields[kind]) body[field] = numeric.has(field) ? fd.get(field) === "" ? null : Number(fd.get(field)) : fd.get(field);
      if (kind === "satellite") { body.cloud_free = fd.get("cloud_free") === "on"; body.same_grid = fd.get("same_grid") === "on"; }
      if (kind === "weather") body.days = Array.from({ length: dayCount }, (_, i) => ({ day: fd.get(`day-${i}`), min_c: Number(fd.get(`min-${i}`)), max_c: Number(fd.get(`max-${i}`)), rain_mm: Number(fd.get(`rain-${i}`)) }));
      if (kind === "calendar") body.events = Array.from({ length: dayCount }, (_, i) => ({ day: fd.get(`day-${i}`), activity: fd.get(`activity-${i}`) }));
      if (kind === "diagnosis" || kind === "forewarning") body.mode = kind;
      try { await api.post(`/projects/${projectId}/agriculture/${kind === "forewarning" ? "diagnosis" : kind}`, body); form.reset(); await reload(); } catch (err) { setError(err); } finally { setBusy(false); }
    }}>
      <h3 className="text-lg font-semibold sm:col-span-2">{t("agri.record")}</h3>
      <div className="space-y-1"><Label htmlFor="agri-kind">{t("agri.recordKind")}</Label><select id="agri-kind" value={kind} onChange={e => { setKind(e.target.value); setDayCount(1); }} className="w-full rounded-md border bg-background px-3 py-2 text-sm">{types.map(k => <option key={k} value={k}>{t(`agri.kinds.${k}`)}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="agri-evidence">{t("agri.sourceEvidence")}</Label><select id="agri-evidence" name="evidence_id" required className="w-full rounded-md border bg-background px-3 py-2 text-sm"><option value="">{t("rooms.chooseEvidence")}</option>{evidences.filter(e => e.status === "verified").map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="agri-source">{t("nexus.source")}</Label><Input id="agri-source" name="source" required minLength={3} maxLength={255} /></div>
      <div className="space-y-1"><Label htmlFor="agri-observed">{t("agri.observedAt")}</Label><Input id="agri-observed" name="observed_at" type="datetime-local" required /></div>
      {fields[kind].map(field => <div key={field} className="space-y-1"><Label htmlFor={`agri-${field}`}>{t(`agri.fields.${field}`)}</Label><Input id={`agri-${field}`} name={field} type={numeric.has(field) ? "number" : "text"} step={numeric.has(field) ? "any" : undefined} required={!soilOptional.has(field)} maxLength={3000} /></div>)}
      {kind === "satellite" && <><label className="flex items-center gap-2 text-sm"><input name="cloud_free" type="checkbox" />{t("agri.cloudFree")}</label><label className="flex items-center gap-2 text-sm"><input name="same_grid" type="checkbox" />{t("agri.sameGrid")}</label><p className="text-xs text-muted-foreground sm:col-span-2">{t("agri.satelliteNotice")}</p></>}
      {(kind === "weather" || kind === "calendar") && <div className="space-y-3 sm:col-span-2">{Array.from({ length: dayCount }, (_, i) => <div key={i} className="grid gap-2 rounded-lg bg-muted/30 p-3 sm:grid-cols-4"><Input aria-label={t("agri.day")} type="date" name={`day-${i}`} required />{kind === "weather" ? <><Input aria-label={t("agri.minTemp")} type="number" step="any" name={`min-${i}`} placeholder={t("agri.minTemp")} required /><Input aria-label={t("agri.maxTemp")} type="number" step="any" name={`max-${i}`} placeholder={t("agri.maxTemp")} required /><Input aria-label={t("agri.rain")} type="number" min={0} step="any" name={`rain-${i}`} placeholder={t("agri.rain")} required /></> : <Input aria-label={t("agri.activity")} name={`activity-${i}`} placeholder={t("agri.activity")} required minLength={3} maxLength={255} className="sm:col-span-3" />}</div>)}<Button type="button" variant="outline" disabled={dayCount >= (kind === "weather" ? 15 : 50)} onClick={() => setDayCount(n => n + 1)}>{t("agri.addDay")}</Button></div>}
      {kind === "irrigation" && <p className="text-xs text-muted-foreground sm:col-span-2">{t("agri.irrigationNotice")}</p>}
      {(kind === "diagnosis" || kind === "forewarning") && <p className="text-xs text-muted-foreground sm:col-span-2">{t("agri.diagnosisNotice")}</p>}
      <Button disabled={busy || !evidences.some(e => e.status === "verified")}>{t("agri.record")}</Button>
    </form>
    <div className="space-y-4">{records.map(record => <article key={record.id} className="rounded-2xl border p-5 space-y-3"><h3 className="font-semibold">{t(`agri.kinds.${record.kind}`)} <ProvenanceBadge value={record.provenance as ProvenanceClass} /></h3><p className="text-xs text-muted-foreground">{record.source} · {new Date(record.observed_at).toLocaleString(i18n.language)} · {t("agri.sourceEvidence")} #{record.evidence_id}</p><dl className="grid gap-2 sm:grid-cols-2">{displayKeys.filter(key => record.content[key] !== undefined).map(key => <div key={key} className="rounded-md bg-muted/40 p-3"><dt className="text-xs text-muted-foreground">{t(`agri.fields.${key}`)}</dt><dd className="mt-1 text-sm font-medium">{record.content[key] == null ? t("agri.unavailable") : key === "quality" ? t(`agri.quality.${String(record.content[key])}`) : String(record.content[key])}</dd></div>)}</dl>
      {record.kind === "weather" && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="p-2 text-start">{t("agri.day")}</th><th>{t("agri.minTemp")}</th><th>{t("agri.maxTemp")}</th><th>{t("agri.rain")}</th></tr></thead><tbody>{(record.content.days as { day: string; min_c: number; max_c: number; rain_mm: number }[]).map(day => <tr key={day.day} className="border-t"><td className="p-2">{day.day}</td><td className="text-center">{day.min_c}</td><td className="text-center">{day.max_c}</td><td className="text-center">{day.rain_mm}</td></tr>)}</tbody></table></div>}
      {record.kind === "calendar" && <ul className="space-y-2">{(record.content.events as { day: string; activity: string }[]).map((event, i) => <li key={i} className="text-sm">{event.day} · {event.activity}</li>)}</ul>}
    </article>)}</div>
  </div>;
}
