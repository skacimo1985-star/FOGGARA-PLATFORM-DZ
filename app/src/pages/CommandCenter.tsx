import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Activity, ArrowUpRight, Bot, ClipboardCheck, Droplets, FolderKanban,
  Gauge, Layers3, MapPinned, Radio, Satellite, ShieldCheck, Sprout,
  Workflow, Zap,
} from "lucide-react";
import { api, type Paged } from "@/lib/api";
import type { Device, GisSite, GovDecision, Project, Sensor, TelemetryReading, WilayaMeta } from "@/types";
import { useAuth } from "@/context/useAuth";
import { NationalMap } from "@/components/NationalMap";
import "./command-center.css";

type Snapshot = {
  projects: Project[] | null;
  sites: GisSite[] | null;
  telemetry: TelemetryReading[] | null;
  decisions: GovDecision[] | null;
  devices: Device[] | null;
  sensors: Sensor[] | null;
  pending: { measurements: unknown[]; evidences: unknown[] } | null;
};

const initial: Snapshot = {
  projects: null,
  sites: null,
  telemetry: null,
  decisions: null,
  devices: null,
  sensors: null,
  pending: null,
};

const flow = [
  "Resource", "Data", "Structure", "Analysis", "Rules", "Intelligence",
  "Decision", "Action", "Monitoring", "Evidence", "Learning",
];

