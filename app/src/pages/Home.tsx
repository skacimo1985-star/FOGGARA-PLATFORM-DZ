import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { api, type Paged } from "@/lib/api";
import { useAuth } from "@/context/useAuth";
import type {
  Action, Asset, Device, GovDecision, Organization, Project,
  Sensor, SimulationRun, TelemetryReading, TelemetryRule, WaterResource,
} from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorText, DemoBadge } from "@/components/common";
import { NexusKasria } from "@/components/NexusKasria";

const STEPS = ["discover", "understand", "analyze", "act", "monitor"] as const;

/** بطاقة Nexus: قيمة حقيقية من الـAPI أو حالة «غير متاح»/«لا بيانات» صريحة — بلا أرقام مختلقة */
function NexusCard({
  title, to, state,
}: {
  title: string;
  to: string;
  state: { status: "loading" | "error" | "ok"; content: ReactNode };
}) {
  const { t } = useTranslation();
  return (
    <Link to={to} className="block rounded-xl focus-visible:outline-oasis">
      <Card className="h-full transition-colors hover:border-oasis/50">
        <CardHeader className="pb-1">
          <CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>
        </CardHeader>
        <CardContent className="min-h-10 text-lg font-bold">
          {state.status === "loading" && <Skeleton className="h-7 w-16" />}
          {state.status === "error" && (
            <span className="text-sm font-normal text-muted-foreground">{t("nexus.unavailable")}</span>
          )}
          {state.status === "ok" && state.content}
        </CardContent>
      </Card>
    </Link>
  );
}

type AsyncState<T> = { status: "loading" | "error" | "ok"; data: T | null };

