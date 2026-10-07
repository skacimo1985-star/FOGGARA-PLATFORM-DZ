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

type Readiness = {
  runtime_status: "healthy" | "degraded";
  deployment_mode: "dev" | "prod";
  production_mode: boolean;
  production_certification: boolean;
  core: {
    database: { status: string; latency_ms: number; schema_revision: string; engine: string };
    environment: { mode: string; production_mode: boolean; app_version: string };
  };
  integrations: {
    satellite: { status: string; provenance: string };
    weather: { status: string; enabled: boolean; provider: string | null };
    ai: { status: string; mode: string; model: string | null; data_boundary: string };
    automation: { status: string; web_runtime_enabled: boolean; external_worker_observed: boolean };
  };
  assurance_gates: { key: string; status: string }[];
};

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

export default function CommandCenter() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<Snapshot>(initial);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [wilayas, setWilayas] = useState<WilayaMeta[]>([]);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const lang = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const copy = lang === "fr" ? {
    eyebrow: "CENTRE DE COMMANDE NATIONAL · WEFEH",
    title: "Gérer une ressource. Prouver ses données. Décider et agir.",
    intro: "FOGGARA-DZ relie territoire, ressources WEFEH, données vérifiables, analyse, décision, action et suivi dans un même contexte opérationnel.",
    live: "Données connectées", projects: "Projets", sites: "Sites", telemetry: "Lectures récentes",
    decisions: "Décisions à revoir", evidence: "Éléments à revoir", infrastructure: "Appareils & capteurs",
    open: "Ouvrir", domains: "Espaces opérationnels", flow: "Chaîne de décision FOGGARA",
    activity: "État opérationnel", noData: "Aucune donnée", unavailable: "Indisponible",
    water: "Eau", agriculture: "Agriculture", gis: "SIG national", telemetryLabel: "IoT & télémétrie",
    decisionsLabel: "Décisions", automation: "Automatisation", ai: "Insights IA", evidenceLabel: "Preuves",
    updated: "Actualisé", review: "File de revue", national: "Couverture nationale", activeProjects: "Projets actifs", openProject: "Ouvrir", viewSite: "Voir sur la carte", noProjects: "Aucun projet opérationnel",
    readinessTitle: "Préparation d’exécution", runtime: "Runtime", database: "Base de données", aiMode: "IA", weather: "Météo", satelliteLabel: "Satellite", automationLabel: "Automatisation", assurance: "Garanties restant à prouver", notCertified: "Non certifié production",
    setupTitle: "Initialiser les données opérationnelles", setupBody: "Créez votre premier site, projet, ressource en eau et parcelle avec des données réelles.", setupAction: "Configurer maintenant",
    managedTitle: "Commencer par ce que vous gérez", managedIntro: "Choisissez l’objet opérationnel. FOGGARA ouvre ensuite ses données, analyses, décisions et actions dans le même contexte.", landAsset: "Parcelle / terrain", landBody: "Limites · satellite · sol · irrigation", waterAsset: "Ressource en eau", waterBody: "Puits · réservoir · pompage · qualité", projectAsset: "Projet", projectBody: "Données · preuves · décisions · actions", deviceAsset: "Équipement / capteur", deviceBody: "Appareils · capteurs · télémétrie · Edge",
    actionsTitle: "Services opérationnels", analysisAction: "Centre d’analyses", drawField: "Délimiter une parcelle", satelliteAction: "Analyser Sentinel", irrigationAction: "Calculer l’irrigation", iotAction: "Appareils & lectures", projectData: "Mesures & preuves", decisionAction: "Construire une décision", serviceAction: "Demander un service", metrologyAction: "Métrologie & étalonnage",
  } : lang === "en" ? {
    eyebrow: "NATIONAL COMMAND CENTER · WEFEH",
    title: "Manage a resource. Prove its data. Decide and act.",
    intro: "FOGGARA-DZ connects territory, WEFEH resources, verifiable data, analysis, decision, action and monitoring in one operational context.",
    live: "Connected data", projects: "Projects", sites: "Sites", telemetry: "Recent readings",
    decisions: "Decisions to review", evidence: "Evidence to review", infrastructure: "Devices & sensors",
    open: "Open", domains: "Operational workspaces", flow: "FOGGARA decision chain",
    activity: "Operational state", noData: "No data", unavailable: "Unavailable",
    water: "Water", agriculture: "Agriculture", gis: "National GIS", telemetryLabel: "IoT & telemetry",
    decisionsLabel: "Decisions", automation: "Automation", ai: "AI Insights", evidenceLabel: "Evidence",
    updated: "Updated", review: "Review queue", national: "National coverage", activeProjects: "Active projects", openProject: "Open", viewSite: "View on map", noProjects: "No operational projects",
    readinessTitle: "Runtime readiness", runtime: "Runtime", database: "Database", aiMode: "AI", weather: "Weather", satelliteLabel: "Satellite", automationLabel: "Automation", assurance: "Assurance still to prove", notCertified: "Not production certified",
    setupTitle: "Initialize operational data", setupBody: "Create your first real site, project, water resource and parcel.", setupAction: "Set up now",
    managedTitle: "Start with what you manage", managedIntro: "Choose the operational object. FOGGARA then opens its data, analysis, decisions and actions in the same context.", landAsset: "Field / land", landBody: "Boundary · satellite · soil · irrigation", waterAsset: "Water resource", waterBody: "Well · reservoir · pumping · quality", projectAsset: "Project", projectBody: "Data · evidence · decisions · actions", deviceAsset: "Equipment / sensor", deviceBody: "Devices · sensors · telemetry · Edge",
    actionsTitle: "Operational services", analysisAction: "Analysis center", drawField: "Draw a field", satelliteAction: "Analyze Sentinel", irrigationAction: "Calculate irrigation", iotAction: "Devices & readings", projectData: "Measurements & evidence", decisionAction: "Build a decision", serviceAction: "Request a service", metrologyAction: "Metrology & calibration",
  } : {
    eyebrow: "مركز القيادة الوطني · WEFEH",
    title: "أدِر موردًا، أثبت بياناته، ثم قرّر ونفّذ.",
    intro: "FOGGARA-DZ تربط الإقليم وموارد WEFEH والبيانات الموثقة والتحليل والقرار والتنفيذ والمتابعة داخل سياق تشغيلي واحد.",
    live: "بيانات مترابطة", projects: "المشاريع", sites: "المواقع", telemetry: "القياسات الأخيرة",
    decisions: "قرارات تنتظر المراجعة", evidence: "أدلة تنتظر المراجعة", infrastructure: "الأجهزة والحساسات",
    open: "فتح", domains: "مساحات العمل التشغيلية", flow: "سلسلة القرار في FOGGARA",
    activity: "الحالة التشغيلية", noData: "لا توجد بيانات", unavailable: "غير متاح",
    water: "المياه", agriculture: "الزراعة", gis: "GIS الوطني", telemetryLabel: "IoT والقياسات",
    decisionsLabel: "القرارات", automation: "الأتمتة", ai: "ذكاء وتحليلات AI", evidenceLabel: "الأدلة",
    updated: "آخر تحديث", review: "طابور المراجعة", national: "التغطية الوطنية", activeProjects: "المشاريع النشطة", openProject: "فتح", viewSite: "عرض على الخريطة", noProjects: "لا توجد مشاريع تشغيلية",
    readinessTitle: "جاهزية التشغيل", runtime: "التشغيل", database: "قاعدة البيانات", aiMode: "الذكاء", weather: "الطقس", satelliteLabel: "الأقمار الصناعية", automationLabel: "الأتمتة", assurance: "ضمانات لم تُثبت بعد", notCertified: "غير معتمد كإنتاج كامل",
    setupTitle: "ابدأ التشغيل ببيانات حقيقية", setupBody: "أنشئ أول موقع ومشروع ومورد ماء وقطعة زراعية مرتبطة بمؤسستك.", setupAction: "تهيئة مساحة العمل",
    managedTitle: "ابدأ بما تديره فعليًا", managedIntro: "اختر الأصل أو المورد؛ بعدها تفتح FOGGARA بياناته وتحليلاته وقراراته وإجراءاته في نفس السياق.", landAsset: "أرض / قطعة زراعية", landBody: "حدود · أقمار · تربة · ري", waterAsset: "مورد مائي", waterBody: "بئر · خزان · ضخ · جودة", projectAsset: "مشروع", projectBody: "بيانات · أدلة · قرارات · إجراءات", deviceAsset: "جهاز / حساس", deviceBody: "أجهزة · حساسات · Telemetry · Edge",
    actionsTitle: "خدمات تشغيل مباشرة", analysisAction: "مركز التحاليل", drawField: "حدد أرضًا على الخريطة", satelliteAction: "حلّل Sentinel", irrigationAction: "احسب الري", iotAction: "أجهزة وحساسات وقراءات", projectData: "قياسات وأدلة المشروع", decisionAction: "ابنِ قرارًا", serviceAction: "اطلب خدمة", metrologyAction: "المعايرة والقياس",
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
        api.get<Readiness>("/system/readiness"),
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
      setReadiness(value<Readiness>(8));
      setUpdatedAt(new Date());
    };
    void load();
  }, [user?.role]);

  const realProjects = useMemo(
    () => snapshot.projects?.filter((project) => !project.is_demo) ?? null,
    [snapshot.projects],
  );
  const realSites = useMemo(
    () => snapshot.sites?.filter((entry) => !entry.site.is_demo) ?? null,
    [snapshot.sites],
  );
  const realDecisions = useMemo(
    () => snapshot.decisions?.filter((decision) => !decision.is_demo) ?? null,
    [snapshot.decisions],
  );

  const counts = useMemo(() => ({
    projects: realProjects?.length,
    sites: realSites?.length,
    telemetry: snapshot.telemetry?.length,
    decisions: realDecisions?.length,
    evidence: snapshot.pending
      ? snapshot.pending.measurements.length + snapshot.pending.evidences.length
      : undefined,
    infrastructure: snapshot.devices && snapshot.sensors
      ? snapshot.devices.length + snapshot.sensors.length
      : undefined,
  }), [snapshot.telemetry, snapshot.pending, snapshot.devices, snapshot.sensors, realProjects, realSites, realDecisions]);

  const cards = [
    { label: copy.projects, value: counts.projects, to: "/app/projects", icon: FolderKanban },
    { label: copy.sites, value: counts.sites, to: "/app/gis", icon: MapPinned },
    { label: copy.telemetry, value: counts.telemetry, to: "/app/telemetry", icon: Activity },
    { label: copy.decisions, value: counts.decisions, to: "/app/decisions", icon: ClipboardCheck },
    { label: copy.evidence, value: counts.evidence, to: "/app/review", icon: ShieldCheck },
    { label: copy.infrastructure, value: counts.infrastructure, to: "/app/iot", icon: Radio },
  ];

  const flow = lang === "fr"
    ? ["Ressource", "Données", "Structure", "Analyse", "Règles", "Intelligence", "Décision", "Action", "Suivi", "Preuve", "Apprentissage"]
    : lang === "en"
      ? ["Resource", "Data", "Structure", "Analysis", "Rules", "Intelligence", "Decision", "Action", "Monitoring", "Evidence", "Learning"]
      : ["المورد", "البيانات", "الهيكلة", "التحليل", "القواعد", "الذكاء", "القرار", "الإجراء", "المتابعة", "الدليل", "التعلّم"];

  const readinessLabels: Record<string, string> = lang === "fr" ? {
    healthy: "Sain", degraded: "Dégradé", up: "Connectée", down: "Indisponible",
    configured: "Configuré", deterministic: "Déterministe", available: "Disponible", "adapter-configured": "Adaptateur configuré", disabled: "Désactivé",
    "web-runtime-enabled": "Runtime web actif", "web-runtime-disabled": "Runtime web désactivé",
    local: "Local souverain", external: "Externe", optional: "Optionnel",
  } : lang === "en" ? {
    healthy: "Healthy", degraded: "Degraded", up: "Up", down: "Down",
    configured: "Configured", deterministic: "Deterministic", available: "Available", "adapter-configured": "Adapter configured", disabled: "Disabled",
    "web-runtime-enabled": "Web runtime enabled", "web-runtime-disabled": "Web runtime disabled",
    local: "Sovereign local", external: "External", optional: "Optional",
  } : {
    healthy: "سليم", degraded: "متدهور", up: "متصل", down: "غير متاح",
    configured: "مهيأ", deterministic: "حتمي", available: "متاح", "adapter-configured": "المهايئ مهيأ", disabled: "معطل",
    "web-runtime-enabled": "تشغيل الويب مفعل", "web-runtime-disabled": "تشغيل الويب معطل",
    local: "محلي سيادي", external: "خارجي", optional: "اختياري",
  };
  const gateLabels: Record<string, string> = lang === "fr" ? {
    backup_restore: "Sauvegarde / restauration", hosted_tls_proxy: "TLS / proxy hébergé",
    load_capacity: "Charge / capacité", incident_response: "Réponse aux incidents",
    legal_privacy_approval: "Validation juridique / vie privée",
  } : lang === "en" ? {
    backup_restore: "Backup / restore", hosted_tls_proxy: "Hosted TLS / proxy",
    load_capacity: "Load / capacity", incident_response: "Incident response",
    legal_privacy_approval: "Legal / privacy approval",
  } : {
    backup_restore: "النسخ والاستعادة", hosted_tls_proxy: "TLS والبروكسي المستضاف",
    load_capacity: "الحمولة والسعة", incident_response: "الاستجابة للحوادث",
    legal_privacy_approval: "الاعتماد القانوني والخصوصية",
  };
  const readinessLabel = (value: string) => readinessLabels[value] ?? value;

  const workspaceBody = lang === "fr" ? {
    water: "Ressources · pompage · allocation", agriculture: "Sol · culture · irrigation",
    gis: "Sites · projets · couches nationales", telemetry: "Appareils · capteurs · flux",
    decisions: "Preuves → revue → action", automation: "Tâches · règles · suivi",
    evidence: "Observé · vérifié · calculé", ai: "Portefeuille · risques · prochaines actions",
  } : lang === "en" ? {
    water: "Resources · pumping · allocation", agriculture: "Soil · crop · irrigation",
    gis: "National sites · projects · layers", telemetry: "Devices · sensors · streams",
    decisions: "Evidence → review → action", automation: "Jobs · rules · monitoring",
    evidence: "Observed · verified · computed", ai: "Portfolio · risks · next actions",
  } : {
    water: "الموارد · الضخ · التخصيص", agriculture: "التربة · المحصول · الري",
    gis: "المواقع · المشاريع · الطبقات الوطنية", telemetry: "الأجهزة · الحساسات · التدفقات",
    decisions: "الأدلة ← المراجعة ← الإجراء", automation: "المهام · القواعد · المتابعة",
    evidence: "مرصود · متحقق · محسوب", ai: "المحفظة · المخاطر · الإجراءات التالية",
  };
  const workspaces = [
    { label: copy.water, body: workspaceBody.water, to: "/app/water", icon: Droplets },
    { label: copy.agriculture, body: workspaceBody.agriculture, to: "/app/agriculture", icon: Sprout },
    { label: copy.gis, body: workspaceBody.gis, to: "/app/gis", icon: MapPinned },
    { label: copy.telemetryLabel, body: workspaceBody.telemetry, to: "/app/telemetry", icon: Gauge },
    { label: copy.decisionsLabel, body: workspaceBody.decisions, to: "/app/decisions", icon: ClipboardCheck },
    { label: copy.automation, body: workspaceBody.automation, to: "/app/automation", icon: Workflow },
    { label: copy.evidenceLabel, body: workspaceBody.evidence, to: "/app/review", icon: ShieldCheck },
    { label: copy.ai, body: workspaceBody.ai, to: "/app/insights", icon: Bot },
  ];

  const managedObjects = [
    { label: copy.landAsset, body: copy.landBody, to: "/app/gis", icon: MapPinned, code: "LAND" },
    { label: copy.waterAsset, body: copy.waterBody, to: "/app/water", icon: Droplets, code: "WATER" },
    { label: copy.projectAsset, body: copy.projectBody, to: "/app/projects", icon: FolderKanban, code: "PROJECT" },
    { label: copy.deviceAsset, body: copy.deviceBody, to: "/app/iot", icon: Radio, code: "IOT" },
  ];

  const operationalActions = [
    { label: copy.analysisAction, to: "/app/analysis", icon: Gauge, code: "ANL" },
    { label: copy.drawField, to: "/app/gis", icon: MapPinned, code: "MAP" },
    { label: copy.satelliteAction, to: "/app/gis", icon: Satellite, code: "EO" },
    { label: copy.irrigationAction, to: "/app/agriculture?section=irrigation", icon: Droplets, code: "IRR" },
    { label: copy.iotAction, to: "/app/iot", icon: Radio, code: "IOT" },
    { label: copy.projectData, to: "/app/projects", icon: FolderKanban, code: "DATA" },
    { label: copy.decisionAction, to: "/app/studio", icon: ClipboardCheck, code: "DEC" },
    { label: copy.serviceAction, to: "/app/services", icon: Workflow, code: "SRV" },
    { label: copy.metrologyAction, to: "/app/metrology", icon: Gauge, code: "MET" },
  ];

  const recent = snapshot.telemetry?.slice(0, 5) ?? [];
  const recentProjects = [...(realProjects ?? [])]
    .filter((project) => project.status !== "closed")
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 6);
  const projectSite = (project: Project) =>
    project.site_id == null ? null : realSites?.find((row) => row.site.id === project.site_id)?.site ?? null;
  const needsSetup = realProjects !== null && realSites !== null && realProjects.length === 0 && realSites.length === 0;

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

      <section className="fg-command-managed" data-testid="managed-object-launcher" aria-label={copy.managedTitle}>
        <div className="fg-command-section-title">
          <div><span>RESOURCE / ASSET FIRST</span><h2>{copy.managedTitle}</h2><p>{copy.managedIntro}</p></div>
          <Layers3 size={24}/>
        </div>
        <div className="fg-command-managed-grid">
          {managedObjects.map(({ label, body, to, icon: Icon, code }) => (
            <Link key={code} to={to} className="fg-command-managed-card">
              <span className="fg-command-managed-icon"><Icon size={21}/></span>
              <div><strong>{label}</strong><small>{body}</small></div>
              <ArrowUpRight size={16}/>
            </Link>
          ))}
        </div>
      </section>

      {needsSetup && <section className="fg-command-section" aria-label={copy.setupTitle}>
        <div className="fg-command-section-title"><div><span>PRODUCTION / REAL DATA</span><h2>{copy.setupTitle}</h2><p>{copy.setupBody}</p></div><MapPinned size={26}/></div>
        <Link to="/app/setup" className="fg-command-workspace"><Sprout size={23}/><div><strong>{copy.setupAction}</strong><small>Site · Project · Water · Parcel</small></div><ArrowUpRight size={15}/></Link>
      </section>}

      <section className="fg-command-kpis fg-command-kpis-secondary" aria-label={copy.activity}>
        {cards.map(({ label, value, to, icon: Icon }) => (
          <Link to={to} className="fg-command-kpi" key={label}>
            <div><Icon size={18} /><span>{label}</span></div>
            <strong>{value === undefined ? "—" : value}</strong>
            <ArrowUpRight size={15} />
          </Link>
        ))}
      </section>

      <section className="fg-command-actions" data-testid="operational-service-launcher" aria-label={copy.actionsTitle}>
        <div className="fg-command-section-title">
          <div><span>ACTION / SERVICE</span><h2>{copy.actionsTitle}</h2></div>
          <Zap size={24}/>
        </div>
        <div className="fg-command-action-grid">
          {operationalActions.map(({ label, to, icon: Icon, code }) => (
            <Link key={code} to={to}>
              <span><Icon size={18}/><b>{code}</b></span>
              <strong>{label}</strong>
              <ArrowUpRight size={15}/>
            </Link>
          ))}
        </div>
      </section>

      <section className="fg-command-readiness" data-testid="runtime-readiness" aria-label={copy.readinessTitle}>
        <div className="fg-command-section-title">
          <div><span>RUNTIME / EVIDENCE OF OPERATION</span><h2>{copy.readinessTitle}</h2></div>
          <ShieldCheck size={26}/>
        </div>
        {readiness ? <>
          <div className="fg-readiness-grid">
            <article className={readiness.runtime_status === "healthy" ? "ok" : "warn"}>
              <span>{copy.runtime}</span><strong>{readinessLabel(readiness.runtime_status)}</strong>
              <small>{readiness.deployment_mode.toUpperCase()} · v{readiness.core.environment.app_version}</small>
            </article>
            <article className={readiness.core.database.status === "up" ? "ok" : "warn"}>
              <span>{copy.database}</span><strong>{readinessLabel(readiness.core.database.status)}</strong>
              <small dir="ltr">{readiness.core.database.engine} · {readiness.core.database.latency_ms} ms · {readiness.core.database.schema_revision}</small>
            </article>
            <article className={readiness.integrations.ai.status === "configured" ? "ok" : ""}>
              <span>{copy.aiMode}</span><strong>{readinessLabel(readiness.integrations.ai.mode)}</strong>
              <small>{readiness.integrations.ai.data_boundary}</small>
            </article>
            <article className={readiness.integrations.weather.status === "configured" ? "ok" : ""}>
              <span>{copy.weather}</span><strong>{readinessLabel(readiness.integrations.weather.status)}</strong>
              <small>{readiness.integrations.weather.provider ?? readinessLabel("optional")}</small>
            </article>
            <article className="ok">
              <span>{copy.satelliteLabel}</span><strong>{readinessLabel(readiness.integrations.satellite.status)}</strong>
              <small>{readiness.integrations.satellite.provenance}</small>
            </article>
            <article className={readiness.integrations.automation.web_runtime_enabled ? "ok" : ""}>
              <span>{copy.automationLabel}</span><strong>{readinessLabel(readiness.integrations.automation.status)}</strong>
              <small>{readiness.integrations.automation.external_worker_observed ? (lang === "fr" ? "worker observé" : lang === "en" ? "worker observed" : "worker مرصود") : (lang === "fr" ? "worker externe non observé" : lang === "en" ? "external worker not observed" : "لم يُرصد worker خارجي")}</small>
            </article>
          </div>
          <div className="fg-readiness-assurance">
            <div><strong>{copy.assurance}</strong><span>{copy.notCertified}</span></div>
            <ul>{readiness.assurance_gates.map(gate => <li key={gate.key}><span>{gateLabels[gate.key] ?? gate.key}</span><b>{gate.status}</b></li>)}</ul>
          </div>
        </> : <p className="fg-command-empty">{copy.unavailable}</p>}
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
                  <span className="fg-command-project-domain">{t(`landing.${project.domain}`, project.domain)}</span>
                  <Link to={`/app/projects/${project.id}`}><strong>{project.title}</strong></Link>
                  <small>{site ? `${site.name} · ${site.wilaya}` : "—"} · {t(`project.statuses.${project.status}`, project.status)}</small>
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
          sites={realSites ?? []}
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
        <div><span>{flow[0]} → {flow[flow.length - 1]}</span><h2>{copy.flow}</h2></div>
        <ol>
          {flow.map((step, index) => (
            <li key={step}><b>{String(index + 1).padStart(2, "0")}</b><span>{step}</span></li>
          ))}
        </ol>
      </section>
    </div>
  );
}
