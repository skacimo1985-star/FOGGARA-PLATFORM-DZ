import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { IndicatorValue, Recommendation } from "@/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorText } from "@/components/common";

export function InsightSection({ projectId, recommendations, reload }: {
  projectId: number; recommendations: Recommendation[]; reload: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [ind, setInd] = useState<IndicatorValue | null>(null);
  const [indError, setIndError] = useState<unknown>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [decisionFor, setDecisionFor] = useState<number | null>(null);

  async function compute() {
    setIndError(null);
    try {
      setInd(await api.get<IndicatorValue>(`/projects/${projectId}/indicators/WATER_FLOW_AVG_LS`));
    } catch (err) {
      setIndError(err);
    }
  }

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/projects/${projectId}/recommendations/generate`);
      reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function decide(e: FormEvent<HTMLFormElement>, recId: number) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await api.post(`/recommendations/${recId}/decisions`, {
        decision: String(fd.get("decision")),
        rationale: String(fd.get("rationale") || ""),
      });
      setDecisionFor(null);
      reload();
    } catch (err) {
      setError(err);
    }
  }

  const recText = (r: Recommendation) =>
    i18n.language === "fr" ? r.text_fr : i18n.language === "en" ? r.text_en : r.text_ar;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t("indicator.title")}</CardTitle>
          <Button variant="outline" size="sm" onClick={compute}>{t("indicator.compute")}</Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ErrorText error={indError} />
          {ind && !ind.sufficient && (
            <p role="status" className="rounded-md border border-sand/70 bg-sand/15 p-3 text-ink">
              {t("indicator.insufficient")}
            </p>
          )}
          {ind && (
            <div className="space-y-1 text-xs text-muted-foreground">
              {ind.formula && <p>{t("analytics.formula")}: {ind.formula}</p>}
              <p dir="ltr" className="tabular-nums">
                {t("analytics.sources")}:{" "}
                {ind.measurement_ids.length === 0 ? t("common.none") : ind.measurement_ids.map((id) => `#${id}`).join(", ")}
              </p>
            </div>
          )}
          {ind?.sufficient && (
            <dl className="grid gap-2 sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">{t("indicator.value")}</dt>
                <dd className="text-lg font-bold tabular-nums" dir="ltr">{ind.value} {ind.unit}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("indicator.nMeasurements")}</dt>
                <dd className="tabular-nums">{ind.n_measurements}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t("indicator.window")}</dt>
                <dd className="tabular-nums" dir="ltr">
                  {new Date(ind.window_from).toLocaleDateString()} → {new Date(ind.window_to).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">{t("recommendation.title")}</CardTitle>
          <Button variant="outline" size="sm" onClick={generate} disabled={busy}>
            {busy ? t("common.loading") : t("recommendation.generate")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">{t("recommendation.humanNote")}</p>
          <ErrorText error={error} />
          {recommendations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("recommendation.empty")}</p>
          ) : (
            recommendations.map((r) => (
              <div key={r.id} className="space-y-2 rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <Badge variant="outline">{r.indicator_code}</Badge>
                  <Badge variant={r.status === "accepted" ? "default" : r.status === "rejected" ? "destructive" : "outline"}>
                    {t(`recommendation.statuses.${r.status}`)}
                  </Badge>
                </div>
                <p className="leading-relaxed">{recText(r)}</p>
                <p className="text-xs text-muted-foreground" dir="ltr">{r.basis}</p>
                {r.status === "proposed" && decisionFor !== r.id && (
                  <Button size="sm" variant="secondary" onClick={() => setDecisionFor(r.id)}>
                    {t("recommendation.decide")}
                  </Button>
                )}
                {decisionFor === r.id && (
                  <form onSubmit={(e) => decide(e, r.id)} className="grid gap-2 rounded-md bg-parchment/70 p-3">
                    <div className="flex gap-3">
                      {(["approved", "modified", "rejected"] as const).map((d) => (
                        <label key={d} className="flex items-center gap-1 text-sm">
                          <input type="radio" name="decision" value={d} required />
                          {t(`recommendation.${d}`)}
                        </label>
                      ))}
                    </div>
                    <Label htmlFor={`rat-${r.id}`}>{t("recommendation.rationale")}</Label>
                    <Textarea id={`rat-${r.id}`} name="rationale" required rows={2} />
                    <div className="flex gap-2">
                      <Button size="sm" type="submit">{t("recommendation.decide")}</Button>
                      <Button size="sm" type="button" variant="outline" onClick={() => setDecisionFor(null)}>
                        {t("project.cancel")}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
