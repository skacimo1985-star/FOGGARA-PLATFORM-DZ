import { useEffect, useState, type FormEvent } from "react";
import { Satellite, MapPinned, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { setActiveParcelId, useOperationalContext } from "@/lib/operational-context";
import ParcelBoundaryEditor from "./ParcelBoundaryEditor";

type Parcel = {
  id: number;
  name: string;
  area_ha: number;
  lat?: number | null;
  lon?: number | null;
  boundary_geojson?: {type:"Polygon";coordinates:[number,number][][]} | null;
  archived: boolean;
};
type Scene = {
  id: string;
  datetime: string | null;
  cloud_cover_pct: number | null;
  provider: string;
};
type SceneResult = { scenes: Scene[]; sample_geometry: string; sample_bbox_wgs84: number[] };
type SatelliteIndex = "ndvi" | "lswi" | "ndmi" | "ndwi" | "bsi" | "savi" | "evi";
type SatelliteStatistics = {
  statistics: { min: number | null; max: number | null; mean: number | null; median: number | null };
  pixels: { total: number; valid: number; masked: number; valid_fraction: number };
  processing_plan_fingerprint: string;
  grid?: { resolution_m?: number | null; effective_source_resolution_m?: number | null; resampled?: boolean };
  mask?: { method?: string; cloud_masked_pixel_count?: number; geometry_mask_applied?: boolean };
};
type AnalysisResult = {
  created: boolean;
  observation: { id: number; metric: string; value: number; observed_at: string; evidence_status: string };
  statistics?: SatelliteStatistics;
  sample_geometry: string;
  provenance: string;
};
type PreviewState = { trueColorUrl: string; indexUrl: string };

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

export default function ParcelSentinel({
  parcels,
  onSaved,
}: {
  parcels: Parcel[];
  onSaved: () => void | Promise<void>;
}) {
  const { i18n } = useTranslation();
  const lang = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const text = lang === "fr" ? {
    heading: "Sentinel-2 réel · indices de parcelle",
    intro: "Recherchez de vraies scènes L2A, calculez les indices Sentinel avec masque SCL, puis enregistrez la moyenne traçable dans votre parcelle.",
    parcel: "Parcelle", from: "Début", to: "Fin", search: "Chercher les scènes",
    scene: "Scène satellite", index: "Indice", clouds: "Nuages", compute: "Calculer et enregistrer l’indice",
    coords: "Les coordonnées du centre sont requises.", lat: "Latitude", lon: "Longitude",
    saveCoords: "Enregistrer la position", noScenes: "Aucune scène trouvée pour la période.",
    missing: "Ajoutez une parcelle réelle d’abord.", info: "Sans contour, l’analyse utilise un carré estimé autour du centre. Avec un contour enregistré, les statistiques sont masquées au polygone réel. Résultat INFÉRÉ et non vérifié sur le terrain.",
    saved: "Indice enregistré", duplicate: "Scène déjà enregistrée pour cet indice", load: "Consultation du catalogue…",
    busy: "Analyse raster en cours…", error: "La requête a échoué. Vérifiez les coordonnées, le fournisseur ou le masque nuageux.",
    visual: "Analyse satellitaire visuelle", trueColor: "Sentinel-2 · vraies couleurs", indexMap: "Carte de l’indice", mean: "Moyenne", median: "Médiane", min: "Minimum", max: "Maximum", validPixels: "Pixels valides", acquired: "Acquisition", resolution: "Résolution source", previewUnavailable: "Le calcul a réussi, mais l’aperçu raster n’a pas pu être affiché.",
  } : lang === "en" ? {
    heading: "Real Sentinel-2 · parcel indices", intro: "Find real L2A scenes, compute SCL-masked Sentinel indices, and save the traceable mean to your parcel.",
    parcel: "Parcel", from: "From", to: "To", search: "Search scenes",
    scene: "Satellite scene", index: "Index", clouds: "Clouds", compute: "Compute and save index",
    coords: "Parcel centre coordinates are required.", lat: "Latitude", lon: "Longitude",
    saveCoords: "Save location", noScenes: "No scenes found for this period.",
    missing: "Add a real parcel first.", info: "Without a boundary, analysis uses an approximate square around the centre. With a saved boundary, statistics are masked to the real polygon. Result remains INFERRED, not ground verified.",
    saved: "Index saved", duplicate: "Scene already recorded for this index", load: "Checking satellite catalogue…",
    busy: "Processing raster…", error: "Request failed. Check coordinates, provider availability and cloud mask.",
    visual: "Visual satellite analysis", trueColor: "Sentinel-2 · true color", indexMap: "Index map", mean: "Mean", median: "Median", min: "Minimum", max: "Maximum", validPixels: "Valid pixels", acquired: "Acquired", resolution: "Source resolution", previewUnavailable: "The calculation succeeded, but the raster preview could not be displayed.",
  } : {
    heading: "Sentinel-2 حقيقي · مؤشرات القطعة", intro: "ابحث عن مشاهد Sentinel-2 L2A الحقيقية واحسب المؤشرات الطيفية مع حجب الغيوم ثم احفظ المتوسط القابل للتتبع في سجل القطعة.",
    parcel: "القطعة الزراعية", from: "من", to: "إلى", search: "بحث عن المشاهد",
    scene: "المشهد الفضائي", index: "المؤشر", clouds: "الغيوم", compute: "حساب المؤشر وحفظه",
    coords: "يجب إدخال إحداثيات مركز القطعة.", lat: "خط العرض", lon: "خط الطول",
    saveCoords: "حفظ الموقع", noScenes: "لا توجد مشاهد ضمن هذه الفترة.",
    missing: "أنشئ قطعة زراعية حقيقية أولاً.", info: "بدون حدود مرسومة يستخدم التحليل مربعًا تقديريًا حول المركز؛ وعند حفظ الحدود تُقص الإحصاءات على البوليغون الحقيقي. تبقى النتيجة INFERRED وليست قياسًا ميدانيًا متحققًا.",
    saved: "تم حفظ المؤشر", duplicate: "هذا المشهد محفوظ سابقًا لهذا المؤشر", load: "جاري البحث في فهرس الأقمار…",
    busy: "جاري تحليل الصورة…", error: "فشلت العملية. تحقق من الإحداثيات وتوفر المزود وجودة المشهد.",
    visual: "التحليل البصري بالأقمار الصناعية", trueColor: "Sentinel-2 · ألوان حقيقية", indexMap: "خريطة المؤشر", mean: "المتوسط", median: "الوسيط", min: "الأدنى", max: "الأقصى", validPixels: "البكسلات الصالحة", acquired: "تاريخ الالتقاط", resolution: "دقة المصدر", previewUnavailable: "تم الحساب بنجاح لكن تعذر عرض معاينة الصورة الفضائية.",
  };
  const active = parcels.filter(p => !p.archived);
  const { parcelId } = useOperationalContext();
  const parcel = active.find(p => p.id === parcelId) ?? active[0];
  const resolvedParcelId = parcel?.id ?? null;
  const [start, setStart] = useState(daysAgo(45));
  const [end, setEnd] = useState(today());
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [sceneId, setSceneId] = useState("");
  const [index, setIndex] = useState<SatelliteIndex>("ndvi");
  const [busy, setBusy] = useState<"scenes" | "compute" | "coords" | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  useEffect(() => {
    if (resolvedParcelId && resolvedParcelId !== parcelId) setActiveParcelId(resolvedParcelId);
  }, [resolvedParcelId, parcelId]);

  useEffect(() => {
    setScenes([]);
    setSceneId("");
    setResult(null);
    setPreview(null);
    setPreviewError("");
    setError("");
  }, [parcel?.id]);

  useEffect(() => {
    return () => {
      if (preview?.trueColorUrl) URL.revokeObjectURL(preview.trueColorUrl);
      if (preview?.indexUrl) URL.revokeObjectURL(preview.indexUrl);
    };
  }, [preview]);

  if (!parcel) {
    return <section className="fg-panel"><h2>{text.heading}</h2><p>{text.missing}</p></section>;
  }
  const hasCoords = parcel.lat != null && parcel.lon != null;
  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!hasCoords) return;
    setBusy("scenes"); setError(""); setPreviewError(""); setResult(null); setPreview(null); setScenes([]); setSceneId("");
    try {
      const query = new URLSearchParams({ start, end, cloud_cover_lte: "30" });
      const data = await api.get<SceneResult>(`/agriculture/parcels/${parcel.id}/remote-sensing/scenes?${query}`);
      setScenes(data.scenes);
      setSceneId(data.scenes[0]?.id ?? "");
    } catch {
      setError(text.error);
    } finally {
      setBusy(null);
    }
  };

  const handleAnalyze = async () => {
    if (!sceneId || busy) return;
    setBusy("compute"); setError(""); setPreviewError(""); setResult(null); setPreview(null);
    try {
      const value = await api.post<AnalysisResult>(`/agriculture/parcels/${parcel.id}/remote-sensing/analyze`, {scene_id: sceneId, index});
      let statistics = value.statistics;
      if (!statistics) {
        const query = new URLSearchParams({scene_id: sceneId, index});
        statistics = await api.get<SatelliteStatistics>(`/agriculture/parcels/${parcel.id}/remote-sensing/statistics?${query}`);
      }
      setResult({...value, statistics});
      if (value.created) await onSaved();

      try {
        const sceneQuery = new URLSearchParams({scene_id: sceneId});
        const indexQuery = new URLSearchParams({scene_id: sceneId, index});
        const trueColorBlob = await api.getBlob(`/agriculture/parcels/${parcel.id}/remote-sensing/true-color.png?${sceneQuery}`, 60_000);
        const indexBlob = await api.getBlob(`/agriculture/parcels/${parcel.id}/remote-sensing/preview.png?${indexQuery}`, 60_000);
        setPreview({
          trueColorUrl: URL.createObjectURL(trueColorBlob),
          indexUrl: URL.createObjectURL(indexBlob),
        });
      } catch {
        setPreviewError(text.previewUnavailable);
      }
    } catch {
      setError(text.error);
    } finally {
      setBusy(null);
    }
  };

  const handleCoords = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    const latitude = Number(lat), longitude = Number(lon);
    if (!lat.trim() || !lon.trim() || !Number.isFinite(latitude) || !Number.isFinite(longitude)
      || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setError(text.coords); return;
    }
    setBusy("coords");
    try {
      await api.patch(`/agriculture/parcels/${parcel.id}`, {lat: latitude, lon: longitude});
      await onSaved();
    } catch {
      setError(text.error);
    } finally {
      setBusy(null);
    }
  };
  const selectedScene = scenes.find(scene => scene.id === sceneId);
  const stats = result?.statistics;
  const statItems = stats ? [
    [text.mean, stats.statistics.mean],
    [text.median, stats.statistics.median],
    [text.min, stats.statistics.min],
    [text.max, stats.statistics.max],
  ] as const : [];
  return <section className="fg-panel fg-satellite-console" aria-label={text.heading}>
    <div className="fg-panel-title"><h2><Satellite size={21}/> {text.heading}</h2><span className="fg-badge inferred">COMPUTED → INFERRED</span></div>
    <p className="fg-muted">{text.intro}</p>
    <div className="fg-form">
      <label className="fg-field"><span>{text.parcel}</span><select value={parcel.id} onChange={e => setActiveParcelId(Number(e.target.value))}>
        {active.map(p => <option key={p.id} value={p.id}>{p.name} — {Number(p.area_ha).toFixed(2)} ha</option>)}
      </select></label>
      <ParcelBoundaryEditor parcel={parcel} onSaved={onSaved}/>
      {!hasCoords ? <form onSubmit={handleCoords} className="fg-form">
        <p className="fg-muted"><MapPinned size={16}/> {text.coords}</p>
        <div className="fg-form-grid">
          <label className="fg-field"><span>{text.lat}</span><input required type="number" min="-90" max="90" step="any" value={lat} onChange={e => setLat(e.target.value)} dir="ltr"/></label>
          <label className="fg-field"><span>{text.lon}</span><input required type="number" min="-180" max="180" step="any" value={lon} onChange={e => setLon(e.target.value)} dir="ltr"/></label>
        </div>
        <button className="fg-secondary" disabled={busy !== null} type="submit">{text.saveCoords}</button>
      </form> : <>
        <p className="fg-muted"><MapPinned size={15}/> {Number(parcel.lat).toFixed(5)}, {Number(parcel.lon).toFixed(5)}</p>
        <form onSubmit={handleSearch} className="fg-form">
          <div className="fg-form-grid">
            <label className="fg-field"><span>{text.from}</span><input type="date" value={start} max={end} onChange={e => setStart(e.target.value)} required/></label>
            <label className="fg-field"><span>{text.to}</span><input type="date" value={end} max={today()} min={start} onChange={e => setEnd(e.target.value)} required/></label>
          </div>
          <button className="fg-secondary" type="submit" disabled={busy !== null}><RefreshCw size={16}/> {busy === "scenes" ? text.load : text.search}</button>
        </form>
        {scenes.length > 0 && <div className="fg-form">
          <label className="fg-field"><span>{text.scene}</span><select value={sceneId} onChange={e => {setSceneId(e.target.value);setResult(null);setPreview(null);setPreviewError("");}}>
            {scenes.map(s => <option key={s.id} value={s.id}>{s.datetime?.slice(0,10) ?? "—"} · {s.cloud_cover_pct ?? "?"}% {text.clouds} · {s.id}</option>)}
          </select></label>
          <label className="fg-field"><span>{text.index}</span><select value={index} onChange={e => {setIndex(e.target.value as SatelliteIndex);setResult(null);setPreview(null);setPreviewError("");}}>
            <option value="ndvi">NDVI · vegetation · 10 m</option>
            <option value="evi">EVI · vegetation response · 10 m</option>
            <option value="savi">SAVI · soil-adjusted vegetation · 10 m</option>
            <option value="ndwi">NDWI · surface water signal · 10 m</option>
            <option value="ndmi">NDMI · vegetation moisture · source 20 m</option>
            <option value="lswi">LSWI · land-surface water · source 20 m</option>
            <option value="bsi">BSI · bare-soil signal · source 20 m</option>
          </select></label>
          <button className="fg-primary" disabled={busy !== null || !sceneId} onClick={() => void handleAnalyze()} type="button"><Satellite size={17}/>{busy === "compute" ? text.busy : text.compute}</button>
        </div>}
        {!busy && !error && scenes.length === 0 && <small className="fg-muted">{text.noScenes}</small>}
      </>}
      {result && <div role="status" className="fg-satellite-result">
        <div className="fg-satellite-result-head">
          <div><small>FOGGARA / SENTINEL-2 L2A</small><strong>{text.visual}</strong></div>
          <span className="fg-badge inferred">COMPUTED → INFERRED</span>
        </div>
        <div className="fg-satellite-kpis">
          <div><small>{result.observation.metric.toUpperCase()}</small><strong dir="ltr">{Number(result.observation.value).toFixed(4)}</strong><span>{result.created ? text.saved : text.duplicate}</span></div>
          {statItems.map(([label,value])=><div key={label}><small>{label}</small><strong dir="ltr">{value==null?"—":Number(value).toFixed(4)}</strong></div>)}
          {stats&&<div><small>{text.validPixels}</small><strong dir="ltr">{(stats.pixels.valid_fraction*100).toFixed(1)}%</strong><span dir="ltr">{stats.pixels.valid}/{stats.pixels.total}</span></div>}
        </div>
        <div className="fg-satellite-scene-meta">
          <span><b>{text.acquired}</b>{selectedScene?.datetime?.slice(0,10) ?? new Date(result.observation.observed_at).toISOString().slice(0,10)}</span>
          <span><b>{text.clouds}</b>{selectedScene?.cloud_cover_pct ?? "—"}%</span>
          <span><b>{text.resolution}</b>{stats?.grid?.effective_source_resolution_m ?? "—"} m</span>
          <span><b>PROVIDER</b>{selectedScene?.provider ?? "element84-earth-search"}</span>
        </div>
        {preview&&<div className="fg-satellite-visuals">
          <figure><div><img src={preview.trueColorUrl} alt={`${text.trueColor} · ${parcel.name}`}/></div><figcaption><Satellite size={15}/><strong>{text.trueColor}</strong><span>{selectedScene?.datetime?.slice(0,10) ?? ""}</span></figcaption></figure>
          <figure><div><img src={preview.indexUrl} alt={`${text.indexMap} ${index.toUpperCase()} · ${parcel.name}`}/></div><figcaption><Satellite size={15}/><strong>{text.indexMap} · {index.toUpperCase()}</strong><span>COMPUTED · SCL MASKED</span></figcaption></figure>
        </div>}
        {preview&&<div className={`fg-satellite-legend fg-satellite-legend-${index}`}><span>-1</span><i/><span>+1</span></div>}
        {previewError&&<p className="fg-satellite-preview-error">{previewError}</p>}
        <p className="fg-footnote">Sentinel-2 L2A · {result.sample_geometry} · {result.provenance} · {result.observation.evidence_status}</p>
      </div>}
      {error && <p className="fg-error" role="alert">{error}</p>}
      <p className="fg-footnote">{text.info} {parcel.boundary_geojson ? " · PARCEL_BOUNDARY_GEOJSON" : " · POINT_CENTERED_ESTIMATE"}</p>
    </div>
  </section>;
}
