import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { Droplets, Zap, Sprout, Leaf, HeartPulse } from "lucide-react";
import { api } from "@/lib/api";
import type { Project } from "@/types";
import type { NexusResource } from "@/types/platform";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ErrorText, DemoBadge } from "@/components/common";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";

const domains = ["water", "energy", "food", "ecosystem", "health"] as const;
const icons = [Droplets, Zap, Sprout, Leaf, HeartPulse];
export default function NexusResources() {
  const { t } = useTranslation(); const [resources, setResources] = useState<NexusResource[]>([]); const [projects, setProjects] = useState<Project[]>([]);
  const [domain, setDomain] = useState<string>("water"); const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => { const [r, p] = await Promise.all([api.get<NexusResource[]>("/nexus/resources"), api.getAll<Project>("/projects")]); setResources(r); setProjects(p); }, []);
  useEffect(() => { reload().catch(setError).finally(() => setLoading(false)); }, [reload]);
  const selectClass = "w-full rounded-md border bg-background px-3 py-2 text-sm";
  return <div className="space-y-6"><div><h1 className="t-section text-ink">{t("nexus.title")}</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t("nexus.subtitle")}</p></div>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="group" aria-label={t("nexus.domains")}>{domains.map((d, i) => { const Icon = icons[i]; return <Button key={d} variant={domain === d ? "default" : "outline"} aria-pressed={domain === d} onClick={() => setDomain(d)}><Icon size={16} />{t(`domains.${d}`)}</Button>; })}</div>
    <ErrorText error={error} />
    <Card><CardHeader><CardTitle>{t("nexus.add")}</CardTitle></CardHeader><CardContent><form className="grid gap-4 sm:grid-cols-2" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form); setBusy(true); setError(null); try { await api.post("/nexus/resources", { project_id: Number(fd.get("project_id")), domain, name: fd.get("name"), kind: fd.get("kind"), quantity: fd.get("quantity"), unit: fd.get("unit"), source: fd.get("source"), provenance: fd.get("provenance") }); form.reset(); await reload(); } catch (err) { setError(err); } finally { setBusy(false); } }}>
      <div className="space-y-1"><Label htmlFor="resource-project">{t("nav.projects")}</Label><select id="resource-project" name="project_id" required className={selectClass}><option value="">{t("rooms.chooseProject")}</option>{projects.map(p => <option value={p.id} key={p.id}>{p.title}</option>)}</select></div>
      {["name", "kind", "quantity", "unit", "source"].map(field => <div className="space-y-1" key={field}><Label htmlFor={`resource-${field}`}>{t(`nexus.${field}`)}</Label><Input id={`resource-${field}`} name={field} required minLength={field === "quantity" || field === "unit" ? undefined : 2} maxLength={field === "quantity" ? 80 : field === "unit" ? 40 : field === "kind" ? 100 : 255} type={field === "quantity" ? "number" : "text"} min={field === "quantity" ? 0 : undefined} step={field === "quantity" ? "any" : undefined} /></div>)}
      <div className="space-y-1"><Label htmlFor="resource-provenance">{t("nexus.provenance")}</Label><select id="resource-provenance" name="provenance" className={selectClass}><option value="OBSERVED">{t("provenance.OBSERVED")}</option><option value="PROPOSED">{t("provenance.PROPOSED")}</option></select></div>
      <p className="text-xs text-muted-foreground sm:col-span-2">{t("nexus.quantityNotice")}</p><Button disabled={busy || projects.length === 0}>{t("nexus.add")}</Button>
    </form></CardContent></Card>
    {loading ? <p>{t("common.loading")}</p> : <div className="grid gap-4 md:grid-cols-2">{resources.filter(r => r.domain === domain).map(r => <Card key={r.id}><CardHeader><CardTitle>{r.name}<DemoBadge show={r.is_demo} /></CardTitle></CardHeader><CardContent className="space-y-3"><p className="text-2xl font-semibold text-oasis-strong" dir="auto">{r.quantity} {r.unit}</p><p className="text-sm">{r.kind}</p><p className="text-xs text-muted-foreground">{t("nexus.source")}: {r.source}</p><ProvenanceBadge value={r.provenance === "OBSERVED" ? "OBSERVED" : "PROPOSED"} /><p><Link className="text-sm text-oasis-strong" to={`/app/projects/${r.project_id}`}>{t("nexus.viewProject")}</Link></p></CardContent></Card>)}{!resources.some(r => r.domain === domain) && <p className="text-sm text-muted-foreground">{t("nexus.empty")}</p>}</div>}
  </div>;
}
