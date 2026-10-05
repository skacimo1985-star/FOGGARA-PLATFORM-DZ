import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowRight, FileCheck2, FlaskConical, Gavel, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import type { Evidence, Measurement } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorText } from "@/components/common";
import "./evidence-review.css";

interface Pending { measurements: Measurement[]; evidences: Evidence[] }

function ReviewForm({ targetType, targetId, onDone }: {
  targetType: "measurement" | "evidence"; targetId: number; onDone: () => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await api.post("/reviews", {
        target_type: targetType,
        target_id: targetId,
        decision: String(fd.get("decision")),
        note: String(fd.get("note") || ""),
        reason: String(fd.get("reason") || ""),
      });
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-2 grid gap-2 rounded-md bg-parchment/70 p-3">
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-1">
          <input type="radio" name="decision" value="accepted" required /> {t("review.accept")}
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name="decision" value="rejected" required /> {t("review.reject")}
        </label>
        <label className="flex items-center gap-1">
          <input type="radio" name="decision" value="request_clarification" required /> {t("review.requestClarification")}
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>{t("review.note")}</Label>
          <Input name="note" required />
        </div>
        <div className="space-y-1">
          <Label>{t("review.reason")}</Label>
          <Input name="reason" required />
        </div>
      </div>
      <ErrorText error={error} />
      <div>
        <Button size="sm" type="submit" disabled={busy}>{busy ? t("common.loading") : t("review.submit")}</Button>
      </div>
    </form>
  );
}

export default function ReviewQueue() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<Pending | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [openFor, setOpenFor] = useState<string | null>(null);

  const reload = useCallback(() => {
    api.get<Pending>("/reviews/pending").then(setData).catch(setError);
  }, []);
  useEffect(reload, [reload]);

  if (!data && !error) return <Skeleton className="h-64 w-full" />;

  const language = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const copy = language === "fr"
    ? {
        eyebrow: "FOGGARA / EVIDENCE ASSURANCE",
        title: "File de revue et chaîne de confiance",
        subtitle: "Aucune preuve n’est promue automatiquement : la revue humaine reste explicite.",
        measurements: "Mesures en attente", evidences: "Preuves en attente", total: "À examiner",
        flow: ["Donnée", "Contrôle", "Preuve", "Décision"],
      }
    : language === "en"
      ? {
          eyebrow: "FOGGARA / EVIDENCE ASSURANCE",
          title: "Review queue and trust chain",
          subtitle: "No evidence is promoted automatically: human review remains explicit.",
          measurements: "Pending measurements", evidences: "Pending evidence", total: "To review",
          flow: ["Data", "Review", "Evidence", "Decision"],
        }
      : {
          eyebrow: "FOGGARA / ضمان الأدلة",
          title: "طابور المراجعة وسلسلة الثقة",
          subtitle: "لا تتم ترقية أي دليل تلقائيًا؛ تبقى المراجعة البشرية صريحة وقابلة للتتبع.",
          measurements: "قياسات تنتظر المراجعة", evidences: "أدلة تنتظر المراجعة", total: "إجمالي المراجعة",
          flow: ["بيانات", "مراجعة", "دليل", "قرار"],
        };

  const pendingTotal = (data?.measurements.length ?? 0) + (data?.evidences.length ?? 0);

  return (
    <div className="space-y-6">
      <h1 className="t-section text-ink">{t("review.title")}</h1>
      <ErrorText error={error} />

      {data && (
        <section className="fg-evidence-assurance" aria-label={copy.title}>
          <div className="fg-evidence-assurance-head">
            <div>
              <p>{copy.eyebrow}</p>
              <h2>{copy.title}</h2>
              <span>{copy.subtitle}</span>
            </div>
            <ShieldCheck size={27} />
          </div>
          <div className="fg-evidence-kpis">
            <article><FlaskConical size={18}/><span>{copy.measurements}</span><strong>{data.measurements.length}</strong></article>
            <article><FileCheck2 size={18}/><span>{copy.evidences}</span><strong>{data.evidences.length}</strong></article>
            <article><Gavel size={18}/><span>{copy.total}</span><strong>{pendingTotal}</strong></article>
          </div>
          <div className="fg-evidence-flow">
            {copy.flow.map((label, index) => (
              <div key={label}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{label}</strong>
                {index < copy.flow.length - 1 && <ArrowRight size={14}/>}
              </div>
            ))}
          </div>
        </section>
      )}

      {data && (
        <>
          <Card>
            <CardHeader><CardTitle className="text-base">{t("review.pendingMeasurements")}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.measurements.length === 0 && <p className="text-sm text-muted-foreground">{t("review.empty")}</p>}
              {data.measurements.map((m) => (
                <div key={m.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      #{m.id} — {t(`measurement.params.${m.parameter}`)}:{" "}
                      <span dir="ltr" className="tabular-nums">{m.value} {m.unit}</span>
                      {" · "}
                      <Link className="text-oasis-strong underline" to={`/app/projects/${m.project_id}`}>
                        {t("project.title")} #{m.project_id}
                      </Link>
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{t(`measurement.qualityStatuses.${m.quality_status}`)}</Badge>
                      <Button size="sm" variant="secondary"
                              onClick={() => setOpenFor(openFor === `m${m.id}` ? null : `m${m.id}`)}>
                        {t("common.details")}
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{m.source} · {m.method}</p>
                  {openFor === `m${m.id}` && (
                    <ReviewForm targetType="measurement" targetId={m.id} onDone={() => { setOpenFor(null); reload(); }} />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{t("review.pendingEvidences")}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.evidences.length === 0 && <p className="text-sm text-muted-foreground">{t("review.empty")}</p>}
              {data.evidences.map((e) => (
                <div key={e.id} className="rounded-md border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      #{e.id} — {e.title} ({t(`evidence.types.${e.doc_type}`)})
                      {" · "}
                      <Link className="text-oasis-strong underline" to={`/app/projects/${e.project_id}`}>
                        {t("project.title")} #{e.project_id}
                      </Link>
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{t(`evidence.statuses.${e.status}`)}</Badge>
                      <Button size="sm" variant="secondary"
                              onClick={() => setOpenFor(openFor === `e${e.id}` ? null : `e${e.id}`)}>
                        {t("common.details")}
                      </Button>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{t("evidence.license")}: {e.license}</p>
                  {openFor === `e${e.id}` && (
                    <ReviewForm targetType="evidence" targetId={e.id} onDone={() => { setOpenFor(null); reload(); }} />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
