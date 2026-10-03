import { useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { ExploreDomain as ExploreDomainData, ExploreSection } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorText, DemoBadge } from "@/components/common";
import { SolarCard } from "@/components/SolarCard";

type Item = Record<string, unknown>;
type SectionKey = "resources" | "assets" | "indicators" | "risks" | "services" | "projects" | "terminology";
const SECTIONS: SectionKey[] = ["resources", "assets", "indicators", "risks", "services", "projects", "terminology"];

function PlannedCard({ required }: { required: string[] }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-md border border-dashed p-4">
      <Badge variant="outline">{t("explore.plannedCard")}</Badge>
      <p className="mt-2 text-xs font-medium text-muted-foreground">{t("explore.requiredData")}:</p>
      <ul className="mt-1 flex flex-wrap gap-1.5">
        {required.map((r) => (
          <li key={r} className="rounded border border-sand/50 bg-sand/15 px-2 py-0.5 text-xs text-ink">{t(`explore.req.${r}`, r)}</li>
        ))}
      </ul>
    </div>
  );
}

function SectionItems({ section, data }: { section: SectionKey; data: Item[] }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const localizedName = (it: Item) =>
    String(locale === "fr" ? it.name_fr : locale === "en" ? it.name_en : it.name_ar);

  if (section === "terminology") {
    return (
      <ul className="space-y-2">
        {data.map((it, i) => (
          <li key={i} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap gap-x-3 font-medium">
              <span>{String(it.term_ar)}</span>
              <span className="text-muted-foreground">{String(it.term_fr)}</span>
              <span className="text-muted-foreground">{String(it.term_en)}</span>
            </div>
            <p className="mt-1 text-muted-foreground">
              <span className="font-medium">{t("explore.definition")}:</span> {String(it.definition)}
            </p>
          </li>
        ))}
      </ul>
    );
  }

  if (section === "indicators") {
    return (
      <ul className="space-y-2">
        {data.map((it, i) => (
          <li key={i} className="rounded-md border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{localizedName(it)}</span>
              <Badge variant="secondary">{String(it.code)}</Badge>
              <span className="text-muted-foreground" dir="ltr">{String(it.unit)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("analytics.formula")}: {String(it.formula)}</p>
          </li>
        ))}
      </ul>
    );
  }

  if (section === "projects") {
    return (
      <ul className="space-y-2">
        {data.map((it) => (
          <li key={Number(it.id)}>
            <Link to={`/app/projects/${it.id}`} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-parchment/70">
              <span>{String(it.title)}<DemoBadge show={Boolean(it.is_demo)} /></span>
              <Badge variant="outline">{t(`project.statuses.${String(it.status)}`, String(it.status))}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  // resources / assets / services
  return (
    <ul className="space-y-2">
      {data.map((it, i) => (
        <li key={Number(it.id ?? i)} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
          <span>
            {section === "services" ? localizedName(it) : String(it.name)}
            <DemoBadge show={Boolean(it.is_demo)} />
            {section === "services" && (
              <span className="ms-2 text-xs text-muted-foreground">
                {t(`service.types.${String(it.type)}`, String(it.type))} · {String(it.provider)}
              </span>
            )}
            {section !== "services" && (
              <span className="ms-2 text-xs text-muted-foreground">
                {String(section === "resources" ? it.type : it.kind)}
              </span>
            )}
          </span>
          {it.status !== undefined && (
            <Badge variant="outline">{String(it.status)}</Badge>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function ExploreDomain() {
  const { t } = useTranslation();
  const { domain = "" } = useParams<{ domain: string }>();
  // نخزّن النتيجة مقرونة بالبُعد حتى لا تُعرض بيانات بُعد سابق أثناء التحميل
  const [result, setResult] = useState<{ domain: string; data: ExploreDomainData } | null>(null);
  const [errorState, setErrorState] = useState<{ domain: string; e: unknown } | null>(null);
  const data = result?.domain === domain ? result.data : null;
  const error = errorState?.domain === domain ? errorState.e : null;

  useEffect(() => {
    // Clear the previous domain immediately so its records cannot appear under the new route.
    (async () => {
      try {
        const d = await api.get<ExploreDomainData>(`/explore/${domain}`);
        setErrorState(null);
        setResult({ domain, data: d });
      } catch (e) {
        setErrorState({ domain, e });
      }
    })();
  }, [domain]);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/app/explore" className="text-sm text-oasis-strong underline">{t("common.back")}</Link>
        <h1 className="mt-1 t-section text-ink">
          {t(`landing.${domain}`, domain)} — {t("explore.title")}
        </h1>
      </div>
      <ErrorText error={error} />
      {/* بطاقة الحاسبة الشمسية المحسوبة — بُعد الطاقة فقط */}
      {domain === "energy" && <SolarCard />}
      {!data && !error ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {SECTIONS.map((key) => {
            const sec = data[key] as ExploreSection;
            return (
              <Card key={key}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-base">
                    {t(`explore.sections.${key}`)}
                    <Badge variant={sec.status === "available" ? "default" : "outline"}>
                      {t(sec.status === "available" ? "landing.operational" : "explore.plannedCard")}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {sec.status === "planned" ? (
                    <PlannedCard required={sec.required_data ?? []} />
                  ) : (
                    <SectionItems section={key} data={(sec.items ?? []) as Item[]} />
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
