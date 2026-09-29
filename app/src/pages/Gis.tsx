import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { GisSite, WilayaMeta } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorText, DemoBadge } from "@/components/common";

export default function Gis() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<GisSite[] | null>(null);
  const [wilayas, setWilayas] = useState<WilayaMeta[]>([]);
  const [wilayaFilter, setWilayaFilter] = useState("");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.get<{ count: number; sites: GisSite[] }>("/gis/sites")
      .then((r) => setData(r.sites))
      .catch(setError);
    api.get<{ count: number; wilayas: WilayaMeta[] }>("/meta/wilayas")
      .then((r) => setWilayas(r.wilayas))
      .catch(() => setWilayas([]));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return null;
    if (!wilayaFilter) return data;
    const w = wilayas.find((x) => x.code === wilayaFilter);
    const names = w ? [w.ar, w.fr, w.en] : [];
    return data.filter((g) => names.includes(g.site.wilaya));
  }, [data, wilayaFilter, wilayas]);

  const locale = i18n.language;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t-section text-ink">{t("gis.title")}</h1>
        <select
          aria-label={t("gis.filterWilaya")}
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={wilayaFilter}
          onChange={(e) => setWilayaFilter(e.target.value)}
        >
          <option value="">{t("gis.allWilayas")}</option>
          {wilayas.map((w) => (
            <option key={w.code} value={w.code}>
              {w.code} — {locale === "fr" ? w.fr : locale === "en" ? w.en : w.ar}
            </option>
          ))}
        </select>
      </div>

      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{t("gis.manualOnly")}</p>
      <ErrorText error={error} />

      {filtered === null && !error ? (
        <Skeleton className="h-64 w-full" />
      ) : filtered && filtered.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">{t("gis.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("gis.site")}</TableHead>
                <TableHead>{t("gis.wilaya")}</TableHead>
                <TableHead>{t("gis.commune")}</TableHead>
                <TableHead>{t("gis.coords")}</TableHead>
                <TableHead>{t("gis.projects")}</TableHead>
                <TableHead>{t("gis.resources")}</TableHead>
                <TableHead>{t("gis.assets")}</TableHead>
                <TableHead>{t("gis.serviceRequests")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(filtered ?? []).map((g) => (
                <TableRow key={g.site.id}>
                  <TableCell className="font-medium">
                    {g.site.name}<DemoBadge show={g.site.is_demo} />
                  </TableCell>
                  <TableCell>{g.site.wilaya}</TableCell>
                  <TableCell>{g.site.commune ?? t("common.none")}</TableCell>
                  <TableCell className="tabular-nums" dir="ltr">{g.site.lat.toFixed(4)}, {g.site.lon.toFixed(4)}</TableCell>
                  <TableCell>
                    {g.projects.length === 0 ? t("common.none") : (
                      <ul className="space-y-0.5">
                        {g.projects.map((p) => (
                          <li key={p.id}>#{p.id} {p.title} <Badge variant="outline">{t(`project.statuses.${p.status}`, p.status)}</Badge></li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell>
                    {g.resources.length === 0 ? t("common.none") : (
                      <ul className="space-y-0.5">
                        {g.resources.map((r) => <li key={r.id}>#{r.id} {r.name}</li>)}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell>
                    {g.assets.length === 0 ? t("common.none") : (
                      <ul className="space-y-0.5">
                        {g.assets.map((a) => <li key={a.id}>#{a.id} {a.name}</li>)}
                      </ul>
                    )}
                  </TableCell>
                  <TableCell>
                    {g.service_requests.length === 0 ? t("common.none") : (
                      <ul className="space-y-0.5">
                        {g.service_requests.map((r) => (
                          <li key={r.id}>#{r.id} <Badge variant="outline">{t(`service.statuses.${r.status}`, r.status)}</Badge></li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
