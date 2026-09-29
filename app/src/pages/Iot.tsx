import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { PlannedStatus } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorText } from "@/components/common";

export default function Iot() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PlannedStatus | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.get<PlannedStatus>("/iot/status").then(setStatus).catch(setError);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="t-section text-ink">{t("iot.title")}</h1>

      <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm font-medium text-destructive">
        {t("iot.fieldWarning")}
      </p>

      <ErrorText error={error} />

      {status === null && !error ? (
        <Skeleton className="h-40 w-full" />
      ) : status ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {t("iot.plannedEntities")}
                <Badge variant="outline">{t("iot.plannedCard")}</Badge>
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
            <CardHeader><CardTitle className="text-base">{t("iot.warningsTitle")}</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                {status.warnings.map((w) => (
                  <li key={w}>{t(`iot.warnings.${w}`, w)}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
