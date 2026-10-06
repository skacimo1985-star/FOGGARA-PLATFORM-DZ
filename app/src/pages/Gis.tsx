import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { GisSite, WilayaMeta } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorText, DemoBadge } from "@/components/common";
import { NationalMap } from "@/components/NationalMap";
import "./command-center.css";

type SpatialFeature = {
  type: "Feature";
  id: number;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id: number;
    name: string;
    wilaya: string;
    commune: string | null;
    is_demo: boolean;
    distance_m?: number;
  };
};

type SitesGeoJSON = {
  type: "FeatureCollection";
  features: SpatialFeature[];
  metadata: {
    organization_scoped: boolean;
    count: number;
    crs: string;
    spatial_engine: string;
  };
};

export default function Gis() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<GisSite[] | null>(null);
  const [wilayas, setWilayas] = useState<WilayaMeta[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const wilayaFilter = searchParams.get("wilaya") || "";
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [nearest, setNearest] = useState<SpatialFeature[]>([]);
  const [spatialEngine, setSpatialEngine] = useState("—");
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.get<{ count: number; sites: GisSite[] }>("/gis/sites")
      .then((r) => setData(r.sites))
      .catch(setError);
    api.get<{ count: number; wilayas: WilayaMeta[] }>("/meta/wilayas")
      .then((r) => setWilayas(r.wilayas))
      .catch(() => setWilayas([]));
    api.get<SitesGeoJSON>("/gis/sites.geojson")
      .then((r) => setSpatialEngine(r.metadata.spatial_engine))
      .catch(setError);
  }, []);

  const filtered = useMemo(() => {
    if (!data) return null;
    if (!wilayaFilter) return data;
    const w = wilayas.find((x) => x.code === wilayaFilter);
    const names = [wilayaFilter, ...(w ? [w.ar, w.fr, w.en] : [])].map((name) => name.trim().toLocaleLowerCase());
    return data.filter((g) => names.includes(g.site.wilaya.trim().toLocaleLowerCase()));
  }, [data, wilayaFilter, wilayas]);

  const locale = i18n.language;
  const lang = locale === "fr" ? "fr" : locale === "en" ? "en" : "ar";
  const copy = lang === "fr"
    ? { eyebrow: "SIG NATIONAL · FOGGARA-DZ", title: "Territoire, ressources et projets dans une vue opérationnelle.", sites: "Sites visibles", projects: "Projets", resources: "Ressources", layers: "Couches opérationnelles", table: "Registre spatial", all: "Toute l’Algérie", selected: "Site sélectionné", nearest: "Sites les plus proches", distance: "Distance", engine: "Moteur spatial", noNearby: "Aucun autre site à proximité" }
    : lang === "en"
      ? { eyebrow: "NATIONAL GIS · FOGGARA-DZ", title: "Territory, resources and projects in one operational view.", sites: "Visible sites", projects: "Projects", resources: "Resources", layers: "Operational layers", table: "Spatial register", all: "All Algeria", selected: "Selected site", nearest: "Nearest sites", distance: "Distance", engine: "Spatial engine", noNearby: "No other nearby sites" }
      : { eyebrow: "GIS الوطني · FOGGARA-DZ", title: "الإقليم والموارد والمشاريع في رؤية تشغيلية واحدة.", sites: "المواقع الظاهرة", projects: "المشاريع", resources: "الموارد", layers: "الطبقات التشغيلية", table: "السجل المكاني", all: "كل الجزائر", selected: "الموقع المحدد", nearest: "أقرب المواقع", distance: "المسافة", engine: "المحرك المكاني", noNearby: "لا توجد مواقع قريبة أخرى" };

  const summary = useMemo(() => {
    const rows = filtered ?? [];
    return {
      sites: rows.length,
      projects: rows.reduce((n, row) => n + row.projects.length, 0),
      resources: rows.reduce((n, row) => n + row.resources.length, 0),
      assets: rows.reduce((n, row) => n + row.assets.length, 0),
    };
  }, [filtered]);

  const selectWilaya = (code: string) => {
    const next = new URLSearchParams(searchParams);
    if (code) next.set("wilaya", code);
    else next.delete("wilaya");
    setSearchParams(next);
  };

  const selectedSite = useMemo(
    () => (data ?? []).find((entry) => entry.site.id === selectedSiteId) ?? null,
    [data, selectedSiteId],
  );

  const selectSite = async (siteId: number) => {
    setSelectedSiteId(siteId);
    const entry = (data ?? []).find((row) => row.site.id === siteId);
    if (!entry) {
      setNearest([]);
      return;
    }
    try {
      const result = await api.get<{ count: number; items: SpatialFeature[] }>(
        `/gis/sites/nearest?lon=${entry.site.lon}&lat=${entry.site.lat}&limit=6`,
      );
      setNearest(result.items.filter((item) => item.properties.id !== siteId).slice(0, 5));
    } catch (err) {
      setNearest([]);
      setError(err);
    }
  };

  return (
    <div className="fg-command-center fg-gis-workspace" dir={i18n.dir()}>
      <section className="fg-gis-heading">
        <div>
          <p className="fg-command-eyebrow">{copy.eyebrow}</p>
          <h1>{copy.title}</h1>
        </div>
        <select
          aria-label={t("gis.filterWilaya")}
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={wilayaFilter}
          onChange={(e) => selectWilaya(e.target.value)}
        >
          <option value="">{copy.all}</option>
          {wilayas.map((w) => (
            <option key={w.code} value={w.code}>
              {w.code} — {locale === "fr" ? w.fr : locale === "en" ? w.en : w.ar}
            </option>
          ))}
        </select>
      </section>

      <ErrorText error={error} />

      <section className="fg-command-kpis" aria-label={copy.layers}>
        <div className="fg-command-kpi"><div><span>{copy.sites}</span></div><strong>{filtered === null ? "—" : summary.sites}</strong></div>
        <div className="fg-command-kpi"><div><span>{copy.projects}</span></div><strong>{filtered === null ? "—" : summary.projects}</strong></div>
        <div className="fg-command-kpi"><div><span>{copy.resources}</span></div><strong>{filtered === null ? "—" : summary.resources}</strong></div>
        <div className="fg-command-kpi"><div><span>{t("gis.assets")}</span></div><strong>{filtered === null ? "—" : summary.assets}</strong></div>
      </section>

      {data === null && !error ? (
        <Skeleton className="h-[430px] w-full rounded-2xl" />
      ) : (
        <NationalMap
          sites={data ?? []}
          wilayas={wilayas}
          selectedWilaya={wilayaFilter}
          selectedSiteId={selectedSiteId}
          onSelectWilaya={(code) => selectWilaya(code === wilayaFilter ? "" : code)}
          onSelectSite={(siteId) => void selectSite(siteId)}
          locale={lang}
        />
      )}

      <section className="fg-gis-spatial-panel" aria-label={copy.selected}>
        <div className="fg-gis-spatial-summary">
          <span>EPSG:4326 · {copy.engine}: <b>{spatialEngine}</b></span>
          {selectedSite ? (
            <>
              <h2>{copy.selected}: {selectedSite.site.name}</h2>
              <p>{selectedSite.site.wilaya}{selectedSite.site.commune ? ` · ${selectedSite.site.commune}` : ""}</p>
              <strong dir="ltr">{selectedSite.site.lat.toFixed(5)}, {selectedSite.site.lon.toFixed(5)}</strong>
            </>
          ) : (
            <p>{lang === "fr" ? "Sélectionnez un point sur la carte pour lancer une requête spatiale." : lang === "en" ? "Select a point on the map to run a spatial query." : "اختر نقطة على الخريطة لتشغيل استعلام مكاني."}</p>
          )}
        </div>
        <div className="fg-gis-nearest">
          <h3>{copy.nearest}</h3>
          {selectedSite && nearest.length === 0 ? <p>{copy.noNearby}</p> : (
            <ol>
              {nearest.map((item) => (
                <li key={item.properties.id}>
                  <button type="button" onClick={() => void selectSite(item.properties.id)}>
                    <span>{item.properties.name}<small>{item.properties.wilaya}</small></span>
                    <strong dir="ltr">{((item.properties.distance_m ?? 0) / 1000).toFixed(1)} km</strong>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="fg-gis-register">
        <div className="fg-command-section-title">
          <div><span>GIS / SITES / RESOURCES / PROJECTS</span><h2>{copy.table}</h2></div>
          <Badge variant="outline">{wilayaFilter || String(wilayas.length || 69)}</Badge>
        </div>
        <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{t("gis.manualOnly")}</p>

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
                  <TableRow key={g.site.id} className={selectedSiteId === g.site.id ? "bg-accent/50" : undefined} onClick={() => void selectSite(g.site.id)}>
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
                        <ul className="space-y-0.5">{g.resources.map((r) => <li key={r.id}>#{r.id} {r.name}</li>)}</ul>
                      )}
                    </TableCell>
                    <TableCell>
                      {g.assets.length === 0 ? t("common.none") : (
                        <ul className="space-y-0.5">{g.assets.map((a) => <li key={a.id}>#{a.id} {a.name}</li>)}</ul>
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
      </section>
    </div>
  );
}
