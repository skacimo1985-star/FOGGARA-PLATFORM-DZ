import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Droplets, Zap, Wheat, Leaf, HeartPulse, Compass, UserPlus, LayoutGrid } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FoggaraDivider } from "@/components/common";
import { useAuth } from "@/context/AuthContext";

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
    <div className="space-y-8">
      {/* ==== hero بزخرفة هندسية إسلامية خافتة ==== */}
      <section className="pattern-moorish overflow-hidden rounded-2xl border border-ink/10 bg-gradient-to-b from-parchment to-paper p-8">
        <Badge variant="secondary" className="mb-3">{t("landing.versionStatus")}</Badge>
        <h1 className="t-hero max-w-3xl text-ink">{t("landing.heroTitle")}</h1>
        <p className="mt-4 max-w-3xl leading-relaxed text-muted-foreground">{t("landing.heroSub")}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild size="lg" variant="outline">
            <Link to="/app/explore">
              <Compass className="h-4 w-4" aria-hidden="true" />
              {t("landing.exploreCta")}
            </Link>
          </Button>
          <Button size="lg" variant="secondary" onClick={() => setShowRegisterNotice((v) => !v)}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            {t("landing.registerCta")}
          </Button>
          <Button asChild size="lg">
            <Link to={user ? "/app" : "/login"}>
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
              {t("landing.workspaceCta")}
              <Arrow className="h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
        {showRegisterNotice && (
          <p role="note" className="mt-4 max-w-2xl rounded-md border border-oasis/40 bg-oasis/10 p-3 text-sm text-ink">
            {t("landing.registerNotice")}
          </p>
        )}
      </section>

      <FoggaraDivider />

      <section>
        <h2 className="t-section mb-4 text-ink">{t("landing.domains")}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {DOMAINS.map(({ key, icon: Icon, operational }) => (
            <Link key={key} to={`/app/explore/${key}`}>
              <Card className={`h-full transition-colors duration-300 hover:border-oasis/60 hover:bg-parchment/40 ${operational ? "border-oasis/50" : "opacity-80"}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${operational ? "bg-oasis/15 text-oasis-strong" : "bg-sand/25 text-ink/70"}`} aria-hidden="true">
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

      <FoggaraDivider />

      <section>
        <h2 className="t-section mb-4 text-ink">{t("path.title")}</h2>
        <ol className="flex flex-wrap items-center gap-2">
          {STEPS.map((s, i) => (
            <li key={s} className="flex items-center gap-2">
              <span className="flex items-center gap-2 rounded-full border border-ink/15 bg-card px-4 py-2 text-sm font-medium">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs font-bold text-paper">
                  {i + 1}
                </span>
                {t(`path.${s}`)}
              </span>
              {i < STEPS.length - 1 && <Arrow className="h-4 w-4 text-oasis" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </section>

      <p className="rounded-lg border border-sand/70 bg-sand/15 p-4 text-sm font-medium text-ink">
        {t("landing.demoNotice")}
      </p>
    </div>
  );
}
