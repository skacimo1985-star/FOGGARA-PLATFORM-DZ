import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Activity, CheckCircle2, FileCheck2, Gavel, PlayCircle, Send, ShieldCheck } from "lucide-react";
import { api, type Paged } from "@/lib/api";
import { useAuth } from "@/context/useAuth";
import type {
  DecisionDomain, DecisionEvidence, DecisionExecution, DecisionStatus,
  DecisionTransitionRecord, DecisionVerification, GovDecision,
} from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorText, DemoBadge, Pager } from "@/components/common";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import "./decision-intelligence.css";

// محرك القرارات العام (Contract §5..§22) — المرحلة 2
const DOMAINS: DecisionDomain[] = ["water", "energy", "food", "ecosystem", "health", "cross_domain"];
const STATUSES: DecisionStatus[] = ["PROPOSED", "REVIEW_REQUIRED", "APPROVED",
  "EXECUTION_AUTHORIZED", "EXECUTED", "VERIFIED", "CANCELLED"];
const LEVELS = ["low", "medium", "high", "critical"] as const;
const EVIDENCE_TYPES = ["measurement", "sensor", "manual_observation", "calculation",
  "rule", "model", "document", "inspection", "satellite", "expert_assessment"] as const;

// مسار الحياة للعرض الزمني (§22)
const LIFECYCLE: DecisionStatus[] = ["PROPOSED", "REVIEW_REQUIRED", "APPROVED",
  "EXECUTION_AUTHORIZED", "EXECUTED", "VERIFIED"];

// الانتقالات المتاحة لكل حالة (مرآة آلة حالات الخادم — الإنفاذ النهائي في الخادم)
const NEXT: Record<DecisionStatus, DecisionStatus[]> = {
  PROPOSED: ["REVIEW_REQUIRED", "CANCELLED"],
  REVIEW_REQUIRED: ["APPROVED", "CANCELLED"],
  APPROVED: ["EXECUTION_AUTHORIZED", "CANCELLED"],
  EXECUTION_AUTHORIZED: ["EXECUTED", "CANCELLED"],
  EXECUTED: ["VERIFIED"],
  VERIFIED: [],
  CANCELLED: [],
};

const statusVariant = (s: string) =>
  (s === "VERIFIED" || s === "APPROVED" ? "default"
    : s === "CANCELLED" ? "destructive" : "outline") as "default" | "destructive" | "outline";

