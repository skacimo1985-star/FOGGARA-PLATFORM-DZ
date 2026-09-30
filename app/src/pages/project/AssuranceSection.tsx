import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { Evidence } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ErrorText } from "@/components/common";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";

interface Check { code: string; constraint: string; passed: boolean; sources: number[]; }
interface Assessment { checks: Check[]; completed: number; total: number; rule_version: string; input_hash: string; hard_constraints_passed: boolean; }
interface Risk { id: number; title: string; likelihood: number; severity: number; score: number; mitigation: string; }
interface Chain { chain: string; totals: Record<string, string>; signals: string[]; records: { id: number; stage: string; reference: string; amount: string; amount_basis: string }[]; }
interface Graph { nodes: { id: string; type: string; title: string; provenance: string }[]; edges: { source: string; target: string; relation: string; provenance: string }[]; }
const stages = ["contract", "purchase_order", "work_order", "report", "acceptance", "variation", "invoice", "payment"];

export function AssuranceSection({ projectId, evidences }: { projectId: number; evidences: Evidence[] }) {
  const { t } = useTranslation(); const [assessment, setAssessment] = useState<Assessment | null>(null); const [risks, setRisks] = useState<Risk[]>([]); const [chains, setChains] = useState<Chain[]>([]); const [graph, setGraph] = useState<Graph | null>(null);
  const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => { const [a, r, c, g] = await Promise.all([api.get<Assessment>(`/projects/${projectId}/assessment`), api.get<Risk[]>(`/projects/${projectId}/risks`), api.get<{ chains: Chain[] }>(`/projects/${projectId}/assurance`), api.get<Graph>(`/projects/${projectId}/evidence-graph`)]); setAssessment(a); setRisks(r); setChains(c.chains); setGraph(g); }, [projectId]);
  useEffect(() => { reload().catch(setError); }, [reload]);
  async function perform(work: () => Promise<unknown>) { setBusy(true); setError(null); try { await work(); await reload(); } catch (err) { setError(err); } finally { setBusy(false); } }
  const selectClass = "w-full rounded-md border bg-background px-3 py-2 text-sm";
  return <div className="space-y-6"><ErrorText error={error} />
    <section className="rounded-2xl border p-5 space-y-4"><h2 className="text-lg font-semibold">{t("assurance.readiness")}</h2><p className="text-xs text-muted-foreground">{t("assurance.readinessNotice")}</p>
      {assessment && <><p className="text-xl font-semibold">{assessment.completed}/{assessment.total} <ProvenanceBadge value="COMPUTED" /></p><ul className="space-y-2">{assessment.checks.map(check => <li key={check.code} className="flex flex-wrap justify-between gap-2 rounded-md bg-muted/40 p-3 text-sm"><span>{t(`assurance.checks.${check.code}`)}</span><span>{t(`assurance.constraints.${check.constraint}`)} · {t(check.passed ? "assurance.passed" : "assurance.missing")} · {check.sources.map(id => `#${id}`).join(", ")}</span></li>)}</ul><details className="text-xs"><summary>{t("assurance.reproducibility")}</summary><p>{assessment.rule_version}</p><code className="break-all" dir="ltr">{assessment.input_hash}</code></details></>}
      <Button disabled={busy} onClick={() => void perform(() => api.post(`/projects/${projectId}/assessment/run`))}>{t("assurance.run")}</Button>
    </section>
    <section className="rounded-2xl border p-5 space-y-4"><h2 className="text-lg font-semibold">{t("assurance.risks")}</h2><p className="text-xs text-muted-foreground">{t("assurance.riskNotice")}</p>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form); void perform(async () => { await api.post(`/projects/${projectId}/risks`, { title: fd.get("title"), likelihood: Number(fd.get("likelihood")), severity: Number(fd.get("severity")), mitigation: fd.get("mitigation") }); form.reset(); }); }}>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="risk-title">{t("assurance.riskTitle")}</Label><Input id="risk-title" name="title" required minLength={3} maxLength={255} /></div>
        {["likelihood", "severity"].map(key => <div key={key} className="space-y-1"><Label htmlFor={`risk-${key}`}>{t(`assurance.${key}`)}</Label><Input id={`risk-${key}`} name={key} type="number" min={1} max={5} step={1} required /></div>)}
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="risk-mitigation">{t("assurance.mitigation")}</Label><Textarea id="risk-mitigation" name="mitigation" required minLength={5} maxLength={3000} /></div><Button disabled={busy}>{t("assurance.addRisk")}</Button>
      </form>
      {risks.map(r => <article key={r.id} className="rounded-xl border p-3 space-y-2"><p className="font-medium">{r.title} <ProvenanceBadge value="PROPOSED" /></p><p className="text-sm">{r.likelihood} × {r.severity} = {r.score}/25 <ProvenanceBadge value="COMPUTED" /></p><p className="text-sm text-muted-foreground">{r.mitigation}</p></article>)}
    </section>
    <section className="rounded-2xl border p-5 space-y-4"><h2 className="text-lg font-semibold">{t("assurance.commercial")}</h2><p className="text-xs text-muted-foreground">{t("assurance.commercialNotice")}</p>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form); void perform(async () => { await api.post(`/projects/${projectId}/assurance`, { chain: fd.get("chain"), stage: fd.get("stage"), reference: fd.get("reference"), amount: fd.get("amount"), amount_basis: fd.get("amount_basis"), evidence_id: Number(fd.get("evidence_id")) }); form.reset(); }); }}>
        {["chain", "reference", "amount"].map(field => <div className="space-y-1" key={field}><Label htmlFor={`assurance-${field}`}>{t(`assurance.${field}`)}</Label><Input id={`assurance-${field}`} name={field} required minLength={field === "amount" ? undefined : 2} maxLength={field === "chain" ? 100 : 255} type={field === "amount" ? "number" : "text"} min={field === "amount" ? 0 : undefined} step={field === "amount" ? "0.01" : undefined} /></div>)}
        <div className="space-y-1"><Label htmlFor="assurance-stage">{t("assurance.stage")}</Label><select id="assurance-stage" name="stage" className={selectClass}>{stages.map(stage => <option key={stage} value={stage}>{t(`assurance.stages.${stage}`)}</option>)}</select></div>
        <div className="space-y-1"><Label htmlFor="assurance-basis">{t("assurance.basis")}</Label><select id="assurance-basis" name="amount_basis" className={selectClass}><option value="gross">{t("assurance.gross")}</option><option value="net">{t("assurance.net")}</option></select></div>
        <div className="space-y-1"><Label htmlFor="assurance-evidence">{t("rooms.disclosedEvidence")}</Label><select id="assurance-evidence" name="evidence_id" className={selectClass} required><option value="">{t("rooms.chooseEvidence")}</option>{evidences.filter(e => e.status === "verified").map(e => <option key={e.id} value={e.id}>{e.title}</option>)}</select></div><Button disabled={busy || !evidences.some(e => e.status === "verified")}>{t("assurance.record")}</Button>
      </form>
      {chains.map(c => <article key={c.chain} className="rounded-xl border p-4 space-y-3"><h3 className="font-semibold">{c.chain} <ProvenanceBadge value="COMPUTED" /></h3><ul className="flex flex-wrap gap-2">{Object.entries(c.totals).map(([stage, amount]) => <li key={stage} className="rounded-md bg-muted/40 p-2 text-sm">{t(`assurance.stages.${stage}`)}: {amount} DZD</li>)}</ul><ul className="space-y-1 text-sm text-signal-strong">{c.signals.map(s => <li key={s}>{t(`assurance.signals.${s}`, s)}</li>)}</ul><details className="text-xs"><summary>{t("assurance.records")}</summary>{c.records.map(r => <p key={r.id} className="py-1">{r.reference} · {t(`assurance.stages.${r.stage}`)} · {r.amount} DZD · {t(`assurance.${r.amount_basis}`)}</p>)}</details></article>)}
    </section>
    <section className="rounded-2xl border p-5 space-y-4"><h2 className="text-lg font-semibold">{t("assurance.graph")}</h2><p className="text-xs text-muted-foreground">{t("assurance.graphNotice")}</p>
      {graph && <div className="space-y-3"><div className="grid gap-2 sm:grid-cols-2">{graph.nodes.map(n => <div key={n.id} className="rounded-lg border p-3 text-sm"><p>{n.title}</p><p className="text-xs text-muted-foreground">{t(`assurance.nodeTypes.${n.type}`)} · {n.id.split(":")[1]} · {t(`provenance.${n.provenance}`)}</p></div>)}</div><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr><th className="p-2 text-start">{t("assurance.from")}</th><th className="p-2 text-start">{t("assurance.relation")}</th><th className="p-2 text-start">{t("assurance.to")}</th></tr></thead><tbody>{graph.edges.map((edge, i) => <tr key={i} className="border-t"><td className="p-2">{t(`assurance.nodeTypes.${edge.source.split(":")[0]}`)} #{edge.source.split(":")[1]}</td><td className="p-2">{t(`assurance.relations.${edge.relation}`)}</td><td className="p-2">{t(`assurance.nodeTypes.${edge.target.split(":")[0]}`)} #{edge.target.split(":")[1]}</td></tr>)}</tbody></table></div></div>}
    </section>
  </div>;
}
