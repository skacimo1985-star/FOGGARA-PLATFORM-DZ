import { useEffect, useState, type FormEvent } from "react";
import { Satellite, MapPinned, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";

type Parcel = {
  id: number;
  name: string;
  area_ha: number;
  lat?: number | null;
  lon?: number | null;
  archived: boolean;
};
type Scene = {
  id: string;
  datetime: string | null;
  cloud_cover_pct: number | null;
  provider: string;
};
type SceneResult = { scenes: Scene[]; sample_geometry: string; sample_bbox_wgs84: number[] };
type AnalysisResult = {
  created: boolean;
  observation: { id: number; value: number; observed_at: string; evidence_status: string };
  statistics?: { pixels: { valid_fraction: number }; processing_plan_fingerprint: string };
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
}: {
  parcels: Parcel[];
  onSaved: () => void | Promise<void>;
}) {
  const { i18n } = useTranslation();
  const lang = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const text = lang === "fr" ? {
    heading: "Sentinel-2 réel · NDVI enregistré",
    intro: "Recherchez de vraies scènes L2A, calculez le NDVI masqué par SCL, puis enregistrez la moyenne dans votre parcelle.",
    parcel: "Parcelle", from: "Début", to: "Fin", search: "Chercher les scènes",
    scene: "Scène satellite", clouds: "Nuages", compute: "Calculer et enregistrer le NDVI",
    coords: "Les coordonnées du centre sont requises.", lat: "Latitude", lon: "Longitude",
    saveCoords: "Enregistrer la position", noScenes: "Aucune scène trouvée pour la période.",
    missing: "Ajoutez une parcelle réelle d’abord.", info: "Échantillon carré approximatif autour du point central, pas une mesure de toute la parcelle. Résultat INFÉRÉ et non vérifié sur le terrain.",
    saved: "NDVI enregistré", duplicate: "Scène déjà enregistrée", load: "Consultation du catalogue…",
    busy: "Analyse raster en cours…", error: "La requête a échoué. Vérifiez les coordonnées, le fournisseur ou le masque nuageux.",
  } : lang === "en" ? {
    heading: "Real Sentinel-2 · saved NDVI", intro: "Find real L2A scenes, compute SCL-masked NDVI, and save the mean to your parcel.",
    parcel: "Parcel", from: "From", to: "To", search: "Search scenes",
    scene: "Satellite scene", clouds: "Clouds", compute: "Compute and save NDVI",
    coords: "Parcel centre coordinates are required.", lat: "Latitude", lon: "Longitude",
    saveCoords: "Save location", noScenes: "No scenes found for this period.",
    missing: "Add a real parcel first.", info: "Approximate square sample around the parcel centre, not a field-wide measurement. Result is INFERRED, not ground verified.",
    saved: "NDVI saved", duplicate: "Scene already recorded", load: "Checking satellite catalogue…",
    busy: "Processing raster…", error: "Request failed. Check coordinates, provider availability and cloud mask.",
  } : {
    heading: "Sentinel-2 حقيقي · حفظ NDVI", intro: "ابحث عن مشاهد Sentinel-2 L2A الحقيقية واحسب NDVI مع حجب الغيوم ثم احفظ المتوسط في سجل القطعة.",
    parcel: "القطعة الزراعية", from: "من", to: "إلى", search: "بحث عن المشاهد",
    scene: "المشهد الفضائي", clouds: "الغيوم", compute: "حساب NDVI وحفظه",
    coords: "يجب إدخال إحداثيات مركز القطعة.", lat: "خط العرض", lon: "خط الطول",
    saveCoords: "حفظ الموقع", noScenes: "لا توجد مشاهد ضمن هذه الفترة.",
    missing: "أنشئ قطعة زراعية حقيقية أولاً.", info: "التحليل لعينة مربعة تقريبية حول مركز القطعة، وليس لكامل حدود الحقل. النتيجة INFERRED وليست قياسًا ميدانيًا متحققًا.",
    saved: "تم حفظ NDVI", duplicate: "هذا المشهد محفوظ سابقًا", load: "جاري البحث في فهرس الأقمار…",
    busy: "جاري تحليل الصورة…", error: "فشلت العملية. تحقق من الإحداثيات وتوفر المزود وجودة المشهد.",
  };
  const active = parcels.filter(p => !p.archived);
  const [parcelId, setParcelId] = useState<number | null>(null);
  const parcel = active.find(p => p.id === parcelId) ?? active[0];
  const [start, setStart] = useState(daysAgo(45));
  const [end, setEnd] = useState(today());
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [sceneId, setSceneId] = useState("");
  const [busy, setBusy] = useState<"scenes" | "compute" | "coords" | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");

  useEffect(() => {
    setScenes([]);
    setSceneId("");
    setResult(null);
    setError("");
  }, [parcel?.id]);

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
    setBusy("compute"); setError(""); setResult(null);
    try {
      const value = await api.post<AnalysisResult>(`/agriculture/parcels/${parcel.id}/remote-sensing/analyze`, {scene_id: sceneId});
      setResult(value);
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
  return <section className="fg-panel" aria-label={text.heading}>
    <div className="fg-panel-title"><h2><Satellite size={21}/> {text.heading}</h2><span className="fg-badge inferred">COMPUTED → INFERRED</span></div>
    <p className="fg-muted">{text.intro}</p>
    <div className="fg-form">
      <label className="fg-field"><span>{text.parcel}</span><select value={parcel.id} onChange={e => setParcelId(Number(e.target.value))}>
        {active.map(p => <option key={p.id} value={p.id}>{p.name} — {Number(p.area_ha).toFixed(2)} ha</option>)}
      </select></label>
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
          <label className="fg-field"><span>{text.scene}</span><select value={sceneId} onChange={e => {setSceneId(e.target.value);setResult(null);}}>
            {scenes.map(s => <option key={s.id} value={s.id}>{s.datetime?.slice(0,10) ?? "—"} · {s.cloud_cover_pct ?? "?"}% {text.clouds} · {s.id}</option>)}
          </select></label>
          <button className="fg-primary" disabled={busy !== null || !sceneId} onClick={() => void handleAnalyze()} type="button"><Satellite size={17}/>{busy === "compute" ? text.busy : text.compute}</button>
        </div>}
        {!busy && !error && scenes.length === 0 && <small className="fg-muted">{text.noScenes}</small>}
      </>}
      {result && <div role="status" className="fg-result">
        <strong>{result.created ? text.saved : text.duplicate}</strong>
        <div>NDVI: <strong dir="ltr">{Number(result.observation.value).toFixed(4)}</strong></div>
        <small>{new Date(result.observation.observed_at).toLocaleDateString()} · {result.observation.evidence_status}</small>
        {result.statistics && <small>Valid pixels: {(result.statistics.pixels.valid_fraction * 100).toFixed(1)}%</small>}
      </div>}
      {error && <p className="fg-error" role="alert">{error}</p>}
      <p className="fg-footnote">{text.info}</p>
    </div>
  </section>;
}
