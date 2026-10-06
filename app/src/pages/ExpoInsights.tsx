import { useEffect, useMemo, useState } from "react";
import { BarChart3, MessageSquareText, Star, UserRoundCheck, Users } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorText } from "@/components/common";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";

type RoleRow = { visitor_role: string; count: number };
type FeedbackRow = {
  id: number;
  rating: number | null;
  suggestion: string | null;
  created_at: string;
  name: string | null;
  visitor_role: string | null;
};
type ExpoInsights = {
  visitors: number;
  visitors_last_24h: number;
  feedback: number;
  average_rating: number | null;
  rating_distribution: Record<string, number>;
  role_distribution: RoleRow[];
  recent_feedback: FeedbackRow[];
};

function RatingStars({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${value}/5`}>
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          size={14}
          fill={index < value ? "currentColor" : "none"}
          className={index < value ? "text-amber-500" : "text-muted-foreground"}
        />
      ))}
    </span>
  );
}

export default function ExpoInsights() {
  const { i18n } = useTranslation();
  const lang = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const [data, setData] = useState<ExpoInsights | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<ExpoInsights>("/expo/insights")
      .then((value) => { if (!cancelled) setData(value); })
      .catch((err) => { if (!cancelled) setError(err); });
    return () => { cancelled = true; };
  }, []);

  const copy = lang === "fr" ? {
    eyebrow: "AGRITECH EXPO · INSIGHTS",
    title: "Retours visiteurs et signaux du salon",
    subtitle: "Vue interne réservée à l'équipe de revue. Les identifiants techniques de session ne sont jamais affichés.",
    visitors: "Visiteurs uniques",
    last24h: "Dernières 24 h",
    feedback: "Retours reçus",
    average: "Note moyenne",
    ratings: "Distribution des notes",
    roles: "Profils visiteurs",
    recent: "Derniers retours",
    empty: "Aucun retour pour le moment.",
    anonymous: "Visiteur anonyme",
    noRole: "Qualité non précisée",
    suggestion: "Suggestion",
  } : lang === "en" ? {
    eyebrow: "AGRITECH EXPO · INSIGHTS",
    title: "Visitor feedback and expo signals",
    subtitle: "Internal reviewer view. Technical session identifiers are never displayed.",
    visitors: "Unique visitors",
    last24h: "Last 24 hours",
    feedback: "Feedback received",
    average: "Average rating",
    ratings: "Rating distribution",
    roles: "Visitor roles",
    recent: "Recent feedback",
    empty: "No feedback yet.",
    anonymous: "Anonymous visitor",
    noRole: "Role not provided",
    suggestion: "Suggestion",
  } : {
    eyebrow: "AGRITECH EXPO · مؤشرات الزوار",
    title: "آراء الزوار وإشارات المعرض",
    subtitle: "لوحة داخلية للمراجعين والفريق فقط، ولا تعرض أي معرّفات تقنية للجلسات.",
    visitors: "الزوار الفريدون",
    last24h: "آخر 24 ساعة",
    feedback: "الآراء المستلمة",
    average: "متوسط التقييم",
    ratings: "توزيع التقييمات",
    roles: "صفات الزوار",
    recent: "آخر الآراء والاقتراحات",
    empty: "لا توجد آراء مسجلة بعد.",
    anonymous: "زائر بدون اسم",
    noRole: "الصفة غير محددة",
    suggestion: "الاقتراح",
  };

  const maxRatingCount = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...Object.values(data.rating_distribution));
  }, [data]);

  if (!data && !error) return <Skeleton className="h-[420px] w-full rounded-2xl" />;

  return (
    <div className="space-y-6" dir={i18n.dir()}>
      <header className="rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">{copy.eyebrow}</p>
        <h1 className="mt-2 text-2xl font-bold">{copy.title}</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">{copy.subtitle}</p>
      </header>

      <ErrorText error={error} />

      {data ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card><CardContent className="flex items-center gap-3 p-5"><Users className="text-emerald-700"/><div><span className="text-xs text-muted-foreground">{copy.visitors}</span><strong className="block text-2xl">{data.visitors}</strong></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-5"><UserRoundCheck className="text-sky-700"/><div><span className="text-xs text-muted-foreground">{copy.last24h}</span><strong className="block text-2xl">{data.visitors_last_24h}</strong></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-5"><MessageSquareText className="text-violet-700"/><div><span className="text-xs text-muted-foreground">{copy.feedback}</span><strong className="block text-2xl">{data.feedback}</strong></div></CardContent></Card>
            <Card><CardContent className="flex items-center gap-3 p-5"><Star className="text-amber-500"/><div><span className="text-xs text-muted-foreground">{copy.average}</span><strong className="block text-2xl">{data.average_rating ?? "—"}</strong></div></CardContent></Card>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><BarChart3 size={18}/>{copy.ratings}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {[5,4,3,2,1].map((rating) => {
                  const count = data.rating_distribution[String(rating)] ?? 0;
                  const width = Math.round((count / maxRatingCount) * 100);
                  return (
                    <div key={rating} className="grid grid-cols-[48px_1fr_42px] items-center gap-3 text-sm">
                      <span className="flex items-center gap-1"><Star size={13} className="text-amber-500"/>{rating}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${width}%` }} /></div>
                      <strong className="text-end">{count}</strong>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">{copy.roles}</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {data.role_distribution.length === 0 ? <p className="text-sm text-muted-foreground">{copy.empty}</p> : null}
                {data.role_distribution.map((row) => (
                  <div key={row.visitor_role} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-sm">
                    <span>{row.visitor_role || copy.noRole}</span>
                    <Badge variant="outline">{row.count}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </section>

          <Card>
            <CardHeader><CardTitle className="text-base">{copy.recent}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {data.recent_feedback.length === 0 ? <p className="text-sm text-muted-foreground">{copy.empty}</p> : null}
              {data.recent_feedback.map((row) => (
                <article key={row.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <strong>{row.name || copy.anonymous}</strong>
                      <p className="mt-1 text-xs text-muted-foreground">{row.visitor_role || copy.noRole}</p>
                    </div>
                    <div className="text-end">
                      <RatingStars value={row.rating} />
                      <p className="mt-1 text-[11px] text-muted-foreground">{new Date(row.created_at).toLocaleString(lang === "ar" ? "ar-DZ" : lang === "fr" ? "fr-DZ" : "en-GB")}</p>
                    </div>
                  </div>
                  {row.suggestion ? <p className="mt-3 rounded-lg bg-muted/60 p-3 text-sm leading-6"><b>{copy.suggestion}:</b> {row.suggestion}</p> : null}
                </article>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
