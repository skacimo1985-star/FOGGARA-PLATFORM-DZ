import { useEffect, useState, type FormEvent } from "react";
import { Satellite, MapPinned, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";
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
type SatelliteIndex = "ndvi" | "evi" | "savi" | "ndwi" | "lswi";
type RasterStatistics = {
  scene_id: string;
  index: SatelliteIndex;
  analysis_bbox_wgs84: [number, number, number, number];
  grid: { crs: string; width: number; height: number; resolution_m: number };
  pixels: { total: number; valid: number; masked: number; valid_fraction: number };
  statistics: { min: number | null; max: number | null; mean: number | null; median: number | null };
  mask: { cloud_masked_pixel_count: number; geometry_mask_applied: boolean };
  sample_geometry?: string;
  evidence_status?: string;
};
type AnalysisResult = {
  created: boolean;
  observation: { id: number; value: number; observed_at: string; evidence_status: string };
  statistics?: RasterStatistics;
  sample_geometry: string;
  provenance: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

export default function ParcelSentinel({
  parcels,
  onSaved,
  selectedParcelId = null,
  onRasterReady,
  onTrueColorReady,
}: {
  parcels: Parcel[];
  onSaved: () => void | Promise<void>;
  selectedParcelId?: number | null;
  onRasterReady?: (overlay: { url: string; bbox: [number, number, number, number]; index: SatelliteIndex }) => void;
  onTrueColorReady?: (overlay: {
    url: string;
    bbox: [number, number, number, number];
    scene_id: string;
    acquired_at: string | null;
    provider: string;
    cloud_cover_pct: number | null;
  }) => void;
}) {
  const { i18n } = useTranslation();
  const lang = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const text = lang === "fr" ? {
    heading: "Sentinel-2 réel · indices enregistrés",
    intro: "Recherchez de vraies scènes L2A, calculez NDVI/EVI/SAVI/NDWI/LSWI avec masque SCL, puis enregistrez la moyenne dans votre parcelle.",
    parcel: "Parcelle", from: "Début", to: "Fin", search: "Chercher les scènes",
    scene: "Scène satellite", index: "Indice", clouds: "Nuages", compute: "Calculer et enregistrer",
    coords: "Les coordonnées du centre sont requises.", lat: "Latitude", lon: "Longitude",
    saveCoords: "Enregistrer la position", noScenes: "Aucune scène trouvée pour la période.",
    missing: "Ajoutez une parcelle réelle d’abord.", info: "Sans contour, l’analyse utilise un carré estimé autour du centre. Avec un contour enregistré, les statistiques sont masquées au polygone réel. Résultat INFÉRÉ et non vérifié sur le terrain.",
    saved: "Indice enregistré", duplicate: "Scène/indice déjà enregistré", load: "Consultation du catalogue…",
    busy: "Analyse raster en cours…", error: "La requête a échoué. Vérifiez les coordonnées, le fournisseur ou le masque nuageux.",
    rasterTitle: "Raster Sentinel calculé sur la parcelle", min: "Min", mean: "Moyenne", median: "Médiane", max: "Max", valid: "Pixels valides", resolution: "Résolution", acquired: "Acquisition", realRaster: "COG Sentinel-2 réel · masque SCL · contour parcelle",
  } : lang === "en" ? {
    heading: "Real Sentinel-2 · saved field indices", intro: "Find real L2A scenes, compute SCL-masked NDVI/EVI/SAVI/NDWI/LSWI, and save the mean to your parcel.",
    parcel: "Parcel", from: "From", to: "To", search: "Search scenes",
    scene: "Satellite scene", index: "Index", clouds: "Clouds", compute: "Compute and save",
    coords: "Parcel centre coordinates are required.", lat: "Latitude", lon: "Longitude",
    saveCoords: "Save location", noScenes: "No scenes found for this period.",
    missing: "Add a real parcel first.", info: "Without a boundary, analysis uses an approximate square around the centre. With a saved boundary, statistics are masked to the real polygon. Result remains INFERRED, not ground verified.",
    saved: "Index saved", duplicate: "Scene/index already recorded", load: "Checking satellite catalogue…",
    busy: "Processing raster…", error: "Request failed. Check coordinates, provider availability and cloud mask.",
    rasterTitle: "Sentinel raster computed for this field", min: "Min", mean: "Mean", median: "Median", max: "Max", valid: "Valid pixels", resolution: "Resolution", acquired: "Acquired", realRaster: "Real Sentinel-2 COG · SCL mask · parcel boundary",
  } : {
    heading: "Sentinel-2 حقيقي · سجل مؤشرات الحقل", intro: "ابحث عن مشاهد Sentinel-2 L2A الحقيقية واحسب NDVI/EVI/SAVI/NDWI/LSWI مع حجب الغيوم ثم احفظ المتوسط في سجل القطعة.",
    parcel: "القطعة الزراعية", from: "من", to: "إلى", search: "بحث عن المشاهد",
    scene: "المشهد الفضائي", index: "المؤشر", clouds: "الغيوم", compute: "حساب المؤشر وحفظه",
    coords: "يجب إدخال إحداثيات مركز القطعة.", lat: "خط العرض", lon: "خط الطول",
    saveCoords: "حفظ الموقع", noScenes: "لا توجد مشاهد ضمن هذه الفترة.",
    missing: "أنشئ قطعة زراعية حقيقية أولاً.", info: "بدون حدود مرسومة يستخدم التحليل مربعًا تقديريًا حول المركز؛ وعند حفظ الحدود تُقص الإحصاءات على البوليغون الحقيقي. تبقى النتيجة INFERRED وليست قياسًا ميدانيًا متحققًا.",
    saved: "تم حفظ المؤشر", duplicate: "هذا المشهد/المؤشر محفوظ سابقًا", load: "جاري البحث في فهرس الأقمار…",
    busy: "جاري تحليل الصورة…", error: "فشلت العملية. تحقق من الإحداثيات وتوفر المزود وجودة المشهد.",
    rasterTitle: "Raster Sentinel محسوب على حدود القطعة", min: "الأدنى", mean: "المتوسط", median: "الوسيط", max: "الأعلى", valid: "البكسلات الصالحة", resolution: "الدقة", acquired: "تاريخ الالتقاط", realRaster: "Sentinel-2 COG حقيقي · قناع SCL · حدود القطعة",
  };
  const active = parcels.filter(p => !p.archived);
  const [parcelId, setParcelId] = useState<number | null>(selectedParcelId);
  const parcel = active.find(p => p.id === parcelId) ?? active[0];
  const [start, setStart] = useState(daysAgo(45));
  const [end, setEnd] = useState(today());
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [sceneId, setSceneId] = useState("");
  const [indexKey, setIndexKey] = useState<SatelliteIndex>("ndvi");
  const [busy, setBusy] = useState<"scenes" | "compute" | "coords" | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [rasterStats, setRasterStats] = useState<RasterStatistics | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  useEffect(() => {
    if (selectedParcelId && parcels.some((item) => !item.archived && item.id === selectedParcelId)) {
      setParcelId(selectedParcelId);
    }
  }, [selectedParcelId, parcels]);

  useEffect(() => {
    setScenes([]);
    setSceneId("");
    setResult(null);
    setRasterStats(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setError("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parcel?.id]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  if (!parcel) {
    return <section className="fg-panel"><h2>{text.heading}</h2><p>{text.missing}</p></section>;
  }
  const hasCoords = parcel.lat != null && parcel.lon != null;
  const handleSearch = async (event: FormEvent) => {
    event.preventDefault();
    if (!hasCoords) return;
    setBusy("scenes"); setError(""); setResult(null); setScenes([]); setSceneId("");
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
    setBusy("compute"); setError(""); setResult(null); setRasterStats(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    try {
      const value = await api.post<AnalysisResult>(`/agriculture/parcels/${parcel.id}/remote-sensing/analyze`, {scene_id: sceneId, index: indexKey});
      let stats = value.statistics ?? null;
      if (!stats) {
        const params = new URLSearchParams({ scene_id: sceneId, index: indexKey });
        stats = await api.get<RasterStatistics>(`/agriculture/parcels/${parcel.id}/remote-sensing/statistics?${params.toString()}`);
      }
      const previewParams = new URLSearchParams({ scene_id: sceneId, index: indexKey });
      const preview = await api.getBlob(
        `/agriculture/parcels/${parcel.id}/remote-sensing/preview.png?${previewParams.toString()}`,
        60_000,
      );
      const url = URL.createObjectURL(preview);
      setResult(value);
      setRasterStats(stats);
      setPreviewUrl(url);
      if (stats?.analysis_bbox_wgs84) {
        onRasterReady?.({ url, bbox: stats.analysis_bbox_wgs84, index: indexKey });
        if (onTrueColorReady) {
          const trueColor = await api.getBlob(
            `/agriculture/parcels/${parcel.id}/remote-sensing/true-color.png?${new URLSearchParams({ scene_id: sceneId }).toString()}`,
            60_000,
          );
          const selectedScene = scenes.find(scene => scene.id === sceneId);
          onTrueColorReady({
            url: URL.createObjectURL(trueColor),
            bbox: stats.analysis_bbox_wgs84,
            scene_id: sceneId,
            acquired_at: selectedScene?.datetime ?? null,
            provider: selectedScene?.provider ?? "Element 84 Earth Search",
            cloud_cover_pct: selectedScene?.cloud_cover_pct ?? null,
          });
        }
      }
      if (value.created) await onSaved();
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
  return <section className="fg-panel" aria-label={text.heading} data-testid="parcel-sentinel-live">
    <div className="fg-panel-title"><h2><Satellite size={21}/> {text.heading}</h2><span className="fg-badge inferred">COMPUTED → INFERRED</span></div>
    <p className="fg-muted">{text.intro}</p>
    <div className="fg-form">
      <label className="fg-field"><span>{text.parcel}</span><select value={parcel.id} onChange={e => setParcelId(Number(e.target.value))}>
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
          <div className="fg-form-grid">
            <label className="fg-field"><span>{text.scene}</span><select value={sceneId} onChange={e => {setSceneId(e.target.value);setResult(null);}}>
              {scenes.map(s => <option key={s.id} value={s.id}>{s.datetime?.slice(0,10) ?? "—"} · {s.cloud_cover_pct ?? "?"}% {text.clouds} · {s.id}</option>)}
            </select></label>
            <label className="fg-field"><span>{text.index}</span><select value={indexKey} onChange={e => {setIndexKey(e.target.value as SatelliteIndex);setResult(null);}}>
              {(["ndvi","evi","savi","ndwi","lswi"] as SatelliteIndex[]).map(index => <option key={index} value={index}>{index.toUpperCase()}</option>)}
            </select></label>
          </div>
          <button className="fg-primary" disabled={busy !== null || !sceneId} onClick={() => void handleAnalyze()} type="button"><Satellite size={17}/>{busy === "compute" ? text.busy : text.compute}</button>
        </div>}
        {!busy && !error && scenes.length === 0 && <small className="fg-muted">{text.noScenes}</small>}
      </>}
      {result && <div role="status" className="fg-result">
        <strong>{result.created ? text.saved : text.duplicate}</strong>
        <div>{indexKey.toUpperCase()}: <strong dir="ltr">{Number(result.observation.value).toFixed(4)}</strong></div>
        <small>{new Date(result.observation.observed_at).toLocaleDateString()} · {result.observation.evidence_status}</small>
      </div>}
      {previewUrl && rasterStats && <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4" data-testid="sentinel-real-raster">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div><strong>{text.rasterTitle}</strong><p className="text-xs text-muted-foreground">{text.realRaster}</p></div>
          <span className="fg-badge inferred">COMPUTED · {indexKey.toUpperCase()}</span>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(260px,.7fr)]">
          <div className="overflow-hidden rounded-xl border bg-slate-950/5">
            <img src={previewUrl} alt={`${indexKey.toUpperCase()} Sentinel-2 raster`} className="block aspect-video h-auto w-full object-contain [image-rendering:auto]" />
          </div>
          <div className="grid grid-cols-2 gap-2 content-start">
            {[
              [text.min, rasterStats.statistics.min],
              [text.mean, rasterStats.statistics.mean],
              [text.median, rasterStats.statistics.median],
              [text.max, rasterStats.statistics.max],
            ].map(([label,value]) => <div key={String(label)} className="rounded-xl border bg-background p-3"><span className="text-xs text-muted-foreground">{label}</span><strong className="mt-1 block text-lg tabular-nums" dir="ltr">{typeof value==="number"?value.toFixed(4):"—"}</strong></div>)}
            <div className="col-span-2 rounded-xl border bg-background p-3"><span className="text-xs text-muted-foreground">{text.valid}</span><strong className="mt-1 block" dir="ltr">{(rasterStats.pixels.valid_fraction*100).toFixed(1)}% · {rasterStats.pixels.valid}/{rasterStats.pixels.total}</strong></div>
            <div className="rounded-xl border bg-background p-3"><span className="text-xs text-muted-foreground">{text.resolution}</span><strong className="mt-1 block" dir="ltr">{rasterStats.grid.resolution_m} m</strong></div>
            <div className="rounded-xl border bg-background p-3"><span className="text-xs text-muted-foreground">{text.acquired}</span><strong className="mt-1 block text-sm">{scenes.find(s=>s.id===sceneId)?.datetime?.slice(0,10) ?? "—"}</strong></div>
          </div>
        </div>
      </section>}
      {error && <p className="fg-error" role="alert">{error}</p>}
      <p className="fg-footnote">{text.info} {parcel.boundary_geojson ? " · PARCEL_BOUNDARY_GEOJSON" : " · POINT_CENTERED_ESTIMATE"}</p>
    </div>
  </section>;
}
