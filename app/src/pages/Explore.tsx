import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WEFEH_DOMAINS } from "./Explore.constants";

export default function Explore() {
  const { t, i18n } = useTranslation();
  const Arrow = i18n.dir() === "rtl" ? ArrowLeft : ArrowRight;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="t-section text-ink">{t("explore.title")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("explore.subtitle")}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {WEFEH_DOMAINS.map(({ key, icon: Icon, operational }) => (
          <Link key={key} to={`/app/explore/${key}`}>
            <Card className={`h-full transition-colors hover:border-oasis/60 ${operational ? "border-oasis/50" : ""}`}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span className="flex items-center gap-2">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${operational ? "bg-oasis/15 text-oasis-strong" : "bg-sand/25 text-ink/70"}`} aria-hidden="true">
                      <Icon className="h-5 w-5" />
                    </span>
                    {t(`landing.${key}`)}
                  </span>
                  <Arrow className="h-4 w-4 text-oasis" aria-hidden="true" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant={operational ? "default" : "outline"}>
                  {t(operational ? "landing.operational" : "landing.planned")}
                </Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
