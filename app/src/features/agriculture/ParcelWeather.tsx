import { useEffect, useState } from "react";
import { CloudSun, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";
import { setActiveParcelId, useOperationalContext } from "@/lib/operational-context";

type Parcel = {
  id: number;
  name: string;
  archived: boolean;
  lat?: number | null;
  lon?: number | null;
};

type WeatherStatus = {
  configured: boolean;
  mode: string;
  provider: string | null;
  max_forecast_days: number;
  provenance: string;
};

type WeatherDay = {
  date: string;
  weather_code: number;
  temperature_min_c: number;
  temperature_max_c: number;
  precipitation_mm: number;
  precipitation_probability_max_pct: number;
  wind_speed_max_m_s: number;
  shortwave_radiation_mj_m2: number;
  et0_fao_mm: number;
};

type WeatherResponse = {
  parcel_id: number;
  forecast: {
    provider: { configured: boolean; mode: string; provider: string; attribution?: string };
    generated_at: string;
    timezone: string;
    forecast_days: WeatherDay[];
    provenance: string;
    field_measurement: boolean;
  };
};

type IrrigationWeatherPreset = {
  parcelId: number;
  date: string;
  et0: number;
  precipitation: number;
  source: string;
};

export default function ParcelWeather({
  parcels,
  onUseDay,
}: {
  parcels: Parcel[];
  onUseDay?: (preset: IrrigationWeatherPreset) => void;
}) {
  const { i18n } = useTranslation();
  const lang = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const copy = lang === "fr" ? {
    title: "Météo agricole en direct",
    intro: "Prévisions jusqu’à 15 jours avec pluie, température, vent, rayonnement et ET₀ FAO-56.",
    parcel: "Parcelle",
    load: "Charger la prévision",
    busy: "Chargement…",
    unavailable: "Le fournisseur météo n’est pas configuré ou n’est pas disponible.",
    coords: "Ajoutez les coordonnées ou dessinez le contour de la parcelle.",
    et0: "ET₀", rain: "Pluie", wind: "Vent max", radiation: "Rayonnement",
    use: "Utiliser ET₀ pour l’irrigation",
    inferred: "Prévision de modèle · pas une mesure terrain",
  } : lang === "en" ? {
    title: "Live agricultural weather",
    intro: "Up to 15-day forecast with rain, temperature, wind, radiation and FAO-56 ET₀.",
    parcel: "Parcel",
    load: "Load forecast",
    busy: "Loading…",
    unavailable: "The weather provider is not configured or is unavailable.",
    coords: "Add parcel coordinates or draw its boundary first.",
    et0: "ET₀", rain: "Rain", wind: "Max wind", radiation: "Radiation",
    use: "Use ET₀ for irrigation",
    inferred: "Model forecast · not a field measurement",
  } : {
    title: "الطقس الزراعي الحي",
    intro: "توقع حتى 15 يومًا للأمطار والحرارة والرياح والإشعاع وET₀ وفق FAO-56.",
    parcel: "القطعة",
    load: "جلب التوقعات",
    busy: "جاري التحميل…",
    unavailable: "مزود الطقس غير مهيأ أو غير متاح.",
    coords: "أضف إحداثيات القطعة أو ارسم حدودها أولًا.",
    et0: "ET₀", rain: "المطر", wind: "أقصى رياح", radiation: "الإشعاع",
    use: "استخدم ET₀ في سيناريو الري",
    inferred: "توقع نموذجي · ليس قياسًا ميدانيًا",
  };

  const active = parcels.filter(p => !p.archived);
  const { parcelId } = useOperationalContext();
  const parcel = active.find(p => p.id === parcelId) ?? active[0];
  const resolvedParcelId = parcel?.id ?? null;
  const [status, setStatus] = useState<WeatherStatus | null>(null);
  const [data, setData] = useState<WeatherResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (resolvedParcelId && resolvedParcelId !== parcelId) setActiveParcelId(resolvedParcelId);
  }, [resolvedParcelId, parcelId]);

  useEffect(() => {
    let cancelled = false;
    void api.get<WeatherStatus>("/agriculture/weather/status")
      .then(value => { if (!cancelled) setStatus(value); })
      .catch(() => { if (!cancelled) setStatus(null); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setData(null);
    setError("");
  }, [parcel?.id]);

  const load = async () => {
    if (!parcel || busy || parcel.lat == null || parcel.lon == null) return;
    setBusy(true); setError(""); setData(null);
    try {
      setData(await api.get<WeatherResponse>(`/agriculture/parcels/${parcel.id}/weather?days=15`));
    } catch {
      setError(copy.unavailable);
    } finally {
      setBusy(false);
    }
  };

  if (!parcel) return null;
  const hasCoords = parcel.lat != null && parcel.lon != null;

  return <section className="fg-panel" aria-label={copy.title}>
    <div className="fg-panel-title">
      <div><p className="fg-eyebrow">FOGGARA / AGRI WEATHER</p><h2><CloudSun size={21}/> {copy.title}</h2></div>
      <span className={`fg-badge ${status?.configured ? "" : "inferred"}`}>
        {status?.configured ? status.mode : "NOT CONNECTED"}
      </span>
    </div>
    <p className="fg-muted">{copy.intro}</p>
    <div className="fg-form">
      <label className="fg-field"><span>{copy.parcel}</span>
        <select value={parcel.id} onChange={e => setActiveParcelId(Number(e.target.value))}>
          {active.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {!hasCoords && <p className="fg-muted">{copy.coords}</p>}
      <button type="button" className="fg-primary" disabled={busy || !hasCoords || status?.configured === false} onClick={() => void load()}>
        <RefreshCw size={17}/> {busy ? copy.busy : copy.load}
      </button>
    </div>
    {error && <p className="fg-error" role="alert">{error}</p>}
    {data && <div className="fg-table-scroll">
      <table>
        <thead><tr><th>Date</th><th>°C</th><th>{copy.et0}</th><th>{copy.rain}</th><th>{copy.wind}</th><th>{copy.radiation}</th>{onUseDay&&<th/>}</tr></thead>
        <tbody>{data.forecast.forecast_days.map(day => <tr key={day.date}>
          <td>{day.date}</td>
          <td dir="ltr">{day.temperature_min_c.toFixed(1)} → {day.temperature_max_c.toFixed(1)}</td>
          <td dir="ltr">{day.et0_fao_mm.toFixed(2)} mm</td>
          <td dir="ltr">{day.precipitation_mm.toFixed(1)} mm · {day.precipitation_probability_max_pct.toFixed(0)}%</td>
          <td dir="ltr">{day.wind_speed_max_m_s.toFixed(1)} m/s</td>
          <td dir="ltr">{day.shortwave_radiation_mj_m2.toFixed(1)} MJ/m²</td>
          {onUseDay&&<td><button type="button" className="fg-link" onClick={()=>onUseDay({
            parcelId: parcel.id,
            date: day.date,
            et0: day.et0_fao_mm,
            precipitation: day.precipitation_mm,
            source: `weather:${data.forecast.provider.provider}:${day.date}:INFERRED`,
          })}>{copy.use}</button></td>}
        </tr>)}</tbody>
      </table>
      <p className="fg-footnote"><ShieldCheck size={15}/> {copy.inferred} · {data.forecast.provider.attribution ?? ""}</p>
    </div>}
  </section>;
}
