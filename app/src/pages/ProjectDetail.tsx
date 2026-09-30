import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { Action, Asset, AuditEntry, Evidence, HumanDecision, Measurement, Project, Recommendation, Review, Site, WaterResource } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorText, DemoBadge } from "@/components/common";
import { MeasurementsSection } from "./project/MeasurementsSection";
import { EvidenceSection } from "./project/EvidenceSection";
import { InsightSection } from "./project/InsightSection";
import { ActionsSection } from "./project/ActionsSection";
import { ReviewsSection } from "./project/ReviewsSection";
import { HumanDecisionsSection } from "./project/HumanDecisionsSection";

const STATUSES = ["draft", "active", "suspended", "closed"] as const;

export default function ProjectDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const pid = Number(id);

  const [project, setProject] = useState<Project | null>(null);
  const [measurements, setMeasurements] = useState<Measurement[]>([]);
  const [evidences, setEvidences] = useState<Evidence[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [humanDecisions, setHumanDecisions] = useState<HumanDecision[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [resources, setResources] = useState<WaterResource[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setError(null);
    Promise.all([
      api.get<Project>(`/projects/${pid}`),
      api.get<Measurement[]>(`/projects/${pid}/measurements`),
      api.get<Evidence[]>(`/projects/${pid}/evidences`),
      api.get<Recommendation[]>(`/projects/${pid}/recommendations`),
      api.get<Action[]>(`/projects/${pid}/actions`),
      api.get<AuditEntry[]>(`/projects/${pid}/history`),
      api.get<Review[]>(`/projects/${pid}/reviews`),
      api.get<HumanDecision[]>(`/projects/${pid}/human-decisions`),
    ])
      .then(([p, m, e, r, a, h, rv, hd]) => {
        setProject(p); setMeasurements(m); setEvidences(e);
        setRecommendations(r); setActions(a); setHistory(h);
        setReviews(rv); setHumanDecisions(hd);
      })
      .catch(setError)
      .finally(() => setLoading(false));
    api.get<Site[]>("/sites").then(setSites).catch(() => {});
    api.get<WaterResource[]>("/resources").then(setResources).catch(() => {});
    api.get<Asset[]>("/assets").then(setAssets).catch(() => {});
  }, [pid]);

  // Reload performs asynchronous API reads and commits the resulting records.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reload(); }, [reload]);

  async function changeStatus(status: string) {
    try {
      await api.patch(`/projects/${pid}`, { status });
      reload();
    } catch (err) {
      setError(err);
    }
  }

  if (loading) return <Skeleton className="h-64 w-full" />;

  if (!project) {
    return (
      <div className="space-y-4">
        <ErrorText error={error} />
        <Link to="/app/projects" className="text-oasis-strong underline">{t("common.back")}</Link>
      </div>
    );
  }

  const siteName = project.site_id != null ? sites.find((s) => s.id === project.site_id)?.name : null;
  const resourceName = project.resource_id != null ? resources.find((r) => r.id === project.resource_id)?.name : null;
  const assetName = project.asset_id != null ? assets.find((a) => a.id === project.asset_id)?.name : null;

  const linkLabel = (name: string | undefined | null, id: number | null) =>
    id == null ? t("common.none") : (name ?? `#${id}`);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="t-section text-ink">
            {project.title}
            <DemoBadge show={project.is_demo} />
          </h1>
          {project.description && <p className="mt-1 text-sm text-muted-foreground">{project.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{t(`landing.${project.domain}`, project.domain)}</Badge>
          <Badge variant="outline">{t(`project.statuses.${project.status}`)}</Badge>
          <select
            aria-label={t("project.status")}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
            value={project.status}
            onChange={(e) => changeStatus(e.target.value)}
          >
            {STATUSES.map((s) => <option key={s} value={s}>{t(`project.statuses.${s}`)}</option>)}
          </select>
        </div>
      </div>

      <ErrorText error={error} />

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">{t("project.tabs.overview")}</TabsTrigger>
          <TabsTrigger value="data">{t("project.tabs.data")}</TabsTrigger>
          <TabsTrigger value="evidence">{t("project.tabs.evidence")}</TabsTrigger>
          <TabsTrigger value="reviews">{t("project.tabs.reviews")}</TabsTrigger>
          <TabsTrigger value="actions">{t("project.tabs.actions")}</TabsTrigger>
          <TabsTrigger value="audit">{t("project.tabs.audit")}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("project.overview")}</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">{t("project.domain")}</dt>
                  <dd>{t(`landing.${project.domain}`, project.domain)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("project.status")}</dt>
                  <dd>{t(`project.statuses.${project.status}`)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("project.site")}</dt>
                  <dd>{linkLabel(siteName, project.site_id)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("project.resource")}</dt>
                  <dd>{linkLabel(resourceName, project.resource_id)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("project.asset")}</dt>
                  <dd>{linkLabel(assetName, project.asset_id)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("project.createdBy")}</dt>
                  <dd>#{project.created_by}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("project.createdAt")}</dt>
                  <dd className="tabular-nums" dir="ltr">{new Date(project.created_at).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("project.updatedAt")}</dt>
                  <dd className="tabular-nums" dir="ltr">{new Date(project.updated_at).toLocaleString()}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="data">
          <Card><CardContent className="pt-6">
            <MeasurementsSection projectId={pid} measurements={measurements} reload={reload} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="evidence">
          <Card><CardContent className="pt-6">
            <EvidenceSection projectId={pid} evidences={evidences} measurements={measurements} reload={reload} />
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="reviews">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("review.listTitle")}</CardTitle></CardHeader>
            <CardContent>
              <ReviewsSection reviews={reviews} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="actions">
          <div className="space-y-4">
            <InsightSection projectId={pid} recommendations={recommendations} reload={reload} />
            <HumanDecisionsSection
              projectId={pid}
              decisions={humanDecisions}
              recommendations={recommendations}
              actions={actions}
              reload={reload}
            />
            <Card><CardContent className="pt-6">
              <ActionsSection projectId={pid} actions={actions} reload={reload} />
            </CardContent></Card>
          </div>
        </TabsContent>

        <TabsContent value="audit">
          <Card><CardContent className="pt-6">
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("audit.empty")}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-wrap gap-2 border-b py-1.5 last:border-0">
                    <span className="tabular-nums text-muted-foreground" dir="ltr">
                      {new Date(h.created_at).toLocaleString()}
                    </span>
                    <Badge variant="secondary">{h.action}</Badge>
                    <span>{h.entity_type} #{h.entity_id}</span>
                    <span className="text-muted-foreground">user #{h.user_id}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