export default function Home() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [pending, setPending] = useState<{ measurements: unknown[]; evidences: unknown[] } | null>(null);
  const [error, setError] = useState<unknown>(null);

  // بطاقات Nexus — كل بطاقة مستقلة الفشل
  const [org, setOrg] = useState<AsyncState<Organization>>({ status: "loading", data: null });
  const [resources, setResources] = useState<AsyncState<{ r: WaterResource[]; a: Asset[] }>>({ status: "loading", data: null });
  const [sensors, setSensors] = useState<AsyncState<{ d: Device[]; s: Sensor[] }>>({ status: "loading", data: null });
  const [latest, setLatest] = useState<AsyncState<TelemetryReading[]>>({ status: "loading", data: null });
  const [rules, setRules] = useState<AsyncState<TelemetryRule[]>>({ status: "loading", data: null });
  const [runs, setRuns] = useState<AsyncState<SimulationRun[]>>({ status: "loading", data: null });
  const [pendingDecisions, setPendingDecisions] = useState<AsyncState<GovDecision[]>>({ status: "loading", data: null });

  useEffect(() => {
    (async () => {
      try {
        const ps = (await api.get<Paged<Project>>("/projects?page_size=100")).items;
        setProjects(ps);
        const acts = await Promise.all(ps.map((p) => api.get<Action[]>(`/projects/${p.id}/actions`)));
        setActions(acts.flat().filter((a) => a.status !== "done"));
      } catch (e) { setError(e); }
    })();

    if (user && (user.role === "reviewer" || user.role === "admin")) {
      api.get<{ measurements: unknown[]; evidences: unknown[] }>("/reviews/pending")
        .then(setPending)
        .catch(() => setPending(null));
    }

    // استعلامات Nexus المستقلة — فشل أحدها لا يُسقط الباقي
    api.get<Organization>("/org")
      .then((o) => setOrg({ status: "ok", data: o }))
      .catch(() => setOrg({ status: "error", data: null }));
    Promise.all([api.get<Paged<WaterResource>>("/resources?page_size=500"), api.get<Paged<Asset>>("/assets?page_size=500")])
      .then(([r, a]) => setResources({ status: "ok", data: { r: r.items, a: a.items } }))
      .catch(() => setResources({ status: "error", data: null }));
    Promise.all([api.get<Device[]>("/telemetry/devices"), api.get<Sensor[]>("/telemetry/sensors")])
      .then(([d, s]) => setSensors({ status: "ok", data: { d, s } }))
      .catch(() => setSensors({ status: "error", data: null }));
    api.get<TelemetryReading[]>("/telemetry/latest")
      .then((l) => setLatest({ status: "ok", data: l }))
      .catch(() => setLatest({ status: "error", data: null }));
    api.get<TelemetryRule[]>("/telemetry-rules")
      .then((r) => setRules({ status: "ok", data: r }))
      .catch(() => setRules({ status: "error", data: null }));
    api.get<SimulationRun[]>("/simulator/runs")
      .then((r) => setRuns({ status: "ok", data: r }))
      .catch(() => setRuns({ status: "error", data: null }));
    api.get<Paged<GovDecision>>("/decisions?status=REVIEW_REQUIRED&page_size=100")
      .then((d) => setPendingDecisions({ status: "ok", data: d.items }))
      .catch(() => setPendingDecisions({ status: "error", data: null }));
  }, [user]);

  const locale = (i18n.language || "ar") as "ar" | "fr" | "en";
  const orgName = org.data ? (locale === "ar" ? org.data.name_ar : locale === "fr" ? org.data.name_fr : org.data.name_en) : null;

  return (
    <div className="space-y-6">
      {/* شريط المسار فوق زخرفة هندسية خافتة */}
      <section className="pattern-moorish rounded-2xl border border-ink/10 bg-parchment/70 p-4">
        <ol className="flex flex-wrap items-center gap-2" aria-label={t("path.title")}>
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className="flex items-center gap-2 rounded-full border border-ink/15 bg-paper px-3 py-1.5 text-sm font-medium">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-oasis text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                {t(`path.${s}`)}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* هوية القصريّة: خمسة روافد WEFEH في نظام واحد */}
      <NexusKasria />

      <ErrorText error={error} />

      {/* نظرة Nexus التشغيلية — بيانات حقيقية أو حالات صريحة */}
      <section aria-labelledby="nexus-heading">
        <h2 id="nexus-heading" className="t-section mb-3 text-ink">{t("nexus.title")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <NexusCard title={t("nexus.organization")} to="/app/org" state={{
            status: org.status,
            content: <span className="text-base">{orgName}<DemoBadge show={org.data?.is_demo ?? false} /></span>,
          }} />
          <NexusCard title={t("nexus.projects")} to="/app/projects" state={{
            status: projects === null ? "loading" : "ok",
            content: <span>{projects?.length ?? 0}</span>,
          }} />
          <NexusCard title={t("nexus.resources")} to="/app/water" state={{
            status: resources.status,
            content: resources.data && (resources.data.r.length + resources.data.a.length === 0
              ? <span className="text-sm font-normal text-muted-foreground">{t("nexus.noData")}</span>
              : <span>{resources.data.r.length + resources.data.a.length}</span>),
          }} />
          <NexusCard title={t("nexus.sensors")} to="/app/telemetry" state={{
            status: sensors.status,
            content: sensors.data && (sensors.data.d.length + sensors.data.s.length === 0
              ? <span className="text-sm font-normal text-muted-foreground">{t("nexus.noData")}</span>
              : <span>{sensors.data.d.length + sensors.data.s.length}</span>),
          }} />
          <NexusCard title={t("nexus.latestMeasurements")} to="/app/telemetry" state={{
            status: latest.status,
            content: latest.data && (latest.data.length === 0
              ? <span className="text-sm font-normal text-muted-foreground">{t("telemetry.empty")}</span>
              : <span>{latest.data.length}</span>),
          }} />
          <NexusCard title={t("nexus.activeRules")} to="/app/simulator" state={{
            status: rules.status,
            content: rules.data && <span>{rules.data.filter((r) => r.enabled).length}</span>,
          }} />
          <NexusCard title={t("nexus.simulationRuns")} to="/app/simulator" state={{
            status: runs.status,
            content: runs.data && <span>{runs.data.length}</span>,
          }} />
          <NexusCard title={t("nexus.pendingDecisions")} to="/app/decisions" state={{
            status: pendingDecisions.status,
            content: pendingDecisions.data && <span>{pendingDecisions.data.length}</span>,
          }} />
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("project.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {projects === null ? (
              <Skeleton className="h-24 w-full" />
            ) : projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("project.empty")}</p>
            ) : (
              <ul className="divide-y divide-ink/10">
                {projects.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <Link to={`/app/projects/${p.id}`} className="flex items-center justify-between px-2 py-2.5 text-sm transition-colors hover:bg-parchment/70">
                      <span>
                        {p.title}
                        <DemoBadge show={p.is_demo} />
                      </span>
                      <Badge variant="outline">{t(`project.statuses.${p.status}`)}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("action.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            {actions.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("action.empty")}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {actions.slice(0, 6).map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <Link to={`/app/projects/${a.project_id}`} className="hover:underline">{a.title}</Link>
                    <Badge variant={a.status === "in_progress" ? "default" : "outline"}>
                      {t(`action.statuses.${a.status}`)}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {pending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("review.title")}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {pending.measurements.length + pending.evidences.length === 0 ? (
              <p className="text-muted-foreground">{t("review.empty")}</p>
            ) : (
              <p>
                {t("review.pendingMeasurements")}: <strong>{pending.measurements.length}</strong>
                {" · "}
                {t("review.pendingEvidences")}: <strong>{pending.evidences.length}</strong>
                {" — "}
                <Link to="/app/review" className="font-bold text-oasis-strong underline">{t("nav.review")}</Link>
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
