import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { GisSite } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorText } from "@/components/common";

interface SolarPosition {
  lat: number; lon: number; at_utc: string;
  elevation_deg: number; azimuth_deg: number; is_day: boolean;
  timezone: string; local_time: string;
  method: string; disclaimer_code: string;
}

interface SolarAnnual {
  lat: number; lon: number; year: number;
  annual_hours: number; monthly_hours: number[];
  method: string; disclaimer_code: string;
}

/** بطاقة «حاسبة شمسية أولية (محسوبة)» — تُعرض في بُعد الطاقة فقط. */
export function SolarCard() {
  const { t } = useTranslation();
  const [sites, setSites] = useState<GisSite[] | null>(null);
  const [sitesError, setSitesError] = useState<unknown>(null);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [position, setPosition] = useState<SolarPosition | null>(null);
  const [annual, setAnnual] = useState<SolarAnnual | null>(null);

  useEffect(() => {
    api.get<{ count: number; sites: GisSite[] }>("/gis/sites")
      .then((r) => setSites(r.sites))
      .catch(setSitesError);
  }, []);

  const latNum = Number(lat);
  const lonNum = Number(lon);
  const coordsValid = lat.trim() !== "" && lon.trim() !== ""
    && Number.isFinite(latNum) && Number.isFinite(lonNum);

  const pickSite = (id: string) => {
    const s = sites?.find((g) => String(g.site.id) === id);
    if (s) {
      setLat(String(s.site.lat));
      setLon(String(s.site.lon));
    }
  };

  const compute = () => {
    if (!coordsValid || busy) return;
    setBusy(true);
    setError(null);
    const q = `lat=${latNum}&lon=${lonNum}`;
    Promise.all([
      api.get<SolarPosition>(`/energy/solar/position?${q}`),
      api.get<SolarAnnual>(`/energy/solar/annual-hours?${q}`),
    ]).then(([p, a]) => {
      setPosition(p);
      setAnnual(a);
    }).catch((e) => {
      setPosition(null);
      setAnnual(null);
      setError(e);
    }).finally(() => setBusy(false));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {t("solar.title")}
          <Badge variant="secondary">{t("landing.operational")}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sitesError !== null && <ErrorText error={sitesError} />}
        {sites === null && !sitesError ? (
          <Skeleton className="h-9 w-full" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {sites && sites.length > 0 ? (
              <div className="space-y-1">
                <Label htmlFor="solar-site">{t("solar.pickSite")}</Label>
                <select id="solar-site" defaultValue=""
                        onChange={(e) => pickSite(e.target.value)}
                        className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm">
                  <option value="" disabled>{t("solar.pickSitePlaceholder")}</option>
                  {sites.map((g) => (
                    <option key={g.site.id} value={g.site.id}>
                      {g.site.name} — {g.site.wilaya}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="self-end text-xs text-muted-foreground">{t("solar.emptySites")}</p>
            )}
            <div className="space-y-1">
              <Label htmlFor="solar-lat">{t("solar.lat")}</Label>
              <Input id="solar-lat" dir="ltr" inputMode="decimal" placeholder="27.87"
                     value={lat} onChange={(e) => setLat(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="solar-lon">{t("solar.lon")}</Label>
              <Input id="solar-lon" dir="ltr" inputMode="decimal" placeholder="-0.29"
                     value={lon} onChange={(e) => setLon(e.target.value)} />
            </div>
          </div>
        )}
        <Button onClick={compute} disabled={!coordsValid || busy}>
          {busy ? t("solar.computing") : t("solar.compute")}
        </Button>
        <ErrorText error={error} />
        {busy && <Skeleton className="h-24 w-full" />}
        {position && annual && !busy && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-sand/70 bg-sand/15 px-3 py-2 text-xs text-ink">
              <Badge variant="outline">{position.disclaimer_code}</Badge>
              <span>{t(`errors.${position.disclaimer_code}`)}</span>
              <span className="text-muted-foreground" dir="ltr">{position.method}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">{t("solar.elevation")}</p>
                <p className="font-semibold" dir="ltr">{position.elevation_deg.toFixed(1)}°</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">{t("solar.azimuth")}</p>
                <p className="font-semibold" dir="ltr">{position.azimuth_deg.toFixed(1)}°</p>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">{t("solar.dayNight")}</p>
                <Badge variant={position.is_day ? "default" : "outline"}>
                  {t(position.is_day ? "solar.day" : "solar.night")}
                </Badge>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground">{t("solar.localTime")}</p>
                <p className="font-semibold" dir="ltr">{position.local_time}</p>
              </div>
            </div>
            <div className="rounded-md border p-3">
              <p className="font-medium">
                {t("solar.annualHours", { year: annual.year })}:{" "}
                <span dir="ltr">{annual.annual_hours.toLocaleString()} {t("solar.hourUnit")}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{t("solar.monthly")}</p>
              <div className="mt-1 grid grid-cols-3 gap-1 text-xs sm:grid-cols-6" dir="ltr">
                {annual.monthly_hours.map((h, i) => (
                  <span key={i} className="rounded bg-parchment px-1.5 py-0.5 text-center">
                    {String(i + 1).padStart(2, "0")}: {Math.round(h)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
