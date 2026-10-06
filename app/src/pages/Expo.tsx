import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, MessageSquareText, Satellite, Star, Users } from "lucide-react";

import { ErrorText } from "@/components/common";
import { NationalMap, type SatelliteScene } from "@/components/NationalMap";
import { api } from "@/lib/api";
import { WILAYAS } from "@/lib/wilayas";
import "./expo.css";

type ExpoStats = { visitors: number; feedback: number };
type VisitResponse = ExpoStats & {
  visit_id: number;
  name: string | null;
  visitor_role: string | null;
};
type SceneResponse = {
  provider: string;
  collection: string;
  live: boolean;
  count: number;
  scenes: SatelliteScene[];
};

const ALGERIA: [number, number, number, number] = [-8.8, 18.4, 12.2, 37.5];

function sessionKey() {
  const key = "fg_expo_session";
  let value = sessionStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    sessionStorage.setItem(key, value);
  }
  return value;
}

function storedProfile() {
  try {
    return JSON.parse(sessionStorage.getItem("fg_expo_profile") || "{}") as { name?: string; visitor_role?: string };
  } catch {
    return {};
  }
}

function clampBbox(bbox: [number, number, number, number]): [number, number, number, number] {
  const [w, s, e, n] = bbox;
  return [
    Math.max(ALGERIA[0], Math.min(ALGERIA[2] - 0.01, w)),
    Math.max(ALGERIA[1], Math.min(ALGERIA[3] - 0.01, s)),
    Math.max(ALGERIA[0] + 0.01, Math.min(ALGERIA[2], e)),
    Math.max(ALGERIA[1] + 0.01, Math.min(ALGERIA[3], n)),
  ];
}

