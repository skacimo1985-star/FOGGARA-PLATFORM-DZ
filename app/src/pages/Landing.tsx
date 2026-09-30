import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Droplets, Zap, Wheat, Leaf, HeartPulse, UserPlus, LayoutGrid, Sparkles, ShieldCheck, Waves } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/context/AuthContext";
import { FoggaraVisual } from "@/components/FoggaraVisual";

const DOMAINS = [
  { key: "water", icon: Droplets, operational: true },
  { key: "energy", icon: Zap, operational: false },
  { key: "food", icon: Wheat, operational: false },
  { key: "ecosystem", icon: Leaf, operational: false },
  { key: "health", icon: HeartPulse, operational: false },
];

const STEPS = ["discover", "understand", "analyze", "act", "monitor"] as const;

export default function Landing() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [showRegisterNotice, setShowRegisterNotice] = useState(false);
  const Arrow = i18n.dir() === "rtl" ? ArrowLeft : ArrowRight;

  return (
    <div className="space-y-12 pb-8">
      <section className="landing-hero pattern-moorish relative overflow-hidden rounded-[2rem] border border-ink/10 bg-gradient-to-br from-[#f8f5ec] via-[#fbfcf8] to-[#e8f2eb] p-5 sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -end-16 -top-24 h-72 w-72 rounded-full bg-oasis/10 blur-3xl" />
        <div className="relative grid items-center gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-10">
          <div className="flex flex-col items-start">
            <Badge variant="secondary" className="mb-5 rounded-full border border-oasis/15 bg-white/75 px-3 py-1 text-oasis-strong shadow-sm">
              <Sparkles className="me-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t("landing.versionStatus")}
            </Badge>
            <h1 className="t-hero max-w-2xl text-ink">{t("landing.heroTitle")}</h1>
            <p className="mt-4 max-w-xl text-base leading-8 text-ink/70 sm:text-lg">{t("landing.heroSub")}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-full px-6 shadow-[0_10px_24px_rgb(42_157_143/0.22)]">
                <Link to={user ? "/app" : "/login"}>
                  <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                  {t("landing.workspaceCta")}
                  <Arrow className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="ghost" className="rounded-full px-5 text-ink hover:bg-white/75">
                <Link to="/app/explore">
                  {t("landing.exploreCta")}
                  <Arrow className="h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-ink/60 sm:text-sm">
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-oasis" aria-hidden="true" />{t("provenance.verified")}</span>
              <span className="inline-flex items-center gap-1.5"><Waves className="h-4 w-4 text-oasis" aria-hidden="true" />{t("landing.water")}</span>
            </div>
            <Button size="sm" variant="link" className="mt-5 h-auto p-0 text-xs text-ink/45" onClick={() => setShowRegisterNotice((v) => !v)}>
              <UserPlus className="me-1 h-3.5 w-3.5" aria-hidden="true" />{t("landing.registerCta")}
            </Button>
            {showRegisterNotice && (
              <p role="note" className="mt-3 max-w-xl rounded-2xl border border-oasis/20 bg-white/80 p-4 text-sm text-ink shadow-sm">
                {t("landing.registerNotice")}
              </p>
            )}
          </div>
          <div className="landing-hero-visual">
            <FoggaraVisual />
          </div>
        </div>
      </section>

      <div className="flex items-center gap-4" aria-hidden="true"><span className="h-px flex-1 bg-gradient-to-l from-transparent via-ink/10 to-transparent" /><span className="h-2 w-2 rounded-full bg-oasis/40" /><span className="h-px flex-1 bg-gradient-to-l from-transparent via-ink/10 to-transparent" /></div>

      <section>
        <h2 className="t-section mb-4 text-ink">{t("landing.domains")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {DOMAINS.map(({ key, icon: Icon, operational }) => (
            <Link key={key} to={`/app/explore/${key}`}>
              <Card className={`h-full rounded-2xl border-white/80 bg-white/80 shadow-[0_6px_28px_rgb(38_70_83/0.045)] transition-all duration-300 hover:-translate-y-1 hover:border-oasis/35 hover:bg-white hover:shadow-[0_14px_36px_rgb(38_70_83/0.09)] ${operational ? "ring-1 ring-oasis/20" : "opacity-75"}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${operational ? "bg-oasis/12 text-oasis-strong" : "bg-sand/20 text-ink/65"}`} aria-hidden="true">
                      <Icon className="h-5 w-5" />
                    </span>
                    {t(`landing.${key}`)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge variant={operational ? "oasis" : "secondary"}>
                    {t(operational ? "landing.operational" : "landing.planned")}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <div className="flex items-center gap-4" aria-hidden="true"><span className="h-px flex-1 bg-gradient-to-l from-transparent via-ink/10 to-transparent" /><span className="h-2 w-2 rounded-full bg-sand/70" /><span className="h-px flex-1 bg-gradient-to-l from-transparent via-ink/10 to-transparent" /></div>

      <section>
        <h2 className="t-section mb-4 text-ink">{t("path.title")}</h2>
        <ol className="flex flex-wrap items-center gap-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className="flex items-center gap-2 rounded-full border border-ink/10 bg-white/80 px-4 py-2 text-sm font-medium shadow-sm">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-oasis/12 text-xs font-bold text-oasis-strong">
                  {i + 1}
                </span>
                {t(`path.${s}`)}
              </span>
              {i < STEPS.length - 1 && <Arrow className="h-4 w-4 text-oasis" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </section>

      <p className="rounded-2xl border border-sand/50 bg-[#fbf4df]/60 p-4 text-sm font-medium text-ink/70">
        {t("landing.demoNotice")}
      </p>
    </div>
  );
}
