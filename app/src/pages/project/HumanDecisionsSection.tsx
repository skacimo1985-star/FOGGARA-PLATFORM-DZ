import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/context/useAuth";
import type { Action, HumanDecision, Recommendation } from "@/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorText } from "@/components/common";

const DECISIONS = ["approve", "reject", "defer"] as const;

const dVariant = (d: string) =>
  (d === "approve" ? "default" : d === "reject" ? "destructive" : "outline") as "default" | "destructive" | "outline";

export function HumanDecisionsSection({ projectId, decisions, recommendations, actions, reload }: {
  projectId: number;
  decisions: HumanDecision[];
  recommendations: Recommendation[];
  actions: Action[];
  reload: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const canDecide = user?.role === "reviewer" || user?.role === "admin";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const recId = fd.get("recommendation_id");
    const actId = fd.get("action_id");
    try {
      await api.post("/human-decisions", {
        project_id: projectId,
        recommendation_id: recId ? Number(recId) : null,
        action_id: actId ? Number(actId) : null,
        decision: String(fd.get("decision")),
        reason: String(fd.get("reason") || ""),
        evidence_ids: [],
      });
      (e.target as HTMLFormElement).reset();
      reload();
    } catch (err) {
      // حالة access denied الحقيقية من الخادم تُعرض كما هي (مترجمة من كود الخطأ)
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("humanDecision.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canDecide && (
          <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>{t("humanDecision.decision")}</Label>
              <div className="flex gap-3 pt-1.5">
                {DECISIONS.map((d) => (
                  <label key={d} className="flex items-center gap-1 text-sm">
                    <input type="radio" name="decision" value={d} required />
                    {t(`humanDecision.decisions.${d}`)}
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="hd-rec">{t("humanDecision.linkedRecommendation")}</Label>
              <select id="hd-rec" name="recommendation_id" className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                <option value="">{t("common.none")}</option>
                {recommendations.map((r) => (
                  <option key={r.id} value={r.id}>#{r.id} — {r.indicator_code}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="hd-act">{t("humanDecision.linkedAction")}</Label>
              <select id="hd-act" name="action_id" className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                <option value="">{t("common.none")}</option>
                {actions.map((a) => (
                  <option key={a.id} value={a.id}>#{a.id} — {a.title}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="hd-reason">{t("humanDecision.reason")}</Label>
              <Textarea id="hd-reason" name="reason" required rows={2} />
            </div>
            <div className="sm:col-span-2"><ErrorText error={error} /></div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>{busy ? t("common.loading") : t("humanDecision.submit")}</Button>
            </div>
          </form>
        )}

        {decisions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("humanDecision.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {decisions.map((d) => (
              <li key={d.id} className="space-y-1 rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={dVariant(d.decision)}>{t(`humanDecision.decisions.${d.decision}`, d.decision)}</Badge>
                  {d.recommendation_id && <span className="text-xs text-muted-foreground">{t("recommendation.title")} #{d.recommendation_id}</span>}
                  {d.action_id && <span className="text-xs text-muted-foreground">{t("action.title")} #{d.action_id}</span>}
                  <span className="ms-auto text-xs text-muted-foreground">
                    {t("humanDecision.decidedBy")} #{d.decided_by} {t("humanDecision.at")}{" "}
                    <span dir="ltr" className="tabular-nums">{new Date(d.created_at).toLocaleString()}</span>
                  </span>
                </div>
                <p>{d.reason}</p>
                {d.evidence_ids.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t("evidence.title")}: {d.evidence_ids.map((id) => `#${id}`).join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
