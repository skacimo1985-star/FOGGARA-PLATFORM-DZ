import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { GisSite, Project, WilayaMeta } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorText, DemoBadge } from "@/components/common";
import { NationalMap, type AnalysisRasterOverlay, type ParcelBoundaryFeature, type SatelliteScene } from "@/components/NationalMap";
import "./command-center.css";

type SpatialFeature = {
  type: "Feature";
  id: number;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id: number;
    name: string;
    wilaya: string;
    commune: string | null;
    is_demo: boolean;
    distance_m?: number;
  };
};

type ParcelBoundariesGeoJSON = {
  type: "FeatureCollection";
  features: ParcelBoundaryFeature[];
  metadata: {
    organization_scoped: boolean;
    count: number;
    crs: string;
    spatial_engine: string;
    geometry_type: "Polygon";
  };
};

type SitesGeoJSON = {
  type: "FeatureCollection";
  features: SpatialFeature[];
  metadata: {
    organization_scoped: boolean;
    count: number;
    crs: string;
    spatial_engine: string;
  };
};

type RemoteIndex = "ndvi" | "evi" | "savi" | "ndwi";

type RasterAnalysis = {
  scene_id: string;
  index: RemoteIndex;
  formula_version: string;
  processing_plan_fingerprint: string;
  analysis_bbox_wgs84: [number, number, number, number];
  grid: {
    crs: string;
    width: number;
    height: number;
    resolution_m: number;
  };
  mask: {
    method: string;
    masked_scl_classes: number[];
    cloud_masked_pixel_count: number;
    source_nodata_pixel_count: number;
    formula_nodata_pixel_count: number;
  };
  pixels: {
    total: number;
    valid: number;
    masked: number;
    valid_fraction: number;
  };
  statistics: {
    min: number | null;
    max: number | null;
    mean: number | null;
    median: number | null;
  };
  provenance: {
    provider_metadata: string;
    derived_index: string;
    verified: boolean;
    persisted: boolean;
  };
};

function rasterBudget(bbox: [number, number, number, number]) {
  const [west, south, east, north] = bbox;
  const valid = [west, south, east, north].every(Number.isFinite)
    && west >= -180 && east <= 180 && south >= -90 && north <= 90
    && west < east && south < north;
  if (!valid) {
    return { allowed: false, pixels: 0, width: 0, height: 0, areaKm2: 0 };
  }
  const midLat = ((south + north) / 2) * Math.PI / 180;
  const widthM = (east - west) * 111_320 * Math.max(Math.cos(midLat), 0.01);
  const heightM = (north - south) * 110_574;
  const width = Math.max(1, Math.ceil(widthM / 10));
  const height = Math.max(1, Math.ceil(heightM / 10));
  const pixels = width * height;
  return {
    allowed: width <= 2048 && height <= 2048 && pixels <= 1_000_000,
    pixels,
    width,
    height,
    areaKm2: Math.max(0, (widthM * heightM) / 1_000_000),
  };
}

