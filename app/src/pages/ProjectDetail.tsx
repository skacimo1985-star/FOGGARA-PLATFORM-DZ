import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { BrainCircuit, Database, Droplets, Gavel, ListChecks, MapPinned, Network, ScrollText, ShieldCheck, Workflow } from "lucide-react";
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
import { AssuranceSection } from "./project/AssuranceSection";
import { AgricultureSection } from "./project/AgricultureSection";
import "./project-operational.css";

const STATUSES = ["draft", "active", "suspended", "closed"] as const;

export default function ProjectDetail() {
  const { t, i18n } = useTranslation();
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

  const reload = useCallback(async () => {
    try {
      const [p, m, e, r, a, h, rv, hd] = await Promise.all([
        api.get<Project>(`/projects/${pid}`),
        api.get<Measurement[]>(`/projects/${pid}/measurements`),
        api.get<Evidence[]>(`/projects/${pid}/evidences`),
        api.get<Recommendation[]>(`/projects/${pid}/recommendations`),
        api.get<Action[]>(`/projects/${pid}/actions`),
        api.get<AuditEntry[]>(`/projects/${pid}/history`),
        api.get<Review[]>(`/projects/${pid}/reviews`),
        api.get<HumanDecision[]>(`/projects/${pid}/human-decisions`),
      ]);
      setError(null);
      setProject(p); setMeasurements(m); setEvidences(e);
      setRecommendations(r); setActions(a); setHistory(h);
      setReviews(rv); setHumanDecisions(hd);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
    api.getAll<Site>("/sites").then(setSites).catch(setError);
    api.getAll<WaterResource>("/resources").then(setResources).catch(setError);
    api.getAll<Asset>("/assets").then(setAssets).catch(setError);
  }, [pid]);

  // Reload performs asynchronous API reads and commits the resulting records.
  useEffect(() => {
    (async () => { await reload(); })();
  }, [reload]);

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

  const language = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const operationalCopy = language === "fr"
    ? {
        title: "Chaîne opérationnelle du projet",
        context: "Contexte", data: "Données", evidence: "Preuves", intelligence: "Intelligence",
        decision: "Décisions", action: "Actions", audit: "Audit",
        connected: "Espaces connectés", gis: "SIG", water: "Eau", decisions: "Décisions", automation: "Automatisation",
      }
    : language === "en"
      ? {
          title: "Project operational chain",
          context: "Context", data: "Data", evidence: "Evidence", intelligence: "Intelligence",
          decision: "Decisions", action: "Actions", audit: "Audit",
          connected: "Connected workspaces", gis: "GIS", water: "Water", decisions: "Decisions", automation: "Automation",
        }
      : {
          title: "السلسلة التشغيلية للمشروع",
          context: "السياق", data: "البيانات", evidence: "الأدلة", intelligence: "الذكاء",
          decision: "القرارات", action: "الإجراءات", audit: "التدقيق",
          connected: "مساحات مترابطة", gis: "GIS", water: "المياه", decisions: "القرارات", automation: "الأتمتة",
        };

  const operationalStages = [
    { label: operationalCopy.context, value: Number(project.site_id != null) + Number(project.resource_id != null) + Number(project.asset_id != null), icon: Network },
    { label: operationalCopy.data, value: measurements.length, icon: Database },
    { label: operationalCopy.evidence, value: evidences.length, icon: ShieldCheck },
    { label: operationalCopy.intelligence, value: recommendations.length, icon: BrainCircuit },
    { label: operationalCopy.decision, value: humanDecisions.length, icon: Gavel },
    { label: operationalCopy.action, value: actions.length, icon: ListChecks },
    { label: operationalCopy.audit, value: history.length, icon: ScrollText },
  ];

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

      <section className="fg-project-spine" aria-label={operationalCopy.title}>
        <div className="fg-project-spine-head">
          <div>
            <p>FOGGARA / PROJECT INTELLIGENCE</p>
            <h2>{operationalCopy.title}</h2>
          </div>
          <Workflow size={24} />
        </div>
        <div className="fg-project-spine-flow">
          {operationalStages.map(({ label, value, icon: Icon }, index) => (
            <article key={label}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <Icon size={18} />
              <strong>{label}</strong>
              <b>{value}</b>
            </article>
          ))}
        </div>
        <div className="fg-project-connected">
          <span>{operationalCopy.connected}</span>
          <nav>
            <Link to={project.site_id ? `/app/gis` : "/app/gis"}><MapPinned size={15} />{operationalCopy.gis}</Link>
            <Link to="/app/water"><Droplets size={15} />{operationalCopy.water}</Link>
            <Link to="/app/decisions"><Gavel size={15} />{operationalCopy.decisions}</Link>
            <Link to="/app/automation"><Workflow size={15} />{operationalCopy.automation}</Link>
          </nav>
        </div>
      </section>

      <Tabs defaultValue="overview">
        <TabsList className="h-auto max-w-full flex-wrap gap-1 [&>button]:h-auto">
          <TabsTrigger value="overview">{t("project.tabs.overview")}</TabsTrigger>
          <TabsTrigger value="data">{t("project.tabs.data")}</TabsTrigger>
          <TabsTrigger value="evidence">{t("project.tabs.evidence")}</TabsTrigger>
          <TabsTrigger value="reviews">{t("project.tabs.reviews")}</TabsTrigger>
          <TabsTrigger value="actions">{t("project.tabs.actions")}</TabsTrigger>
          <TabsTrigger value="audit">{t("project.tabs.audit")}</TabsTrigger>
          <TabsTrigger value="assurance">{t("assurance.title")}</TabsTrigger>
          <TabsTrigger value="agriculture">{t("agri.title")}</TabsTrigger>
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
        <TabsContent value="assurance"><AssuranceSection projectId={pid} evidences={evidences} /></TabsContent>
        <TabsContent value="agriculture"><AgricultureSection projectId={pid} evidences={evidences} /></TabsContent>

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
