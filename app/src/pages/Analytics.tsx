import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api, ApiError } from "@/lib/api";
import type { Indicator, IndicatorValue, Project } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorText } from "@/components/common";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";

function IndicatorCard({ indicator, projectId }: { indicator: Indicator; projectId: number | null }) {
  const { t, i18n } = useTranslation();
  const [value, setValue] = useState<IndicatorValue | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // إعادة الضبط عند تغيير المشروع
    setValue(null);
    setErr(null);
  }, [projectId]);

  const name = i18n.language === "fr" ? indicator.name_fr : i18n.language === "en" ? indicator.name_en : indicator.name_ar;

  async function compute() {
    if (projectId === null) return;
    setBusy(true);
    setErr(null);
    try {
      setValue(await api.get<IndicatorValue>(`/projects/${projectId}/indicators/${indicator.code}`));
    } catch (e) {
      setErr(e instanceof ApiError ? e : new ApiError(0, "NETWORK", "network error"));
      setValue(null);
    } finally {
      setBusy(false);
    }
  }

  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : t("analytics.unbounded"));

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {name}
          <Badge variant="secondary">{indicator.code}</Badge>
          <span className="text-sm font-normal text-muted-foreground" dir="ltr">{indicator.unit}</span>
        </CardTitle>
        <Button variant="outline" size="sm" onClick={compute} disabled={busy || projectId === null}>
          {busy ? t("common.loading") : t("analytics.compute")}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t("analytics.formula")}</dt>
            <dd>{indicator.formula}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("analytics.source")}</dt>
            <dd>{indicator.source}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("analytics.validity")}</dt>
            <dd className="tabular-nums" dir="ltr">{fmtDate(indicator.valid_from)} → {fmtDate(indicator.valid_to)}</dd>
          </div>
        </dl>

        {err && <ErrorText error={err} />}

        {value && !value.sufficient && (
          <p role="status" className="rounded-md border border-sand/70 bg-sand/15 p-3 text-ink">
            {t("indicator.insufficient")}
          </p>
        )}

        {value && (
          <dl className="grid gap-2 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">{t("analytics.value")}</dt>
              <dd className="flex items-center gap-2 text-lg font-bold tabular-nums" dir="ltr">
                {value.sufficient ? `${value.value} ${value.unit}` : t("common.none")}
                <span dir={i18n.dir()}><ProvenanceBadge kind="COMPUTED" /></span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("analytics.window")}</dt>
              <dd className="tabular-nums" dir="ltr">
                {new Date(value.window_from).toLocaleDateString()} → {new Date(value.window_to).toLocaleDateString()}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("indicator.nMeasurements")}</dt>
              <dd className="tabular-nums">{value.n_measurements}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t("analytics.sources")}</dt>
              <dd dir="ltr" className="tabular-nums">
                {value.measurement_ids.length === 0
                  ? t("common.none")
                  : value.measurement_ids.map((id) => `#${id}`).join(", ")}
              </dd>
            </div>
            {value.params && (
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">{t("analytics.params")}</dt>
                <dd dir="ltr" className="text-xs text-muted-foreground">
                  {Object.entries(value.params).map(([k, v]) => `${k}=${String(v)}`).join(" · ")}
                </dd>
              </div>
            )}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

export default function Analytics() {
  const { t } = useTranslation();
  const [indicators, setIndicators] = useState<Indicator[] | null>(null);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.get<Indicator[]>("/indicators").then(setIndicators).catch(setError);
    api.get<Project[]>("/projects")
      .then((ps) => {
        setProjects(ps);
        if (ps.length > 0) setProjectId((cur) => cur ?? ps[0].id);
      })
      .catch(() => setProjects([]));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t-section text-ink">{t("analytics.title")}</h1>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {t("analytics.selectProject")}
          <select
            aria-label={t("analytics.selectProject")}
            className="rounded-md border bg-background px-3 py-2 text-sm text-foreground"
            value={projectId ?? ""}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
          >
            {(projects ?? []).map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </label>
      </div>

      <ErrorText error={error} />

      {projects !== null && projects.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("analytics.noProjects")}
        </p>
      ) : indicators === null ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : indicators.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("analytics.noIndicators")}</p>
      ) : (
        <div className="space-y-4">
          {indicators.map((ind) => (
            <IndicatorCard key={ind.id} indicator={ind} projectId={projectId} />
          ))}
        </div>
      )}
    </div>
  );
}
