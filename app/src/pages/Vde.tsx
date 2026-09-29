import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import type { PlannedStatus } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorText } from "@/components/common";

const PIPELINE = ["project", "evidence", "disclosure", "review", "qa", "decision"] as const;

export default function Vde() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<PlannedStatus | null>(null);
  const [error, setError] = useState<unknown>(null);
  const Arrow = i18n.dir() === "rtl" ? ArrowLeft : ArrowRight;

  useEffect(() => {
    api.get<PlannedStatus>("/vde/status").then(setStatus).catch(setError);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-section text-ink">{t("vde.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("vde.noSimulation")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {t("vde.pipelineTitle")}
            <Badge variant="outline">{t("vde.plannedCard")}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-wrap items-center gap-2">
            {PIPELINE.map((s, i) => (
              <li key={s} className="flex items-center gap-2">
                <span className="flex items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-paper">
                    {i + 1}
                  </span>
                  {t(`vde.pipeline.${s}`)}
                </span>
                {i < PIPELINE.length - 1 && <Arrow className="h-4 w-4 text-muted-foreground" />}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <ErrorText error={error} />

      {status === null && !error ? (
        <Skeleton className="h-40 w-full" />
      ) : status ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {t("vde.plannedEntities")}
                <Badge variant="outline">{t("vde.plannedCard")}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-wrap gap-2">
                {status.model.map((m) => (
                  <li key={m} className="rounded-md border bg-parchment/70 px-3 py-1.5 text-sm" dir="ltr">{m}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{t("vde.warningsTitle")}</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                {status.warnings.map((w) => (
                  <li key={w}>{t(`vde.warnings.${w}`, w)}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
