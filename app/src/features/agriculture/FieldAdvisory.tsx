import { useEffect, useState } from "react";
import { BrainCircuit, RefreshCw, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";

type Parcel = {
  id: number;
  name: string;
  crop: string;
  archived: boolean;
};

type Advisory = {
  parcel_id: number;
  provider: { mode: string; model: string; configured: boolean };
  advisory: {
    summary: string;
    alerts: string[];
    recommended_actions: string[];
    missing_evidence: string[];
  };
  provenance: string;
  verified: boolean;
  field_execution: boolean;
};

export default function FieldAdvisory({ parcels }: { parcels: Parcel[] }) {
  const { i18n } = useTranslation();
  const lang = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const copy = lang === "fr" ? {
    title: "Conseiller terrain IA",
    intro: "Interprète uniquement les mesures enregistrées et les indices satellite de la parcelle. Aucun calcul physique n’est délégué au modèle.",
    parcel: "Parcelle",
    run: "Analyser les données de la parcelle",
    busy: "Analyse…",
    alerts: "Alertes",
    actions: "Actions proposées",
    missing: "Preuves manquantes",
    unavailable: "Le service IA local/souverain n’est pas connecté ou n’a pas retourné une réponse valide.",
    empty: "Ajoutez d’abord une parcelle opérationnelle.",
  } : lang === "en" ? {
    title: "AI field advisory",
    intro: "Interprets only recorded measurements and parcel satellite indices. Physical calculations remain in deterministic FOGGARA engines.",
    parcel: "Parcel",
    run: "Analyze parcel evidence",
    busy: "Analyzing…",
    alerts: "Alerts",
    actions: "Proposed actions",
    missing: "Missing evidence",
    unavailable: "The local/sovereign AI service is not connected or did not return a valid response.",
    empty: "Add an operational parcel first.",
  } : {
    title: "المستشار الحقلي بالذكاء الاصطناعي",
    intro: "يفسر فقط القياسات المسجلة ومؤشرات الأقمار الخاصة بالقطعة. الحسابات الفيزيائية تبقى داخل محركات FOGGARA الحتمية.",
    parcel: "القطعة",
    run: "تحليل أدلة القطعة",
    busy: "جاري التحليل…",
    alerts: "تنبيهات",
    actions: "إجراءات مقترحة",
    missing: "أدلة ناقصة",
    unavailable: "خدمة الذكاء الاصطناعي المحلية/السيادية غير متصلة أو لم تُرجع استجابة صالحة.",
    empty: "أضف قطعة تشغيلية أولاً.",
  };

  const active = parcels.filter(p => !p.archived);
  const activeIds = active.map(p => p.id).join(",");
  const [parcelId, setParcelId] = useState<number | null>(active[0]?.id ?? null);
  const [result, setResult] = useState<Advisory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (parcelId != null && !active.some(p => p.id === parcelId)) {
      setParcelId(active[0]?.id ?? null);
      setResult(null);
    }
  }, [activeIds, parcelId]);

  const run = async () => {
    if (!parcelId || busy) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(await api.post<Advisory>("/ai/field-advisory", {
        parcel_id: parcelId,
        locale: lang,
      }));
    } catch {
      setError(copy.unavailable);
    } finally {
      setBusy(false);
    }
  };

  if (!active.length) {
    return <section className="fg-panel"><h2>{copy.title}</h2><p className="fg-muted">{copy.empty}</p></section>;
  }

  return <section className="fg-panel" aria-label={copy.title}>
    <div className="fg-panel-title">
      <div><p className="fg-eyebrow">FOGGARA / SOVEREIGN AI</p><h2><BrainCircuit size={21}/> {copy.title}</h2></div>
      <span className="fg-badge inferred">PROPOSED</span>
    </div>
    <p className="fg-muted">{copy.intro}</p>
    <div className="fg-form">
      <label className="fg-field"><span>{copy.parcel}</span>
        <select value={parcelId ?? ""} onChange={e => { setParcelId(Number(e.target.value)); setResult(null); }}>
          {active.map(p => <option key={p.id} value={p.id}>{p.name} · {p.crop}</option>)}
        </select>
      </label>
      <button type="button" className="fg-primary" disabled={busy || parcelId == null} onClick={() => void run()}>
        {busy ? <RefreshCw size={17}/> : <BrainCircuit size={17}/>} {busy ? copy.busy : copy.run}
      </button>
    </div>
    {error && <p className="fg-error" role="alert">{error}</p>}
    {result && <div className="fg-form">
      <div className="fg-result">
        <strong>{result.advisory.summary}</strong>
        <small>{result.provider.mode} · {result.provider.model} · {result.provenance}</small>
      </div>
      {result.advisory.alerts.length > 0 && <div><h3>{copy.alerts}</h3>{result.advisory.alerts.map((item, i) => <div className="fg-list-row" key={`a-${i}`}><span>{item}</span></div>)}</div>}
      {result.advisory.recommended_actions.length > 0 && <div><h3>{copy.actions}</h3>{result.advisory.recommended_actions.map((item, i) => <div className="fg-list-row" key={`r-${i}`}><span>{item}</span></div>)}</div>}
      {result.advisory.missing_evidence.length > 0 && <div><h3>{copy.missing}</h3>{result.advisory.missing_evidence.map((item, i) => <div className="fg-list-row" key={`m-${i}`}><span>{item}</span></div>)}</div>}
      <p className="fg-footnote"><ShieldCheck size={15}/> PROPOSED · NOT VERIFIED · NO FIELD EXECUTION</p>
    </div>}
  </section>;
}
