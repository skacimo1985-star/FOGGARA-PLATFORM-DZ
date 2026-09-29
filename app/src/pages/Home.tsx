import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { Action, Project } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorText, DemoBadge } from "@/components/common";

const STEPS = ["discover", "understand", "analyze", "act", "monitor"] as const;

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [pending, setPending] = useState<{ measurements: unknown[]; evidences: unknown[] } | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.get<Project[]>("/projects")
      .then(async (ps) => {
        setProjects(ps);
        const acts = await Promise.all(ps.map((p) => api.get<Action[]>(`/projects/${p.id}/actions`)));
        setActions(acts.flat().filter((a) => a.status !== "done"));
      })
      .catch(setError);
    if (user && (user.role === "reviewer" || user.role === "admin")) {
      api.get<{ measurements: unknown[]; evidences: unknown[] }>("/reviews/pending")
        .then(setPending)
        .catch(() => setPending(null));
    }
  }, [user]);

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

      <ErrorText error={error} />

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