export default function Expo() {
  const { i18n } = useTranslation();
  const lang = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const profile = useMemo(storedProfile, []);
  const [visitId, setVisitId] = useState<number | null>(() => {
    const raw = sessionStorage.getItem("fg_expo_visit_id");
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  });
  const [stats, setStats] = useState<ExpoStats>({ visitors: 0, feedback: 0 });
  const [visitError, setVisitError] = useState<unknown>(null);
  const [viewport, setViewport] = useState<[number, number, number, number]>(ALGERIA);
  const [scenes, setScenes] = useState<SatelliteScene[]>([]);
  const [sceneBusy, setSceneBusy] = useState(false);
  const [sceneError, setSceneError] = useState<unknown>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [suggestion, setSuggestion] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [feedbackError, setFeedbackError] = useState<unknown>(null);

  const copy = lang === "fr" ? {
    badge: "AGRITECH EXPO · MODE VISITEUR",
    title: "Explorez FOGGARA-DZ sans compte.",
    intro: "Accès public en lecture seule pour le salon. Aucune donnée privée d'organisation n'est exposée.",
    visitors: "visiteurs",
    feedback: "avis reçus",
    mapTitle: "Observation satellite en direct",
    mapBody: "Recherchez des scènes Sentinel-2 réelles sur la vue actuelle de l'Algérie.",
    search: "Rechercher Sentinel-2",
    searching: "Recherche…",
    found: "scènes trouvées",
    survey: "Votre avis nous aide à améliorer FOGGARA",
    rate: "Comment évaluez-vous cette expérience ?",
    suggestion: "Suggestion ou besoin à ajouter",
    placeholder: "Ex. irrigation, analyse sol, financement, données locales…",
    send: "Envoyer",
    sent: "Merci. Votre retour a été enregistré.",
    links: "Continuer la visite",
    presentation: "Présentation",
    services: "Services agricoles",
    about: "À propos de FOGGARA",
    guest: "Visiteur",
  } : lang === "en" ? {
    badge: "AGRITECH EXPO · VISITOR MODE",
    title: "Explore FOGGARA-DZ without an account.",
    intro: "Public read-only expo access. No private organization data is exposed.",
    visitors: "visitors",
    feedback: "feedback received",
    mapTitle: "Live satellite observation",
    mapBody: "Search real Sentinel-2 scenes over the current Algeria map view.",
    search: "Search Sentinel-2",
    searching: "Searching…",
    found: "scenes found",
    survey: "Your feedback helps us improve FOGGARA",
    rate: "How do you rate this experience?",
    suggestion: "Suggestion or capability to add",
    placeholder: "E.g. irrigation, soil analysis, financing, local data…",
    send: "Send feedback",
    sent: "Thank you. Your feedback was recorded.",
    links: "Continue exploring",
    presentation: "Presentation",
    services: "Agriculture services",
    about: "About FOGGARA",
    guest: "Visitor",
  } : {
    badge: "AGRITECH EXPO · وضع الزائر",
    title: "استكشف FOGGARA-DZ بدون حساب.",
    intro: "دخول عام للمعرض بصلاحية عرض فقط، دون كشف بيانات المؤسسات الخاصة.",
    visitors: "زائر",
    feedback: "مشاركة رأي",
    mapTitle: "رصد فضائي حي",
    mapBody: "ابحث عن مشاهد Sentinel-2 حقيقية ضمن نطاق الخريطة الحالي في الجزائر.",
    search: "بحث Sentinel-2",
    searching: "جارٍ البحث…",
    found: "مشهد",
    survey: "رأيك يساعدنا على تطوير FOGGARA",
    rate: "كيف تقيم تجربتك؟",
    suggestion: "اقتراح أو ميزة تحتاجها",
    placeholder: "مثال: الري، تحليل التربة، التمويل، البيانات المحلية…",
    send: "إرسال الرأي",
    sent: "شكراً. تم تسجيل رأيك.",
    links: "واصل الاستكشاف",
    presentation: "العرض التعريفي",
    services: "الخدمات الزراعية",
    about: "حول FOGGARA",
    guest: "زائر",
  };

  useEffect(() => {
    let cancelled = false;
    async function register() {
      try {
        const result = await api.post<VisitResponse>("/expo/visit", {
          session_key: sessionKey(),
          name: profile.name || null,
          visitor_role: profile.visitor_role || null,
        });
        if (cancelled) return;
        setVisitId(result.visit_id);
        setStats({ visitors: result.visitors, feedback: result.feedback });
        sessionStorage.setItem("fg_expo_visit_id", String(result.visit_id));
      } catch (err) {
        if (!cancelled) setVisitError(err);
      }
    }
    void register();
    return () => { cancelled = true; };
  }, [profile.name, profile.visitor_role]);

  async function searchScenes() {
    setSceneBusy(true);
    setSceneError(null);
    try {
      const end = new Date();
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 10);
      const bbox = clampBbox(viewport).map(v => Number(v.toFixed(5))).join(",");
      const params = new URLSearchParams({
        bbox,
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
        cloud_cover_lte: "35",
        limit: "10",
      });
      const result = await api.get<SceneResponse>(`/expo/satellite/scenes?${params.toString()}`);
      setScenes(result.scenes);
    } catch (err) {
      setScenes([]);
      setSceneError(err);
    } finally {
      setSceneBusy(false);
    }
  }

  async function submitFeedback(e: FormEvent) {
    e.preventDefault();
    if (!visitId || feedbackBusy || (rating === null && !suggestion.trim())) return;
    setFeedbackBusy(true);
    setFeedbackError(null);
    try {
      const result = await api.post<ExpoStats & { feedback_id: number; status: string }>("/expo/feedback", {
        visit_id: visitId,
        rating,
        suggestion: suggestion.trim() || null,
      });
      setStats({ visitors: result.visitors, feedback: result.feedback });
      setFeedbackDone(true);
      setSuggestion("");
    } catch (err) {
      setFeedbackError(err);
    } finally {
      setFeedbackBusy(false);
    }
  }

  return <div className="fg-expo" dir={i18n.dir()} lang={i18n.language}>
    <header className="fg-expo-hero">
      <div>
        <p className="fg-expo-badge">{copy.badge}</p>
        <h1>{copy.title}</h1>
        <p>{copy.intro}</p>
        <div className="fg-expo-profile">
          <span>{profile.name || copy.guest}</span>
          {profile.visitor_role ? <small>{profile.visitor_role}</small> : null}
        </div>
      </div>
      <div className="fg-expo-counters" aria-live="polite">
        <article><Users size={22}/><strong>{stats.visitors}</strong><span>{copy.visitors}</span></article>
        <article><MessageSquareText size={22}/><strong>{stats.feedback}</strong><span>{copy.feedback}</span></article>
      </div>
    </header>

    <ErrorText error={visitError} />

    <section className="fg-expo-map-section">
      <div className="fg-expo-section-head">
        <div><p className="fg-expo-kicker">LIVE / SENTINEL-2 L2A</p><h2>{copy.mapTitle}</h2><p>{copy.mapBody}</p></div>
        <button type="button" className="fg-expo-primary" onClick={() => void searchScenes()} disabled={sceneBusy}>
          <Satellite size={18}/>{sceneBusy ? copy.searching : copy.search}
        </button>
      </div>
      <ErrorText error={sceneError} />
      <NationalMap
        sites={[]}
        wilayas={WILAYAS}
        satelliteScenes={scenes}
        onViewportChange={setViewport}
        locale={lang}
      />
      <p className="fg-expo-live-note">{scenes.length} {copy.found} · Element 84 Earth Search · OBSERVED PROVIDER METADATA</p>
    </section>

    <section className="fg-expo-grid">
      <form className="fg-expo-feedback" onSubmit={submitFeedback}>
        <p className="fg-expo-kicker">FEEDBACK / EXPO</p>
        <h2>{copy.survey}</h2>
        <label>{copy.rate}</label>
        <div className="fg-expo-rating" role="group" aria-label={copy.rate}>
          {[1,2,3,4,5].map(value =>
            <button type="button" key={value} aria-pressed={rating === value} onClick={() => setRating(value)}>
              <Star size={20} fill={rating !== null && value <= rating ? "currentColor" : "none"}/><span>{value}</span>
            </button>
          )}
        </div>
        <label htmlFor="expo-suggestion">{copy.suggestion}</label>
        <textarea id="expo-suggestion" maxLength={2000} value={suggestion} placeholder={copy.placeholder} onChange={e => setSuggestion(e.target.value)} />
        <ErrorText error={feedbackError} />
        {feedbackDone ? <p className="fg-expo-success" role="status">{copy.sent}</p> : null}
        <button className="fg-expo-primary" type="submit" disabled={feedbackBusy || !visitId || (rating === null && !suggestion.trim())}>
          {feedbackBusy ? "…" : copy.send}
        </button>
      </form>

      <aside className="fg-expo-links">
        <p className="fg-expo-kicker">FOGGARA / WEFEH</p>
        <h2>{copy.links}</h2>
        <Link to="/presentation"><span>{copy.presentation}</span><ArrowUpRight size={17}/></Link>
        <Link to="/agriculture-services"><span>{copy.services}</span><ArrowUpRight size={17}/></Link>
        <Link to="/about"><span>{copy.about}</span><ArrowUpRight size={17}/></Link>
      </aside>
    </section>
  </div>;
}