export default function CommandCenter() {
  const { i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<Snapshot>(initial);
  const [wilayas, setWilayas] = useState<WilayaMeta[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const lang = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const copy = lang === "fr" ? {
    eyebrow: "CENTRE DE COMMANDE NATIONAL · WEFEH",
    title: "Du terrain à la décision.",
    intro: "Une vue opérationnelle unique des projets, ressources, télémétrie, preuves et décisions de FOGGARA-DZ.",
    live: "Données connectées", projects: "Projets", sites: "Sites", telemetry: "Lectures récentes",
    decisions: "Décisions à revoir", evidence: "Éléments à revoir", infrastructure: "Appareils & capteurs",
    open: "Ouvrir", domains: "Espaces opérationnels", flow: "Chaîne de décision FOGGARA",
    activity: "État opérationnel", noData: "Aucune donnée", unavailable: "Indisponible",
    water: "Eau", agriculture: "Agriculture", gis: "SIG national", telemetryLabel: "IoT & télémétrie",
    decisionsLabel: "Décisions", automation: "Automatisation", ai: "Insights IA", evidenceLabel: "Preuves",
    updated: "Actualisé", review: "File de revue", national: "Couverture nationale", activeProjects: "Projets actifs", openProject: "Ouvrir", viewSite: "Voir sur la carte", noProjects: "Aucun projet opérationnel", setupTitle: "Initialiser les données opérationnelles", setupBody: "Créez votre premier site, projet, ressource en eau et parcelle avec des données réelles.", setupAction: "Configurer maintenant",
  } : lang === "en" ? {
    eyebrow: "NATIONAL COMMAND CENTER · WEFEH",
    title: "From field reality to decision.",
    intro: "One operational view of FOGGARA-DZ projects, resources, telemetry, evidence and decisions.",
    live: "Connected data", projects: "Projects", sites: "Sites", telemetry: "Recent readings",
    decisions: "Decisions to review", evidence: "Evidence to review", infrastructure: "Devices & sensors",
    open: "Open", domains: "Operational workspaces", flow: "FOGGARA decision chain",
    activity: "Operational state", noData: "No data", unavailable: "Unavailable",
    water: "Water", agriculture: "Agriculture", gis: "National GIS", telemetryLabel: "IoT & telemetry",
    decisionsLabel: "Decisions", automation: "Automation", ai: "AI Insights", evidenceLabel: "Evidence",
    updated: "Updated", review: "Review queue", national: "National coverage", activeProjects: "Active projects", openProject: "Open", viewSite: "View on map", noProjects: "No operational projects", setupTitle: "Initialize operational data", setupBody: "Create your first real site, project, water resource and parcel.", setupAction: "Set up now",
  } : {
    eyebrow: "مركز القيادة الوطني · WEFEH",
    title: "من الواقع الميداني إلى القرار.",
    intro: "رؤية تشغيلية موحدة لمشاريع وموارد وقياسات وأدلة وقرارات FOGGARA-DZ.",
    live: "بيانات مترابطة", projects: "المشاريع", sites: "المواقع", telemetry: "القياسات الأخيرة",
    decisions: "قرارات تنتظر المراجعة", evidence: "أدلة تنتظر المراجعة", infrastructure: "الأجهزة والحساسات",
    open: "فتح", domains: "مساحات العمل التشغيلية", flow: "سلسلة القرار في FOGGARA",
    activity: "الحالة التشغيلية", noData: "لا توجد بيانات", unavailable: "غير متاح",
    water: "المياه", agriculture: "الزراعة", gis: "GIS الوطني", telemetryLabel: "IoT والقياسات",
    decisionsLabel: "القرارات", automation: "الأتمتة", ai: "ذكاء وتحليلات AI", evidenceLabel: "الأدلة",
    updated: "آخر تحديث", review: "طابور المراجعة", national: "التغطية الوطنية", activeProjects: "المشاريع النشطة", openProject: "فتح", viewSite: "عرض على الخريطة", noProjects: "لا توجد مشاريع تشغيلية", setupTitle: "ابدأ التشغيل ببيانات حقيقية", setupBody: "أنشئ أول موقع ومشروع ومورد ماء وقطعة زراعية مرتبطة بمؤسستك.", setupAction: "تهيئة مساحة العمل",
  };

  useEffect(() => {
    const load = async () => {
      const pendingAllowed = user?.role === "admin" || user?.role === "reviewer";
      const results = await Promise.allSettled([
        api.get<Paged<Project>>("/projects?page_size=100"),
        api.get<{ count: number; sites: GisSite[] }>("/gis/sites"),
        api.get<TelemetryReading[]>("/telemetry/latest"),
        api.get<Paged<GovDecision>>("/decisions?status=REVIEW_REQUIRED&page_size=100"),
        api.get<Device[]>("/telemetry/devices"),
        api.get<Sensor[]>("/telemetry/sensors"),
        pendingAllowed
          ? api.get<{ measurements: unknown[]; evidences: unknown[] }>("/reviews/pending")
          : Promise.resolve({ measurements: [], evidences: [] }),
        api.get<{ count: number; wilayas: WilayaMeta[] }>("/meta/wilayas"),
      ]);

      const value = <T,>(index: number): T | null =>
        results[index].status === "fulfilled" ? (results[index] as PromiseFulfilledResult<T>).value : null;

      setSnapshot({
        projects: value<Paged<Project>>(0)?.items ?? null,
        sites: value<{ count: number; sites: GisSite[] }>(1)?.sites ?? null,
        telemetry: value<TelemetryReading[]>(2),
        decisions: value<Paged<GovDecision>>(3)?.items ?? null,
        devices: value<Device[]>(4),
        sensors: value<Sensor[]>(5),
        pending: value<{ measurements: unknown[]; evidences: unknown[] }>(6),
      });
      setWilayas(value<{ count: number; wilayas: WilayaMeta[] }>(7)?.wilayas ?? []);
      setUpdatedAt(new Date());
    };
    void load();
  }, [user?.role]);

  const counts = useMemo(() => ({
    projects: snapshot.projects?.length,
    sites: snapshot.sites?.length,
    telemetry: snapshot.telemetry?.length,
    decisions: snapshot.decisions?.length,
    evidence: snapshot.pending
      ? snapshot.pending.measurements.length + snapshot.pending.evidences.length
      : undefined,
    infrastructure: snapshot.devices && snapshot.sensors
      ? snapshot.devices.length + snapshot.sensors.length
      : undefined,
  }), [snapshot]);

  const cards = [
    { label: copy.projects, value: counts.projects, to: "/app/projects", icon: FolderKanban },
    { label: copy.sites, value: counts.sites, to: "/app/gis", icon: MapPinned },
    { label: copy.telemetry, value: counts.telemetry, to: "/app/telemetry", icon: Activity },
    { label: copy.decisions, value: counts.decisions, to: "/app/decisions", icon: ClipboardCheck },
    { label: copy.evidence, value: counts.evidence, to: "/app/review", icon: ShieldCheck },
    { label: copy.infrastructure, value: counts.infrastructure, to: "/app/iot", icon: Radio },
  ];

  const workspaces = [
    { label: copy.water, body: "Water intelligence", to: "/app/water", icon: Droplets },
    { label: copy.agriculture, body: "Soil · crop · irrigation", to: "/app/agriculture", icon: Sprout },
    { label: copy.gis, body: "National sites · projects · layers", to: "/app/gis", icon: MapPinned },
    { label: copy.telemetryLabel, body: "Devices · sensors · streams", to: "/app/telemetry", icon: Gauge },
    { label: copy.decisionsLabel, body: "Evidence → review → action", to: "/app/decisions", icon: ClipboardCheck },
    { label: copy.automation, body: "Jobs · rules · monitoring", to: "/app/automation", icon: Workflow },
    { label: copy.evidenceLabel, body: "Observed · verified · computed", to: "/app/review", icon: ShieldCheck },
    { label: copy.ai, body: "Portfolio · evidence · risks · next actions", to: "/app/insights", icon: Bot },
  ];

  const recent = snapshot.telemetry?.slice(0, 5) ?? [];
  const recentProjects = [...(snapshot.projects ?? [])]
    .filter((project) => project.status !== "closed")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 6);
  const projectSite = (project: Project) =>
    project.site_id == null ? null : snapshot.sites?.find((row) => row.site.id === project.site_id)?.site ?? null;
  const needsSetup = snapshot.projects !== null && snapshot.sites !== null && snapshot.projects.length === 0 && snapshot.sites.length === 0;

  return (
    <div className="fg-command-center" dir={i18n.dir()}>
      <section className="fg-command-hero">
        <div>
          <p className="fg-command-eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
          <div className="fg-command-status">
            <span><i />{copy.live}</span>
            <span><Layers3 size={14} />{copy.national}: {wilayas.length || "—"}</span>
            {updatedAt && <span>{copy.updated}: {updatedAt.toLocaleTimeString()}</span>}
          </div>
        </div>
        <div className="fg-command-orbit" aria-hidden="true">
          <div className="fg-command-orbit-core"><Zap size={28} /><b>WEFEH</b></div>
          <span className="o1">W</span><span className="o2">E</span><span className="o3">F</span>
          <span className="o4">E</span><span className="o5">H</span>
        </div>
      </section>

      {needsSetup && <section className="fg-command-section" aria-label={copy.setupTitle}>
        <div className="fg-command-section-title"><div><span>PRODUCTION / REAL DATA</span><h2>{copy.setupTitle}</h2><p>{copy.setupBody}</p></div><MapPinned size={26}/></div>
        <Link to="/app/setup" className="fg-command-workspace"><Sprout size={23}/><div><strong>{copy.setupAction}</strong><small>Site · Project · Water · Parcel</small></div><ArrowUpRight size={15}/></Link>
      </section>}

      <section className="fg-command-kpis" aria-label={copy.activity}>
        {cards.map(({ label, value, to, icon: Icon }) => (
          <Link to={to} className="fg-command-kpi" key={label}>
            <div><Icon size={18} /><span>{label}</span></div>
            <strong>{value === undefined ? "—" : value}</strong>
            <ArrowUpRight size={15} />
          </Link>
        ))}
      </section>

      <section className="fg-command-project-board" aria-label={copy.activeProjects}>
        <div className="fg-command-section-title">
          <div><span>PORTFOLIO / LIVE CONTEXT</span><h2>{copy.activeProjects}</h2></div>
          <FolderKanban size={26}/>
        </div>
        {snapshot.projects === null ? <p className="fg-command-empty">{copy.unavailable}</p> : recentProjects.length === 0 ? (
          <p className="fg-command-empty">{copy.noProjects}</p>
        ) : (
          <div className="fg-command-project-list">
            {recentProjects.map((project) => {
              const site = projectSite(project);
              return <article key={project.id}>
                <div className="fg-command-project-main">
                  <span className="fg-command-project-domain">{project.domain}</span>
                  <Link to={`/app/projects/${project.id}`}><strong>{project.title}</strong></Link>
                  <small>{site ? `${site.name} · ${site.wilaya}` : "—"} · {project.status}</small>
                </div>
                <div className="fg-command-project-actions">
                  <Link to={`/app/projects/${project.id}`}>{copy.openProject}<ArrowUpRight size={14}/></Link>
                  {site ? <Link to={`/app/gis?project=${project.id}&site=${site.id}`}><MapPinned size={14}/>{copy.viewSite}</Link> : null}
                </div>
              </article>;
            })}
          </div>
        )}
      </section>

      <section className="fg-command-grid">
        <NationalMap
          sites={snapshot.sites ?? []}
          wilayas={wilayas}
          onSelectSite={(siteId) => navigate(`/app/gis?site=${siteId}`)}
          locale={lang}
        />
        <aside className="fg-command-rail">
          <div className="fg-command-panel-head">
            <div><span>LIVE</span><h2>{copy.telemetry}</h2></div>
            <Link to="/app/telemetry">{copy.open}<ArrowUpRight size={14} /></Link>
          </div>
          {snapshot.telemetry === null ? (
            <p className="fg-command-empty">{copy.unavailable}</p>
          ) : recent.length === 0 ? (
            <p className="fg-command-empty">{copy.noData}</p>
          ) : (
            <ul className="fg-command-stream">
              {recent.map((r) => (
                <li key={r.id}>
                  <span><i className={r.quality === "VALID" ? "ok" : "warn"} />{r.metric}</span>
                  <strong dir="ltr">{r.value ?? "—"} {r.unit}</strong>
                  <small>{new Date(r.observed_at).toLocaleString()}</small>
                </li>
              ))}
            </ul>
          )}
          <div className="fg-command-review">
            <ShieldCheck size={19} />
            <div><small>{copy.review}</small><strong>{counts.evidence ?? "—"}</strong></div>
            <Link to="/app/review"><ArrowUpRight size={16} /></Link>
          </div>
        </aside>
      </section>

      <section className="fg-command-section">
        <div className="fg-command-section-title">
          <div><span>FOGGARA / WORKSPACES</span><h2>{copy.domains}</h2></div>
          <Satellite size={26} />
        </div>
        <div className="fg-command-workspaces">
          {workspaces.map(({ label, body, to, icon: Icon }) => (
            <Link key={label} to={to} className="fg-command-workspace">
              <Icon size={23} />
              <div><strong>{label}</strong><small>{body}</small></div>
              <ArrowUpRight size={15} />
            </Link>
          ))}
        </div>
      </section>

      <section className="fg-command-flow">
        <div><span>RESOURCE → LEARNING</span><h2>{copy.flow}</h2></div>
        <ol>
          {flow.map((step, index) => (
            <li key={step}><b>{String(index + 1).padStart(2, "0")}</b><span>{step}</span></li>
          ))}
        </ol>
      </section>
    </div>
  );
}