export default function Decisions() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [list, setList] = useState<GovDecision[] | null>(null);
  const [selected, setSelected] = useState<GovDecision | null>(null);
  const [transitions, setTransitions] = useState<DecisionTransitionRecord[]>([]);
  const [evidence, setEvidence] = useState<DecisionEvidence[]>([]);
  const [executions, setExecutions] = useState<DecisionExecution[]>([]);
  const [verifications, setVerifications] = useState<DecisionVerification[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [filters, setFilters] = useState<{ domain: string; status: string; risk: string }>(
    { domain: "", status: "", risk: "" });

  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [statusTotals, setStatusTotals] = useState<Partial<Record<DecisionStatus, number>>>({});

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filters.domain) params.set("domain", filters.domain);
    if (filters.status) params.set("status", filters.status);
    if (filters.risk) params.set("risk_level", filters.risk);
    params.set("page", String(page));
    params.set("page_size", "20");
    const r = await api.get<Paged<GovDecision>>(`/decisions?${params.toString()}`);
    setList(r.items);
    setPages(r.pages);
  }, [filters, page]);

  const loadStatusTotals = useCallback(async () => {
    const rows = await Promise.all(
      LIFECYCLE.map(async (status) => {
        const r = await api.get<Paged<GovDecision>>(
          `/decisions?status=${status}&page=1&page_size=1`,
        );
        return [status, r.total] as const;
      }),
    );
    setStatusTotals(Object.fromEntries(rows) as Partial<Record<DecisionStatus, number>>);
  }, []);

  const loadDetail = useCallback(async (d: GovDecision) => {
    const [full, tr, ev, ex, vf] = await Promise.all([
      api.get<GovDecision>(`/decisions/${d.id}`),
      api.get<DecisionTransitionRecord[]>(`/decisions/${d.id}/transitions`),
      api.get<DecisionEvidence[]>(`/decisions/${d.id}/evidence`),
      api.get<DecisionExecution[]>(`/decisions/${d.id}/execution`),
      api.get<DecisionVerification[]>(`/decisions/${d.id}/verification`),
    ]);
    setSelected(full); setTransitions(tr); setEvidence(ev);
    setExecutions(ex); setVerifications(vf);
  }, []);

  // The request helper commits state after its asynchronous API response.
  useEffect(() => {
    (async () => {
      try { await Promise.all([load(), loadStatusTotals()]); } catch (e) { setError(e); }
    })();
  }, [load, loadStatusTotals]);

  const role = user?.role ?? "member";
  const isReviewer = role === "reviewer" || role === "admin";
  const isAdmin = role === "admin";

  // الإجراءات المعروضة حسب الدور + فصل المهام (إخفاء واجهة فقط — الإنفاذ في الخادم §21)
  const allowedActions = useMemo((): DecisionStatus[] => {
    if (!selected || !user) return [];
    const next = NEXT[selected.status];
    return next.filter((to) => {
      if (to === "APPROVED")
        return isReviewer && selected.proposed_by !== user.id; // فصل المهام §13
      if (to === "EXECUTION_AUTHORIZED" || to === "EXECUTED") return isAdmin;
      if (to === "VERIFIED") return isReviewer;
      if (to === "CANCELLED")
        return isReviewer || selected.proposed_by === user.id;
      return true; // REVIEW_REQUIRED — الإحالة للمراجعة
    });
  }, [selected, user, isReviewer, isAdmin]);

  const doTransition = async (to: DecisionStatus) => {
    if (!selected) return;
    setError(null);
    try {
      const updated = await api.post<GovDecision>(`/decisions/${selected.id}/transition`, { to });
      await loadDetail(updated);
      await Promise.all([load(), loadStatusTotals()]);
    } catch (e) { setError(e); }
  };

  const submitCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      const d = await api.post<GovDecision>("/decisions", {
        domain: f.get("domain"), decision_type: f.get("decision_type"),
        title: f.get("title"), description: f.get("description") || null,
        priority: f.get("priority"), risk_level: f.get("risk_level"),
        subject_type: f.get("subject_type") || null,
        subject_id: f.get("subject_id") ? Number(f.get("subject_id")) : null,
        reason: f.get("reason") || null,
        expected_result: f.get("expected_result") || null,
      });
      (e.target as HTMLFormElement).reset();
      await Promise.all([load(), loadStatusTotals()]);
      await loadDetail(d);
    } catch (err) { setError(err); }
  };

  const submitEvidence = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      await api.post(`/decisions/${selected.id}/evidence`, {
        evidence_type: f.get("evidence_type"),
        value: f.get("value") ? Number(f.get("value")) : null,
        unit: f.get("unit") || null, quality: f.get("quality") || null,
        source_type: f.get("esource_type") || null,
        source_id: f.get("esource_id") || null,
      });
      (e.target as HTMLFormElement).reset();
      await loadDetail(selected);
    } catch (err) { setError(err); }
  };

  const submitExecution = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      await api.post(`/decisions/${selected.id}/execution`, {
        execution_type: f.get("execution_type"),
        success: f.get("success") === "true",
        result: f.get("result") || null,
        result_code: f.get("result_code") || null,
      });
      (e.target as HTMLFormElement).reset();
      await loadDetail(selected);
    } catch (err) { setError(err); }
  };

  const submitVerification = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      await api.post(`/decisions/${selected.id}/verification`, {
        verification_status: f.get("verification_status"),
        observed_result: f.get("observed_result") || null,
        verification_method: f.get("verification_method") || null,
        notes: f.get("notes") || null,
      });
      (e.target as HTMLFormElement).reset();
      await loadDetail(selected);
    } catch (err) { setError(err); }
  };

  const sel = (name: string, options: readonly string[], ns: string, all?: string) => {
    const filterKey = name.startsWith("f_") ? name.slice(2) as keyof typeof filters : null;
    return (
    <select name={name} className="border rounded-md px-2 py-1.5 text-sm bg-background"
      value={filterKey ? filters[filterKey] : undefined}
      onChange={filterKey ? (e) =>
        setFilters((p) => ({ ...p, [filterKey]: e.target.value })) : undefined}>
      {all !== undefined && <option value="">{all}</option>}
      {options.map((o) => <option key={o} value={o}>{t(`${ns}.${o}`)}</option>)}
    </select>
    );
  };

  const language = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const lifecycleCopy = language === "fr"
    ? {
        eyebrow: "FOGGARA / DECISION INTELLIGENCE",
        title: "Cycle de décision traçable",
        subtitle: "Les états proviennent du moteur de décision et restent liés aux preuves, à l’exécution et à la vérification.",
      }
    : language === "en"
      ? {
          eyebrow: "FOGGARA / DECISION INTELLIGENCE",
          title: "Traceable decision lifecycle",
          subtitle: "States come from the decision engine and remain linked to evidence, execution and verification.",
        }
      : {
          eyebrow: "FOGGARA / ذكاء القرار",
          title: "دورة قرار قابلة للتتبع",
          subtitle: "الحالات مصدرها محرك القرار وتبقى مرتبطة بالأدلة والتنفيذ والتحقق.",
        };

  const lifecycleIcons: Partial<Record<DecisionStatus, typeof Send>> = {
    PROPOSED: Send,
    REVIEW_REQUIRED: FileCheck2,
    APPROVED: Gavel,
    EXECUTION_AUTHORIZED: ShieldCheck,
    EXECUTED: PlayCircle,
    VERIFIED: CheckCircle2,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{t("decisions.title")}</h1>
        {selected?.is_demo && <DemoBadge show />}
      </div>
      <ErrorText error={error} />

      <section className="fg-decision-intelligence" aria-label={lifecycleCopy.title}>
        <div className="fg-decision-intelligence-head">
          <div>
            <p>{lifecycleCopy.eyebrow}</p>
            <h2>{lifecycleCopy.title}</h2>
            <span>{lifecycleCopy.subtitle}</span>
          </div>
          <Activity size={26} />
        </div>
        <div className="fg-decision-lifecycle">
          {LIFECYCLE.map((status, index) => {
            const Icon = lifecycleIcons[status] ?? Activity;
            return (
              <button
                type="button"
                key={status}
                aria-pressed={filters.status === status}
                onClick={() => {
                  setPage(1);
                  setFilters((current) => ({
                    ...current,
                    status: current.status === status ? "" : status,
                  }));
                }}
              >
                <small>{String(index + 1).padStart(2, "0")}</small>
                <Icon size={18} />
                <strong>{t(`decisions.statuses.${status}`)}</strong>
                <b>{statusTotals[status] ?? "—"}</b>
              </button>
            );
          })}
        </div>
      </section>

      {/* الفلاتر (§21) */}
      <div className="flex flex-wrap gap-2 items-center">
        {sel("f_domain", DOMAINS, "decisions.domains", t("decisions.allDomains"))}
        {sel("f_status", STATUSES, "decisions.statuses", t("decisions.allStatuses"))}
        {sel("f_risk", LEVELS, "decisions.levels", t("decisions.allRisks"))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* القائمة */}
        <Card>
          <CardHeader><CardTitle>{t("decisions.list")}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {list === null && <Skeleton className="h-32 w-full" />}
            {list?.length === 0 && <p className="text-muted-foreground">{t("decisions.empty")}</p>}
            {list?.map((d) => (
              <button key={d.id} onClick={() => loadDetail(d).catch(setError)}
                className={`w-full text-start border rounded-lg p-3 hover:bg-accent transition ${selected?.id === d.id ? "border-primary bg-accent" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{d.title}</span>
                  <div className="flex gap-1 items-center">
                    {d.source_type === "telemetry_rule" && <ProvenanceBadge kind="PROPOSED" />}
                    {d.is_demo && <DemoBadge show />}
                    <Badge variant={statusVariant(d.status)}>{t(`decisions.statuses.${d.status}`)}</Badge>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {t(`decisions.domains.${d.domain}`)} · {d.decision_type} · {t(`decisions.levels.${d.risk_level}`)}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
        <Pager page={page} pages={pages} onPage={setPage} />

        {/* إنشاء قرار */}
        <Card>
          <CardHeader><CardTitle>{t("decisions.create")}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submitCreate} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{t("decisions.domain")}</Label>{sel("domain", DOMAINS, "decisions.domains")}</div>
                <div><Label>{t("decisions.decisionType")}</Label>
                  <Input name="decision_type" required placeholder="water_allocation_approval" /></div>
                <div><Label>{t("decisions.priority")}</Label>{sel("priority", LEVELS, "decisions.levels")}</div>
                <div><Label>{t("decisions.risk")}</Label>{sel("risk_level", LEVELS, "decisions.levels")}</div>
                <div><Label>{t("decisions.subjectType")}</Label>
                  <Input name="subject_type" placeholder="water_allocation" /></div>
                <div><Label>{t("decisions.subjectId")}</Label>
                  <Input name="subject_id" type="number" min="1" /></div>
              </div>
              <div><Label>{t("decisions.titleField")}</Label><Input name="title" required /></div>
              <div><Label>{t("decisions.description")}</Label><Textarea name="description" rows={2} /></div>
              <div><Label>{t("decisions.reason")}</Label><Input name="reason" /></div>
              <div><Label>{t("decisions.expectedResult")}</Label><Input name="expected_result" /></div>
              <Button type="submit">{t("decisions.submit")}</Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* تفاصيل القرار */}
      {selected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {selected.title}
              <Badge variant={statusVariant(selected.status)}>
                {t(`decisions.statuses.${selected.status}`)}
              </Badge>
              {selected.source_type === "telemetry_rule" && <ProvenanceBadge kind="PROPOSED" />}
              {selected.is_demo && <DemoBadge show />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* الإجراءات المتاحة حسب الدور */}
            {allowedActions.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {allowedActions.map((to) => (
                  <Button key={to} size="sm"
                    variant={to === "CANCELLED" ? "destructive" : "default"}
                    onClick={() => doTransition(to)}>
                    {t(`decisions.actions.${to}`)}
                  </Button>
                ))}
              </div>
            )}

            {/* المسار الزمني (§22) */}
            <div>
              <h3 className="font-semibold mb-2">{t("decisions.timeline")}</h3>
              <ol className="border-s-2 border-border space-y-3 ps-4">
                {LIFECYCLE.map((st) => {
                  const reached = transitions.some((tr) => tr.to_status === st);
                  const rec = transitions.filter((tr) => tr.to_status === st).at(-1);
                  return (
                    <li key={st} className={reached ? "" : "opacity-40"}>
                      <div className="flex items-center gap-2">
                        <Badge variant={reached ? statusVariant(st) : "outline"}>
                          {t(`decisions.statuses.${st}`)}
                        </Badge>
                        {rec && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(rec.created_at).toLocaleString()} · {t(`decisions.roles.${rec.actor_role}`)}
                            {rec.reason ? ` · ${rec.reason}` : ""}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
                {selected.status === "CANCELLED" && (
                  <li><Badge variant="destructive">{t("decisions.statuses.CANCELLED")}</Badge>
                    <span className="text-xs text-muted-foreground ms-2">
                      {selected.cancelled_at ? new Date(selected.cancelled_at).toLocaleString() : ""}
                    </span>
                  </li>
                )}
              </ol>
            </div>

            <Tabs defaultValue="evidence">
              <TabsList>
                <TabsTrigger value="evidence">{t("decisions.evidence")} ({evidence.length})</TabsTrigger>
                <TabsTrigger value="execution">{t("decisions.execution")} ({executions.length})</TabsTrigger>
                <TabsTrigger value="verification">{t("decisions.verification")} ({verifications.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="evidence" className="space-y-3 pt-3">
                {evidence.map((ev) => (
                  <div key={ev.id} className="border rounded p-2 text-sm">
                    <b>{t(`decisions.evidenceTypes.${ev.evidence_type}`)}</b>
                    {ev.value !== null && ` — ${ev.value} ${ev.unit ?? ""}`}
                    {ev.source_type && ` · ${ev.source_type}${ev.source_id ? `/${ev.source_id}` : ""}`}
                    {ev.quality && ` · ${ev.quality}`}
                  </div>
                ))}
                {evidence.length === 0 && <p className="text-muted-foreground text-sm">{t("decisions.noEvidence")}</p>}
                {selected.status !== "VERIFIED" && selected.status !== "CANCELLED" && (
                  <form onSubmit={submitEvidence} className="flex flex-wrap gap-2 items-end border-t pt-3">
                    <div><Label>{t("decisions.evidenceType")}</Label>
                      {sel("evidence_type", EVIDENCE_TYPES, "decisions.evidenceTypes")}</div>
                    <div><Label>{t("decisions.value")}</Label>
                      <Input name="value" type="number" step="any" className="w-28" /></div>
                    <div><Label>{t("decisions.unit")}</Label><Input name="unit" className="w-20" /></div>
                    <div><Label>{t("decisions.quality")}</Label><Input name="quality" className="w-24" /></div>
                    <div><Label>{t("decisions.sourceType")}</Label><Input name="esource_type" className="w-28" /></div>
                    <div><Label>{t("decisions.sourceId")}</Label><Input name="esource_id" className="w-20" /></div>
                    <Button type="submit" size="sm">{t("decisions.addEvidence")}</Button>
                  </form>
                )}
              </TabsContent>

              <TabsContent value="execution" className="space-y-3 pt-3">
                {executions.map((ex) => (
                  <div key={ex.id} className="border rounded p-2 text-sm">
                    <b>{ex.execution_type}</b>
                    {ex.result_code && ` · ${ex.result_code}`}
                    {ex.success !== null && (
                      <Badge variant={ex.success ? "default" : "destructive"} className="ms-2">
                        {ex.success ? t("decisions.success") : t("decisions.failed")}
                      </Badge>
                    )}
                    {ex.result && <div className="text-muted-foreground">{ex.result}</div>}
                  </div>
                ))}
                {executions.length === 0 && <p className="text-muted-foreground text-sm">{t("decisions.noExecution")}</p>}
                <p className="text-xs text-muted-foreground">{t("decisions.recordOnlyNote")}</p>
                {isAdmin && selected.status === "EXECUTION_AUTHORIZED" && (
                  <form onSubmit={submitExecution} className="flex flex-wrap gap-2 items-end border-t pt-3">
                    <div><Label>{t("decisions.executionType")}</Label>
                      <Input name="execution_type" required className="w-40" /></div>
                    <div><Label>{t("decisions.resultCode")}</Label><Input name="result_code" className="w-24" /></div>
                    <div><Label>{t("decisions.successLabel")}</Label>
                      <select name="success" className="border rounded-md px-2 py-1.5 text-sm bg-background">
                        <option value="true">{t("decisions.success")}</option>
                        <option value="false">{t("decisions.failed")}</option>
                      </select></div>
                    <div><Label>{t("decisions.result")}</Label><Input name="result" className="w-48" /></div>
                    <Button type="submit" size="sm">{t("decisions.addExecution")}</Button>
                  </form>
                )}
              </TabsContent>

              <TabsContent value="verification" className="space-y-3 pt-3">
                {verifications.map((v) => (
                  <div key={v.id} className="border rounded p-2 text-sm">
                    <Badge variant={v.verification_status === "PASSED" ? "default"
                      : v.verification_status === "FAILED" ? "destructive" : "outline"}>
                      {t(`decisions.verificationStatuses.${v.verification_status}`)}
                    </Badge>
                    {v.verification_method && ` · ${v.verification_method}`}
                    {v.observed_result && <div className="text-muted-foreground">{v.observed_result}</div>}
                    {v.notes && <div className="text-muted-foreground">{v.notes}</div>}
                  </div>
                ))}
                {verifications.length === 0 && <p className="text-muted-foreground text-sm">{t("decisions.noVerification")}</p>}
                {isReviewer && selected.status === "EXECUTED" && (
                  <form onSubmit={submitVerification} className="flex flex-wrap gap-2 items-end border-t pt-3">
                    <div><Label>{t("decisions.verificationStatus")}</Label>
                      {sel("verification_status",
                        ["PASSED", "FAILED", "PARTIAL", "INCONCLUSIVE"] as const,
                        "decisions.verificationStatuses")}</div>
                    <div><Label>{t("decisions.method")}</Label>
                      <Input name="verification_method" className="w-32" /></div>
                    <div><Label>{t("decisions.observed")}</Label><Input name="observed_result" className="w-48" /></div>
                    <div><Label>{t("decisions.notes")}</Label><Input name="notes" className="w-40" /></div>
                    <Button type="submit" size="sm">{t("decisions.addVerification")}</Button>
                  </form>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
