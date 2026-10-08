import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Activity, ArrowUpRight, Bot, ClipboardCheck, FolderKanban,
  Gauge, Layers3, MapPinned, Radio, Satellite, ShieldCheck, Sprout,
  Workflow, Zap,
} from "lucide-react";
import { api, type Paged } from "@/lib/api";
import type { Device, GisSite, GovDecision, Project, Sensor, TelemetryReading, WilayaMeta } from "@/types";
import { useAuth } from "@/context/useAuth";
import { NationalMap } from "@/components/NationalMap";
import "./command-center.css";

type ProjectFocus = {
  measurements: unknown[];
  evidences: unknown[];
  recommendations: unknown[];
  humanDecisions: unknown[];
  actions: unknown[];
};

const emptyFocus: ProjectFocus = { measurements: [], evidences: [], recommendations: [], humanDecisions: [], actions: [] };

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
  const [snapshot, setSnapshot] = useState<Snapshot>(initial);
  const [wilayas, setWilayas] = useState<WilayaMeta[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<number | null>(() => {
    const stored = Number(localStorage.getItem("foggara.activeProject"));
    return Number.isFinite(stored) && stored > 0 ? stored : null;
  });
  const [projectFocus, setProjectFocus] = useState<ProjectFocus>(emptyFocus);
  const [projectFocusProjectId, setProjectFocusProjectId] = useState<number | null>(null);

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
    updated: "Actualisé", review: "File de revue", national: "Couverture nationale", setupTitle: "Initialiser les données opérationnelles", setupBody: "Créez votre premier site, projet, ressource en eau et parcelle avec des données réelles.", setupAction: "Configurer maintenant",
    activeProject: "Projet actif", projectMission: "Chaîne opérationnelle du projet", readiness: "Progression opérationnelle", contextStage: "Contexte", dataStage: "Données", evidenceStage: "Preuves", intelligenceStage: "Intelligence", decisionStage: "Décision", actionStage: "Action", openProject: "Dossier projet", fieldMap: "Carte & terrain", fieldAnalysis: "Analyse agricole", decisionStudio: "Décision & règles", noProject: "Créez ou sélectionnez un projet pour travailler dans un contexte unique.",
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
    updated: "Updated", review: "Review queue", national: "National coverage", setupTitle: "Initialize operational data", setupBody: "Create your first real site, project, water resource and parcel.", setupAction: "Set up now",
    activeProject: "Active project", projectMission: "Project operational chain", readiness: "Operational progress", contextStage: "Context", dataStage: "Data", evidenceStage: "Evidence", intelligenceStage: "Intelligence", decisionStage: "Decision", actionStage: "Action", openProject: "Project record", fieldMap: "Map & field", fieldAnalysis: "Agriculture analysis", decisionStudio: "Decision & rules", noProject: "Create or select a project to work in one operational context.",
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
    updated: "آخر تحديث", review: "طابور المراجعة", national: "التغطية الوطنية", setupTitle: "ابدأ التشغيل ببيانات حقيقية", setupBody: "أنشئ أول موقع ومشروع ومورد ماء وقطعة زراعية مرتبطة بمؤسستك.", setupAction: "تهيئة مساحة العمل",
    activeProject: "المشروع النشط", projectMission: "السلسلة التشغيلية للمشروع", readiness: "التقدم التشغيلي", contextStage: "السياق", dataStage: "البيانات", evidenceStage: "الأدلة", intelligenceStage: "الذكاء", decisionStage: "القرار", actionStage: "الإجراء", openProject: "ملف المشروع", fieldMap: "الخريطة والميدان", fieldAnalysis: "التحليل الزراعي", decisionStudio: "القرار والقواعد", noProject: "أنشئ أو اختر مشروعًا للعمل ضمن سياق تشغيلي واحد.",
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

      const loadedProjects = value<Paged<Project>>(0)?.items ?? null;
      setSnapshot({
        projects: loadedProjects,
        sites: value<{ count: number; sites: GisSite[] }>(1)?.sites ?? null,
        telemetry: value<TelemetryReading[]>(2),
        decisions: value<Paged<GovDecision>>(3)?.items ?? null,
        devices: value<Device[]>(4),
        sensors: value<Sensor[]>(5),
        pending: value<{ measurements: unknown[]; evidences: unknown[] }>(6),
      });
      if (loadedProjects?.length) {
        const remembered = Number(localStorage.getItem("foggara.activeProject"));
        const next = loadedProjects.some(project => project.id === remembered) ? remembered : loadedProjects[0].id;
        localStorage.setItem("foggara.activeProject", String(next));
        setActiveProjectId(next);
      } else {
        setActiveProjectId(null);
      }
      setWilayas(value<{ count: number; wilayas: WilayaMeta[] }>(7)?.wilayas ?? []);
      setUpdatedAt(new Date());
    };
    void load();
  }, [user?.role]);

  useEffect(() => {
    if (!activeProjectId) return;
    let cancelled = false;
    Promise.allSettled([
      api.get<unknown[]>(`/projects/${activeProjectId}/measurements`),
      api.get<unknown[]>(`/projects/${activeProjectId}/evidences`),
      api.get<unknown[]>(`/projects/${activeProjectId}/recommendations`),
      api.get<unknown[]>(`/projects/${activeProjectId}/human-decisions`),
      api.get<unknown[]>(`/projects/${activeProjectId}/actions`),
    ]).then(results => {
      if (cancelled) return;
      const rows = (index:number) => results[index].status === "fulfilled" ? (results[index] as PromiseFulfilledResult<unknown[]>).value : [];
      setProjectFocus({
        measurements: rows(0),
        evidences: rows(1),
        recommendations: rows(2),
        humanDecisions: rows(3),
        actions: rows(4),
      });
      setProjectFocusProjectId(activeProjectId);
    });
    return () => { cancelled = true; };
  }, [activeProjectId]);

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
    { label: copy.gis, body: "AOI · sites · parcels · layers", to: "/app/gis", icon: MapPinned },
    { label: copy.agriculture, body: "Satellite · soil · water · irrigation", to: "/app/agriculture", icon: Sprout },
    { label: copy.decisionsLabel, body: "Evidence → rules → decision", to: "/app/studio", icon: ClipboardCheck },
    { label: copy.telemetryLabel, body: "Monitoring · devices · streams", to: "/app/operations", icon: Gauge },
  ];

  const projectFocusLoading = Boolean(activeProjectId && projectFocusProjectId !== activeProjectId);
  const activeProject = snapshot.projects?.find(project => project.id === activeProjectId) ?? null;
  const projectStages = activeProject ? [
    { label: copy.contextStage, value: Number(activeProject.site_id != null) + Number(activeProject.resource_id != null) + Number(activeProject.asset_id != null), icon: MapPinned },
    { label: copy.dataStage, value: projectFocus.measurements.length, icon: Activity },
    { label: copy.evidenceStage, value: projectFocus.evidences.length, icon: ShieldCheck },
    { label: copy.intelligenceStage, value: projectFocus.recommendations.length, icon: Bot },
    { label: copy.decisionStage, value: projectFocus.humanDecisions.length, icon: ClipboardCheck },
    { label: copy.actionStage, value: projectFocus.actions.length, icon: Workflow },
  ] : [];
  const completedStages = projectStages.filter(stage => stage.value > 0).length;
  const readiness = projectFocusLoading ? 0 : projectStages.length ? Math.round((completedStages / projectStages.length) * 100) : 0;

  const recent = snapshot.telemetry?.slice(0, 5) ?? [];
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

      <section className="fg-project-mission" aria-label={copy.projectMission}>
        <div className="fg-project-mission-head">
          <div>
            <span>PROJECT / OPERATIONAL CONTEXT</span>
            <h2>{copy.projectMission}</h2>
            <p>{activeProject ? activeProject.title : copy.noProject}</p>
          </div>
          <label className="fg-project-selector">
            <span>{copy.activeProject}</span>
            <select value={activeProjectId ?? ""} onChange={event => { const next=Number(event.target.value)||null; setActiveProjectId(next); if(next)localStorage.setItem("foggara.activeProject",String(next)); }}>
              <option value="">—</option>
              {(snapshot.projects ?? []).map(project => <option key={project.id} value={project.id}>{project.title}</option>)}
            </select>
          </label>
        </div>
        {activeProject ? <>
          <div className="fg-project-readiness">
            <div><span>{copy.readiness}</span><strong>{projectFocusLoading ? "…" : readiness+"%"}</strong></div>
            <div className="fg-project-progress" aria-label={copy.readiness}><i style={{width: readiness+"%"}} /></div>
          </div>
          <div className="fg-project-stages">
            {projectStages.map(({label,value,icon:Icon},index)=><div key={label} className={value>0?"ready":""}><b>{String(index+1).padStart(2,"0")}</b><Icon size={18}/><span>{label}</span><strong>{projectFocusLoading?"…":value}</strong></div>)}
          </div>
          <div className="fg-project-actions">
            <Link to={"/app/projects/"+activeProject.id}><FolderKanban size={16}/>{copy.openProject}<ArrowUpRight size={14}/></Link>
            <Link to="/app/gis"><MapPinned size={16}/>{copy.fieldMap}<ArrowUpRight size={14}/></Link>
            <Link to="/app/agriculture"><Sprout size={16}/>{copy.fieldAnalysis}<ArrowUpRight size={14}/></Link>
            <Link to={"/app/studio?project="+activeProject.id}><ClipboardCheck size={16}/>{copy.decisionStudio}<ArrowUpRight size={14}/></Link>
          </div>
        </> : <Link to="/app/setup" className="fg-command-workspace"><Sprout size={23}/><div><strong>{copy.setupAction}</strong><small>Site · Project · Water · Parcel</small></div><ArrowUpRight size={15}/></Link>}
      </section>

      <section className="fg-command-kpis" aria-label={copy.activity}>
        {cards.map(({ label, value, to, icon: Icon }) => (
          <Link to={to} className="fg-command-kpi" key={label}>
            <div><Icon size={18} /><span>{label}</span></div>
            <strong>{value === undefined ? "—" : value}</strong>
            <ArrowUpRight size={15} />
          </Link>
        ))}
      </section>

      <section className="fg-command-grid">
        <NationalMap
          sites={snapshot.sites ?? []}
          wilayas={wilayas}
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