export default function Gis() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<GisSite[] | null>(null);
  const [wilayas, setWilayas] = useState<WilayaMeta[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const wilayaFilter = searchParams.get("wilaya") || "";
  const requestedSiteId = Number(searchParams.get("site"));
  const requestedProjectId = Number(searchParams.get("project"));
  const requestedParcelId = Number(searchParams.get("parcel"));
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(
    Number.isInteger(requestedSiteId) && requestedSiteId > 0 ? requestedSiteId : null,
  );
  const [selectedParcelId, setSelectedParcelId] = useState<number | null>(
    Number.isInteger(requestedParcelId) && requestedParcelId > 0 ? requestedParcelId : null,
  );
  const [nearest, setNearest] = useState<SpatialFeature[]>([]);
  const [spatialEngine, setSpatialEngine] = useState("—");
  const [error, setError] = useState<unknown>(null);
  const [satelliteScenes, setSatelliteScenes] = useState<SatelliteScene[]>([]);
  const [parcelBoundaries, setParcelBoundaries] = useState<ParcelBoundaryFeature[]>([]);
  const [satelliteLoading, setSatelliteLoading] = useState(false);
  const [satelliteError, setSatelliteError] = useState<unknown>(null);
  const [viewportBbox, setViewportBbox] = useState<[number, number, number, number]>([-8.8, 18.4, 12.2, 37.5]);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const defaultStart = useMemo(() => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - 30);
    return date.toISOString().slice(0, 10);
  }, []);
  const [sceneStart, setSceneStart] = useState(defaultStart);
  const [sceneEnd, setSceneEnd] = useState(today);
  const [cloudCover, setCloudCover] = useState(25);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<RemoteIndex>("ndvi");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<unknown>(null);
  const [analysisResult, setAnalysisResult] = useState<RasterAnalysis | null>(null);
  const [analysisOverlay, setAnalysisOverlay] = useState<AnalysisRasterOverlay | null>(null);
  const [projectContext, setProjectContext] = useState<Project | null>(null);

  useEffect(() => {
    if (Number.isInteger(requestedProjectId) && requestedProjectId > 0) {
      api.get<Project>(`/projects/${requestedProjectId}`)
        .then((project) => {
          setProjectContext(project);
          if (!(Number.isInteger(requestedSiteId) && requestedSiteId > 0) && project.site_id) {
            setSelectedSiteId(project.site_id);
          }
        })
        .catch(() => setProjectContext(null));
    } else {
      setProjectContext(null);
    }
  }, [requestedProjectId, requestedSiteId]);

  useEffect(() => {
    api.get<{ count: number; sites: GisSite[] }>("/gis/sites")
      .then((r) => setData(r.sites))
      .catch(setError);
    api.get<{ count: number; wilayas: WilayaMeta[] }>("/meta/wilayas")
      .then((r) => setWilayas(r.wilayas))
      .catch(() => setWilayas([]));
    api.get<SitesGeoJSON>("/gis/sites.geojson")
      .then((r) => setSpatialEngine(r.metadata.spatial_engine))
      .catch(setError);
    api.get<ParcelBoundariesGeoJSON>("/gis/parcels.geojson")
      .then((r) => setParcelBoundaries(r.features))
      .catch(() => setParcelBoundaries([]));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return null;
    if (!wilayaFilter) return data;
    const w = wilayas.find((x) => x.code === wilayaFilter);
    const names = [wilayaFilter, ...(w ? [w.ar, w.fr, w.en] : [])].map((name) => name.trim().toLocaleLowerCase());
    return data.filter((g) => names.includes(g.site.wilaya.trim().toLocaleLowerCase()));
  }, [data, wilayaFilter, wilayas]);

  const locale = i18n.language;
  const lang = locale === "fr" ? "fr" : locale === "en" ? "en" : "ar";
  const copy = lang === "fr"
    ? { eyebrow: "SIG NATIONAL · FOGGARA-DZ", title: "Territoire, ressources et projets dans une vue opérationnelle.", sites: "Sites visibles", projects: "Projets", resources: "Ressources", layers: "Couches opérationnelles", table: "Registre spatial", all: "Toute l’Algérie", selected: "Site sélectionné", nearest: "Sites les plus proches", distance: "Distance", engine: "Moteur spatial", noNearby: "Aucun autre site à proximité" }
    : lang === "en"
      ? { eyebrow: "NATIONAL GIS · FOGGARA-DZ", title: "Territory, resources and projects in one operational view.", sites: "Visible sites", projects: "Projects", resources: "Resources", layers: "Operational layers", table: "Spatial register", all: "All Algeria", selected: "Selected site", nearest: "Nearest sites", distance: "Distance", engine: "Spatial engine", noNearby: "No other nearby sites" }
      : { eyebrow: "GIS الوطني · FOGGARA-DZ", title: "الإقليم والموارد والمشاريع في رؤية تشغيلية واحدة.", sites: "المواقع الظاهرة", projects: "المشاريع", resources: "الموارد", layers: "الطبقات التشغيلية", table: "السجل المكاني", all: "كل الجزائر", selected: "الموقع المحدد", nearest: "أقرب المواقع", distance: "المسافة", engine: "المحرك المكاني", noNearby: "لا توجد مواقع قريبة أخرى" };

  const contextCopy = lang === "fr"
    ? { label: "CONTEXTE OPÉRATIONNEL", project: "Projet", site: "Site", parcel: "Parcelle", open: "Ouvrir le projet", openParcel: "Ouvrir la parcelle", mode: "Le SIG conserve le contexte pendant l’analyse spatiale et satellite." }
    : lang === "en"
      ? { label: "OPERATIONAL CONTEXT", project: "Project", site: "Site", parcel: "Parcel", open: "Open project", openParcel: "Open parcel", mode: "GIS keeps project context while you work with spatial and satellite analysis." }
      : { label: "السياق التشغيلي", project: "المشروع", site: "الموقع", parcel: "القطعة", open: "فتح المشروع", openParcel: "فتح القطعة", mode: "يحافظ GIS على سياق المشروع أثناء التحليل المكاني والفضائي." };

  const satelliteCopy = lang === "fr"
    ? { title: "Catalogue satellite en direct", provider: "Sentinel-2 L2A · Element 84 Earth Search", start: "Du", end: "Au", clouds: "Nuages max.", search: "Rechercher dans la vue", searching: "Recherche…", found: "scènes trouvées", empty: "Aucune scène dans la vue et la période choisies.", metadata: "Métadonnées fournisseur observées — aucune valeur NDVI n’est inventée." }
    : lang === "en"
      ? { title: "Live satellite catalogue", provider: "Sentinel-2 L2A · Element 84 Earth Search", start: "From", end: "To", clouds: "Max clouds", search: "Search current view", searching: "Searching…", found: "scenes found", empty: "No scenes found for the current view and period.", metadata: "Observed provider metadata — no NDVI value is invented." }
      : { title: "كتالوج الأقمار الصناعية الحي", provider: "Sentinel-2 L2A · Element 84 Earth Search", start: "من", end: "إلى", clouds: "أقصى غيوم", search: "ابحث في نطاق الخريطة", searching: "جارٍ البحث…", found: "مشاهد موجودة", empty: "لا توجد مشاهد في النطاق والفترة المحددين.", metadata: "بيانات وصفية حقيقية من المزود — لا يتم اختراع أي قيمة NDVI." };

  const analysisCopy = lang === "fr"
    ? { title: "Analyse satellite réelle", scene: "Scène", index: "Indice", run: "Analyser la vue", running: "Analyse…", zoom: "Zoomez davantage sur la parcelle avant l’analyse.", ready: "Zone prête", area: "zone estimée", pixels: "pixels 10 m", mean: "Moyenne", median: "Médiane", min: "Minimum", max: "Maximum", valid: "Pixels valides", masked: "Masqués", computed: "COMPUTED", notVerified: "NON VÉRIFIÉ", selectScene: "Sélectionnez une scène Sentinel-2.", note: "Calcul en direct depuis les COG Sentinel-2 avec masque SCL. Aucun résultat n’est enregistré ni déclaré vérifié." }
    : lang === "en"
      ? { title: "Real satellite analysis", scene: "Scene", index: "Index", run: "Analyze current view", running: "Analyzing…", zoom: "Zoom further into the field before analysis.", ready: "Area ready", area: "estimated area", pixels: "10 m pixels", mean: "Mean", median: "Median", min: "Minimum", max: "Maximum", valid: "Valid pixels", masked: "Masked", computed: "COMPUTED", notVerified: "NOT VERIFIED", selectScene: "Select a Sentinel-2 scene.", note: "Computed live from Sentinel-2 COGs with SCL masking. Results are neither persisted nor marked verified." }
      : { title: "التحليل الفضائي الحقيقي", scene: "المشهد", index: "المؤشر", run: "حلّل نطاق الخريطة", running: "جارٍ التحليل…", zoom: "كبّر الخريطة أكثر إلى مستوى الحقل قبل التحليل.", ready: "النطاق جاهز", area: "المساحة التقديرية", pixels: "بكسلات 10م", mean: "المتوسط", median: "الوسيط", min: "الأدنى", max: "الأعلى", valid: "البكسلات الصالحة", masked: "المحجوبة", computed: "COMPUTED", notVerified: "غير متحقق", selectScene: "اختر مشهد Sentinel-2 أولًا.", note: "حساب حي من ملفات Sentinel-2 COG مع قناع SCL. النتائج لا تُخزن ولا تُصنّف VERIFIED." };

  const summary = useMemo(() => {
    const rows = filtered ?? [];
    return {
      sites: rows.length,
      projects: rows.reduce((n, row) => n + row.projects.length, 0),
      resources: rows.reduce((n, row) => n + row.resources.length, 0),
      assets: rows.reduce((n, row) => n + row.assets.length, 0),
    };
  }, [filtered]);

  const selectWilaya = (code: string) => {
    const next = new URLSearchParams(searchParams);
    if (code) next.set("wilaya", code);
    else next.delete("wilaya");
    setSearchParams(next);
  };

  const selectedSite = useMemo(
    () => (data ?? []).find((entry) => entry.site.id === selectedSiteId) ?? null,
    [data, selectedSiteId],
  );

  const selectedScene = useMemo(
    () => satelliteScenes.find((scene) => scene.id === selectedSceneId) ?? null,
    [satelliteScenes, selectedSceneId],
  );
  const selectedParcel = useMemo(
    () => parcelBoundaries.find((feature) => feature.id === selectedParcelId) ?? null,
    [parcelBoundaries, selectedParcelId],
  );

  useEffect(() => {
    const siteId = selectedParcel?.properties.site_id ?? null;
    if (!siteId || selectedSiteId === siteId) return;
    setSelectedSiteId(siteId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("site", String(siteId));
    setSearchParams(nextParams, { replace: true });
  }, [selectedParcel, selectedSiteId, searchParams, setSearchParams]);

  const currentRasterBudget = useMemo(() => rasterBudget(viewportBbox), [viewportBbox]);

  useEffect(() => {
    setAnalysisResult(null);
    setAnalysisError(null);
    setAnalysisOverlay(null);
  }, [selectedSceneId, selectedIndex]);

  useEffect(() => {
    return () => {
      if (analysisOverlay?.url) URL.revokeObjectURL(analysisOverlay.url);
    };
  }, [analysisOverlay?.url]);


  const searchSatelliteScenes = async () => {
    setSatelliteLoading(true);
    setSatelliteError(null);
    try {
      const bbox = viewportBbox.map((value) => Number(value.toFixed(6))).join(",");
      const params = new URLSearchParams({
        bbox,
        start: sceneStart,
        end: sceneEnd,
        cloud_cover_lte: String(cloudCover),
        limit: "30",
      });
      const result = await api.get<{ count: number; scenes: SatelliteScene[] }>(
        `/remote-sensing/catalog/scenes?${params.toString()}`,
      );
      setSatelliteScenes(result.scenes);
      setSelectedSceneId((current) => result.scenes.some((scene) => scene.id === current) ? current : null);
      setAnalysisResult(null);
      setAnalysisOverlay(null);
    } catch (err) {
      setSatelliteScenes([]);
      setSatelliteError(err);
    } finally {
      setSatelliteLoading(false);
    }
  };

  const analyzeCurrentView = async () => {
    if (!selectedSceneId || !currentRasterBudget.allowed) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    try {
      const params = new URLSearchParams({
        index: selectedIndex,
        bbox: viewportBbox.map((value) => Number(value.toFixed(6))).join(","),
      });
      const result = await api.get<RasterAnalysis>(
        `/remote-sensing/catalog/scenes/${encodeURIComponent(selectedSceneId)}/statistics?${params.toString()}`,
      );
      const preview = await api.getBlob(
        `/remote-sensing/catalog/scenes/${encodeURIComponent(selectedSceneId)}/preview.png?${params.toString()}`,
        60_000,
      );
      const previewUrl = URL.createObjectURL(preview);
      setAnalysisResult(result);
      setAnalysisOverlay({
        url: previewUrl,
        bbox: result.analysis_bbox_wgs84,
        index: result.index,
      });
    } catch (err) {
      setAnalysisResult(null);
      setAnalysisError(err);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const selectParcel = (parcelId: number) => {
    setSelectedParcelId(parcelId);
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("parcel", String(parcelId));
    const feature = parcelBoundaries.find((row) => row.id === parcelId);
    if (feature?.properties.site_id) nextParams.set("site", String(feature.properties.site_id));
    setSearchParams(nextParams, { replace: true });
    if (feature?.properties.site_id) void selectSite(feature.properties.site_id, nextParams);
  };

  const selectSite = async (siteId: number, contextParams?: URLSearchParams) => {
    setSelectedSiteId(siteId);
    const nextParams = contextParams ? new URLSearchParams(contextParams) : new URLSearchParams(searchParams);
    nextParams.set("site", String(siteId));
    if (Number.isInteger(requestedProjectId) && requestedProjectId > 0) nextParams.set("project", String(requestedProjectId));
    setSearchParams(nextParams, { replace: true });
    const entry = (data ?? []).find((row) => row.site.id === siteId);
    if (!entry) {
      setNearest([]);
      return;
    }
    try {
      const result = await api.get<{ count: number; items: SpatialFeature[] }>(
        `/gis/sites/nearest?lon=${entry.site.lon}&lat=${entry.site.lat}&limit=6`,
      );
      setNearest(result.items.filter((item) => item.properties.id !== siteId).slice(0, 5));
    } catch (err) {
      setNearest([]);
      setError(err);
    }
  };

  return (
    <div className="fg-command-center fg-gis-workspace" dir={i18n.dir()}>
      <section className="fg-gis-heading">
        <div>
          <p className="fg-command-eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
        </div>
        <select
          aria-label={t("gis.filterWilaya")}
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={wilayaFilter}
          onChange={(e) => selectWilaya(e.target.value)}
        >
          <option value="">{copy.all}</option>
          {wilayas.map((w) => (
            <option key={w.code} value={w.code}>
              {w.code} — {locale === "fr" ? w.fr : locale === "en" ? w.en : w.ar}
            </option>
          ))}
        </select>
      </section>

      {projectContext ? (
        <section data-testid="gis-operational-context" className="rounded-2xl border border-emerald-500/25 bg-gradient-to-r from-emerald-500/10 via-background to-sky-500/10 p-4 shadow-sm" aria-label={contextCopy.label}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">{contextCopy.label}</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <strong className="text-base">{contextCopy.project}: {projectContext.title}</strong>
                <Badge variant="outline">#{projectContext.id}</Badge>
                <Badge variant="secondary">{t(`landing.${projectContext.domain}`, projectContext.domain)}</Badge>
                <Badge variant="outline">{t(`project.statuses.${projectContext.status}`, projectContext.status)}</Badge>
                {projectContext.is_demo ? <DemoBadge show /> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {contextCopy.site}: {selectedSite?.site.name ?? (projectContext.site_id ? `#${projectContext.site_id}` : t("common.none"))} · {contextCopy.mode}
              </p>
            </div>
            <Link
              to={`/app/projects/${projectContext.id}`}
              className="inline-flex items-center justify-center rounded-md border bg-background px-4 py-2 text-sm font-semibold shadow-sm transition hover:bg-accent"
            >
              {contextCopy.open}
            </Link>
          </div>
        </section>
      ) : null}

      <ErrorText error={error} />

      <section className="fg-command-kpis" aria-label={copy.layers}>
        <div className="fg-command-kpi"><div><span>{copy.sites}</span></div><strong>{filtered === null ? "—" : summary.sites}</strong></div>
        <div className="fg-command-kpi"><div><span>{copy.projects}</span></div><strong>{filtered === null ? "—" : summary.projects}</strong></div>
        <div className="fg-command-kpi"><div><span>{copy.resources}</span></div><strong>{filtered === null ? "—" : summary.resources}</strong></div>
        <div className="fg-command-kpi"><div><span>{t("gis.assets")}</span></div><strong>{filtered === null ? "—" : summary.assets}</strong></div>
      </section>

      <section className="rounded-2xl border bg-card p-4 shadow-sm" aria-label={satelliteCopy.title}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-600">{satelliteCopy.provider}</p>
            <h2 className="mt-1 text-lg font-bold">{satelliteCopy.title}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{satelliteCopy.metadata}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-4">
            <label className="grid gap-1 text-xs font-medium">
              <span>{satelliteCopy.start}</span>
              <input className="rounded-md border bg-background px-2 py-2" type="date" value={sceneStart} max={sceneEnd} onChange={(e) => setSceneStart(e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              <span>{satelliteCopy.end}</span>
              <input className="rounded-md border bg-background px-2 py-2" type="date" value={sceneEnd} min={sceneStart} max={today} onChange={(e) => setSceneEnd(e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs font-medium">
              <span>{satelliteCopy.clouds}: {cloudCover}%</span>
              <input className="h-10" type="range" min="0" max="100" step="5" value={cloudCover} onChange={(e) => setCloudCover(Number(e.target.value))} />
            </label>
            <button
              type="button"
              className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={satelliteLoading || !sceneStart || !sceneEnd}
              onClick={() => void searchSatelliteScenes()}
            >
              {satelliteLoading ? satelliteCopy.searching : satelliteCopy.search}
            </button>
          </div>
        </div>
        <ErrorText error={satelliteError} />
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">LIVE STAC</Badge>
          <span>{satelliteScenes.length} {satelliteCopy.found}</span>
          {satelliteScenes.length === 0 && !satelliteLoading ? <span>{satelliteCopy.empty}</span> : null}
        </div>
      </section>

      {data === null && !error ? (
        <Skeleton className="h-[430px] w-full rounded-2xl" />
      ) : (
        <NationalMap
          sites={data ?? []}
          wilayas={wilayas}
          satelliteScenes={satelliteScenes}
          parcelBoundaries={parcelBoundaries}
          analysisOverlay={analysisOverlay}
          selectedSceneId={selectedSceneId}
          selectedWilaya={wilayaFilter}
          selectedSiteId={selectedSiteId}
          selectedParcelId={selectedParcelId}
          onViewportChange={setViewportBbox}
          onSelectScene={(sceneId) => setSelectedSceneId(sceneId)}
          onSelectParcel={(parcelId) => selectParcel(parcelId)}
          onSelectWilaya={(code) => selectWilaya(code === wilayaFilter ? "" : code)}
          onSelectSite={(siteId) => void selectSite(siteId)}
          locale={lang}
        />
      )}

      <section className="rounded-2xl border bg-card p-4 shadow-sm" aria-label={analysisCopy.title}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">{analysisCopy.title}</h2>
              <Badge variant="outline">{analysisCopy.computed}</Badge>
              <Badge variant="outline">{analysisCopy.notVerified}</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{analysisCopy.note}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(220px,1fr)_130px_auto]">
            <label className="grid gap-1 text-xs font-medium">
              <span>{analysisCopy.scene}</span>
              <select
                className="rounded-md border bg-background px-2 py-2"
                value={selectedSceneId ?? ""}
                onChange={(e) => setSelectedSceneId(e.target.value || null)}
              >
                <option value="">{analysisCopy.selectScene}</option>
                {satelliteScenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>{scene.id}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              <span>{analysisCopy.index}</span>
              <select
                className="rounded-md border bg-background px-2 py-2 font-semibold uppercase"
                value={selectedIndex}
                onChange={(e) => setSelectedIndex(e.target.value as RemoteIndex)}
              >
                <option value="ndvi">NDVI</option>
                <option value="evi">EVI</option>
                <option value="savi">SAVI</option>
                <option value="ndwi">NDWI</option>
              </select>
            </label>
            <button
              type="button"
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!selectedSceneId || !currentRasterBudget.allowed || analysisLoading}
              onClick={() => void analyzeCurrentView()}
            >
              {analysisLoading ? analysisCopy.running : analysisCopy.run}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">
            {currentRasterBudget.allowed ? analysisCopy.ready : analysisCopy.zoom}
          </Badge>
          <span className="rounded-md border px-2 py-1 text-muted-foreground">
            {analysisCopy.area}: {currentRasterBudget.areaKm2.toFixed(2)} km²
          </span>
          <span className="rounded-md border px-2 py-1 text-muted-foreground">
            {currentRasterBudget.pixels.toLocaleString(locale)} {analysisCopy.pixels}
          </span>
          {selectedScene ? <span className="rounded-md border px-2 py-1 font-mono text-[11px]">{selectedScene.id}</span> : null}
        </div>

        <ErrorText error={analysisError} />

        {analysisResult ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
            {[
              [analysisCopy.mean, analysisResult.statistics.mean],
              [analysisCopy.median, analysisResult.statistics.median],
              [analysisCopy.min, analysisResult.statistics.min],
              [analysisCopy.max, analysisResult.statistics.max],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border bg-background p-3">
                <span className="text-xs text-muted-foreground">{label}</span>
                <strong className="mt-1 block text-xl tabular-nums" dir="ltr">
                  {typeof value === "number" ? value.toFixed(4) : "—"}
                </strong>
              </div>
            ))}
            <div className="rounded-xl border bg-background p-3">
              <span className="text-xs text-muted-foreground">{analysisCopy.valid}</span>
              <strong className="mt-1 block text-xl tabular-nums" dir="ltr">
                {(analysisResult.pixels.valid_fraction * 100).toFixed(1)}%
              </strong>
            </div>
            <div className="rounded-xl border bg-background p-3">
              <span className="text-xs text-muted-foreground">{analysisCopy.masked}</span>
              <strong className="mt-1 block text-xl tabular-nums" dir="ltr">
                {analysisResult.pixels.masked.toLocaleString(locale)}
              </strong>
            </div>
            <div className="sm:col-span-2 lg:col-span-4 xl:col-span-6 flex flex-wrap gap-2 rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
              <span>{analysisResult.formula_version}</span>
              <span>·</span>
              <span>{analysisResult.grid.resolution_m} m</span>
              <span>·</span>
              <span>{analysisResult.grid.crs}</span>
              <span>·</span>
              <span>{analysisResult.mask.method}</span>
              <span>·</span>
              <strong>{analysisResult.provenance.derived_index}</strong>
            </div>
          </div>
        ) : null}
      </section>

      {satelliteScenes.length > 0 ? (
        <section className="rounded-2xl border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-bold">{satelliteCopy.title}</h2>
            <Badge variant="outline">{satelliteScenes.length}</Badge>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {satelliteScenes.slice(0, 12).map((scene) => (
              <article
                key={scene.id}
                className={`rounded-xl border p-3 text-sm transition-colors ${selectedSceneId === scene.id ? "border-amber-500 bg-amber-50/40" : ""}`}
              >
                <button
                  type="button"
                  className="w-full text-start"
                  aria-pressed={selectedSceneId === scene.id}
                  onClick={() => setSelectedSceneId(scene.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <strong className="break-all text-xs">{scene.id}</strong>
                    <Badge variant="outline">{scene.cloud_cover_pct == null ? "—" : `${Number(scene.cloud_cover_pct).toFixed(1)}% ☁`}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">{scene.datetime ? new Date(scene.datetime).toLocaleString(locale) : "—"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{scene.platform ?? scene.constellation ?? "Sentinel-2"}</p>
                  <p className="mt-2 text-[11px] text-sky-700">{scene.provenance}</p>
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className="fg-gis-spatial-panel" aria-label={copy.selected}>
        <div className="fg-gis-spatial-summary">
          <span>EPSG:4326 · {copy.engine}: <b>{spatialEngine}</b></span>
          {selectedSite ? (
            <>
              <h2>{copy.selected}: {selectedSite.site.name}</h2>
              <p>{selectedSite.site.wilaya}{selectedSite.site.commune ? ` · ${selectedSite.site.commune}` : ""}</p>
              <strong dir="ltr">{selectedSite.site.lat.toFixed(5)}, {selectedSite.site.lon.toFixed(5)}</strong>
              {selectedParcel ? (
                <div data-testid="gis-selected-parcel" className="mt-3 rounded-xl border bg-background/80 p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">{contextCopy.parcel}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <strong>{selectedParcel.properties.name}</strong>
                    <Badge variant="outline">{selectedParcel.properties.crop}</Badge>
                    <Badge variant="outline">{Number(selectedParcel.properties.area_ha).toFixed(2)} ha</Badge>
                    {selectedParcel.properties.is_demo ? <DemoBadge show /> : null}
                  </div>
                  <Link className="mt-2 inline-flex rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-accent" to={`/app/agriculture?parcel=${selectedParcel.id}`}>
                    {contextCopy.openParcel}
                  </Link>
                </div>
              ) : null}
            </>
          ) : (
            <p>{lang === "fr" ? "Sélectionnez un point sur la carte pour lancer une requête spatiale." : lang === "en" ? "Select a point on the map to run a spatial query." : "اختر نقطة على الخريطة لتشغيل استعلام مكاني."}</p>
          )}
        </div>
        <div className="fg-gis-nearest">
          <h3>{copy.nearest}</h3>
          {selectedSite && nearest.length === 0 ? <p>{copy.noNearby}</p> : (
            <ol>
              {nearest.map((item) => (
                <li key={item.properties.id}>
                  <button type="button" onClick={() => void selectSite(item.properties.id)}>
                    <span>{item.properties.name}<small>{item.properties.wilaya}</small></span>
                    <strong dir="ltr">{((item.properties.distance_m ?? 0) / 1000).toFixed(1)} km</strong>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="fg-gis-register">
        <div className="fg-command-section-title">
          <div><span>GIS / SITES / RESOURCES / PROJECTS</span><h2>{copy.table}</h2></div>
          <Badge variant="outline">{wilayaFilter || String(wilayas.length || 69)}</Badge>
        </div>
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{t("gis.manualOnly")}</p>

        {filtered === null && !error ? (
          <Skeleton className="h-64 w-full" />
        ) : filtered && filtered.length === 0 ? (
          <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">{t("gis.empty")}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("gis.site")}</TableHead>
                  <TableHead>{t("gis.wilaya")}</TableHead>
                  <TableHead>{t("gis.commune")}</TableHead>
                  <TableHead>{t("gis.coords")}</TableHead>
                  <TableHead>{t("gis.projects")}</TableHead>
                  <TableHead>{t("gis.resources")}</TableHead>
                  <TableHead>{t("gis.assets")}</TableHead>
                  <TableHead>{t("gis.serviceRequests")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(filtered ?? []).map((g) => (
                  <TableRow key={g.site.id} className={selectedSiteId === g.site.id ? "bg-accent/50" : undefined}>
                    <TableCell className="font-medium">
                      <button type="button" className="font-medium underline-offset-4 hover:underline focus-visible:underline" onClick={() => void selectSite(g.site.id)}>
                        {g.site.name}
                      </button><DemoBadge show={g.site.is_demo} />
                    </TableCell>
                    <TableCell>{g.site.wilaya}</TableCell>
                    <TableCell>{g.site.commune ?? t("common.none")}</TableCell>
                    <TableCell className="tabular-nums" dir="ltr">{g.site.lat.toFixed(4)}, {g.site.lon.toFixed(4)}</TableCell>
                    <TableCell>
                      {g.projects.length === 0 ? t("common.none") : (
                        <ul className="space-y-0.5">
                          {g.projects.map((p) => (
                            <li key={p.id}><Link className="font-medium underline-offset-4 hover:underline" to={`/app/projects/${p.id}`}>#{p.id} {p.title}</Link> <Badge variant="outline">{t(`project.statuses.${p.status}`, p.status)}</Badge></li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell>
                      {g.resources.length === 0 ? t("common.none") : (
                        <ul className="space-y-0.5">{g.resources.map((r) => <li key={r.id}>#{r.id} {r.name}</li>)}</ul>
                      )}
                    </TableCell>
                    <TableCell>
                      {g.assets.length === 0 ? t("common.none") : (
                        <ul className="space-y-0.5">{g.assets.map((a) => <li key={a.id}>#{a.id} {a.name}</li>)}</ul>
                      )}
                    </TableCell>
                    <TableCell>
                      {g.service_requests.length === 0 ? t("common.none") : (
                        <ul className="space-y-0.5">
                          {g.service_requests.map((r) => (
                            <li key={r.id}>#{r.id} <Badge variant="outline">{t(`service.statuses.${r.status}`, r.status)}</Badge></li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
