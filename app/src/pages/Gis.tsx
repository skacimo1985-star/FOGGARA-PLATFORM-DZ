import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  type GeoJSONSource,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Database, Layers3, MapPinned, ShieldCheck } from "lucide-react";

import { api } from "@/lib/api";
import type { GisSite } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorText, DemoBadge } from "@/components/common";

type WilayaReference = {
  id: number;
  reference_key: string;
  code: string | null;
  name: string;
  name_ar: string;
  name_fr: string;
  name_en: string;
  operational_from: string | null;
  verified: boolean;
};

type SiteFeature = {
  type: "Feature";
  id: number;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    id: number;
    name: string;
    wilaya: string;
    commune: string | null;
    is_demo: boolean;
  };
};

type SitesGeoJSON = {
  type: "FeatureCollection";
  features: SiteFeature[];
  metadata: {
    organization_scoped: boolean;
    count: number;
    crs: string;
  };
};

const EMPTY_GEOJSON: SitesGeoJSON = {
  type: "FeatureCollection",
  features: [],
  metadata: { organization_scoped: true, count: 0, crs: "EPSG:4326" },
};

function fitFeatures(map: MapLibreMap, features: SiteFeature[]) {
  if (features.length === 0) return;
  if (features.length === 1) {
    map.easeTo({ center: features[0].geometry.coordinates, zoom: 10, duration: 500 });
    return;
  }
  const bounds = new LngLatBounds();
  for (const feature of features) bounds.extend(feature.geometry.coordinates);
  map.fitBounds(bounds, { padding: 52, maxZoom: 11, duration: 500 });
}

export default function Gis() {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState<GisSite[] | null>(null);
  const [geojson, setGeojson] = useState<SitesGeoJSON>(EMPTY_GEOJSON);
  const [wilayas, setWilayas] = useState<WilayaReference[]>([]);
  const [wilayaFilter, setWilayaFilter] = useState("");
  const [selectedSiteId, setSelectedSiteId] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const mapReadyRef = useRef(false);
  const latestGeoJSONRef = useRef<SitesGeoJSON>(EMPTY_GEOJSON);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<{ count: number; sites: GisSite[] }>("/gis/sites"),
      api.get<SitesGeoJSON>("/gis/sites.geojson"),
      api.get<{ count: number; items: WilayaReference[] }>("/gis/wilayas"),
    ])
      .then(([siteDetails, siteGeoJSON, wilayaReference]) => {
        if (!active) return;
        setData(siteDetails.sites);
        setGeojson(siteGeoJSON);
        setWilayas(wilayaReference.items);
      })
      .catch((err: unknown) => {
        if (active) setError(err);
      });
    return () => {
      active = false;
    };
  }, []);

  const locale = i18n.language;
  const selectedWilaya = useMemo(
    () => wilayas.find((w) => String(w.id) === wilayaFilter) ?? null,
    [wilayaFilter, wilayas],
  );

  const wilayaAliases = useMemo(() => {
    if (!selectedWilaya) return null;
    return new Set([
      selectedWilaya.name_ar,
      selectedWilaya.name_fr,
      selectedWilaya.name_en,
    ]);
  }, [selectedWilaya]);

  const filtered = useMemo(() => {
    if (!data) return null;
    if (!wilayaAliases) return data;
    return data.filter((entry) => wilayaAliases.has(entry.site.wilaya));
  }, [data, wilayaAliases]);

  const filteredGeoJSON = useMemo<SitesGeoJSON>(() => {
    if (!wilayaAliases) return geojson;
    const features = geojson.features.filter((feature) => wilayaAliases.has(feature.properties.wilaya));
    return {
      ...geojson,
      features,
      metadata: { ...geojson.metadata, count: features.length },
    };
  }, [geojson, wilayaAliases]);

  const selected = useMemo(
    () => (filtered ?? []).find((entry) => entry.site.id === selectedSiteId) ?? null,
    [filtered, selectedSiteId],
  );

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      center: [2.6, 28.2],
      zoom: 4.2,
      attributionControl: false,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#f5f0e4" },
          },
        ],
      },
    });
    mapRef.current = map;
    map.addControl(new NavigationControl({ visualizePitch: true }), "top-right");

    map.on("load", () => {
      mapReadyRef.current = true;
      map.addSource("sites", {
        type: "geojson",
        data: EMPTY_GEOJSON,
      });
      map.addLayer({
        id: "sites-halo",
        type: "circle",
        source: "sites",
        paint: {
          "circle-radius": 10,
          "circle-color": "#0f766e",
          "circle-opacity": 0.16,
        },
      });
      map.addLayer({
        id: "sites-points",
        type: "circle",
        source: "sites",
        paint: {
          "circle-radius": 5,
          "circle-color": "#0f766e",
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });

      map.on("mouseenter", "sites-points", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "sites-points", () => {
        map.getCanvas().style.cursor = "";
      });
      map.on("click", "sites-points", (event) => {
        const feature = event.features?.[0];
        const rawId = feature?.properties?.id ?? feature?.id;
        const id = Number(rawId);
        if (Number.isFinite(id)) setSelectedSiteId(id);

        if (feature?.geometry.type === "Point") {
          const node = document.createElement("div");
          node.className = "text-sm";
          node.textContent = String(feature.properties?.name ?? "");
          new Popup({ closeButton: false, offset: 10 })
            .setLngLat(feature.geometry.coordinates as [number, number])
            .setDOMContent(node)
            .addTo(map);
        }
      });

      const source = map.getSource("sites") as GeoJSONSource;
      const currentGeoJSON = latestGeoJSONRef.current;
      source.setData(currentGeoJSON);
      fitFeatures(map, currentGeoJSON.features);
    });

    return () => {
      mapReadyRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    latestGeoJSONRef.current = filteredGeoJSON;
    const map = mapRef.current;
    if (!map || !mapReadyRef.current) return;
    const source = map.getSource("sites") as GeoJSONSource | undefined;
    source?.setData(filteredGeoJSON);
    fitFeatures(map, filteredGeoJSON.features);
  }, [filteredGeoJSON]);

  const transitioningCount = wilayas.filter((w) => w.operational_from !== null).length;
  const visibleCount = filteredGeoJSON.features.length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="t-section text-ink">{t("gis.title")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t("gis.workspaceIntro")}</p>
        </div>
        <select
          aria-label={t("gis.filterWilaya")}
          className="rounded-md border bg-background px-3 py-2 text-sm"
          value={wilayaFilter}
          onChange={(event) => setWilayaFilter(event.target.value)}
        >
          <option value="">{t("gis.allWilayas")}</option>
          {wilayas.map((wilaya) => {
            const label = locale === "fr" ? wilaya.name_fr : locale === "en" ? wilaya.name_en : wilaya.name_ar;
            return (
              <option key={wilaya.reference_key} value={wilaya.id}>
                {wilaya.code ? `${wilaya.code} — ` : ""}{label}
              </option>
            );
          })}
        </select>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Database className="h-4 w-4" />{t("gis.nationalReference")}</div>
          <div className="mt-2 text-2xl font-semibold text-ink">{wilayas.length || "—"}</div>
          <div className="mt-1 text-xs text-muted-foreground">{t("gis.verifiedWilayas")}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><MapPinned className="h-4 w-4" />{t("gis.visibleSites")}</div>
          <div className="mt-2 text-2xl font-semibold text-ink">{visibleCount}</div>
          <div className="mt-1 text-xs text-muted-foreground">{t("gis.organizationScoped")}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Layers3 className="h-4 w-4" />{t("gis.transitioning")}</div>
          <div className="mt-2 text-2xl font-semibold text-ink">{transitioningCount || "—"}</div>
          <div className="mt-1 text-xs text-muted-foreground">{t("gis.transitionNote")}</div>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" />{t("gis.spatialSecurity")}</div>
          <div className="mt-2 text-sm font-semibold text-ink">{t("gis.tenantIsolated")}</div>
          <div className="mt-1 text-xs text-muted-foreground">EPSG:4326 · GeoJSON</div>
        </div>
      </div>

      <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">{t("gis.privacyNote")}</p>
      <ErrorText error={error} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div>
              <h2 className="font-semibold text-ink">{t("gis.mapTitle")}</h2>
              <p className="text-xs text-muted-foreground">{t("gis.mapDescription")}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const map = mapRef.current;
                if (map) fitFeatures(map, filteredGeoJSON.features);
              }}
              disabled={filteredGeoJSON.features.length === 0}
            >
              {t("gis.zoomToData")}
            </Button>
          </div>
          <div ref={mapContainerRef} className="h-[520px] w-full bg-parchment" aria-label={t("gis.mapTitle")} />
        </section>

        <aside className="rounded-xl border bg-card p-4">
          <h2 className="font-semibold text-ink">{t("gis.selectedSite")}</h2>
          {!selected ? (
            <p className="mt-3 text-sm text-muted-foreground">{t("gis.selectSiteHint")}</p>
          ) : (
            <div className="mt-4 space-y-4">
              <div>
                <div className="text-lg font-semibold text-ink">
                  {selected.site.name}<DemoBadge show={selected.site.is_demo} />
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {selected.site.wilaya} · {selected.site.commune ?? t("common.none")}
                </div>
                <div className="mt-1 text-xs tabular-nums text-muted-foreground" dir="ltr">
                  {selected.site.lat.toFixed(5)}, {selected.site.lon.toFixed(5)}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border p-2">
                  <div className="text-lg font-semibold">{selected.projects.length}</div>
                  <div className="text-[11px] text-muted-foreground">{t("gis.projects")}</div>
                </div>
                <div className="rounded-lg border p-2">
                  <div className="text-lg font-semibold">{selected.resources.length}</div>
                  <div className="text-[11px] text-muted-foreground">{t("gis.resources")}</div>
                </div>
                <div className="rounded-lg border p-2">
                  <div className="text-lg font-semibold">{selected.assets.length}</div>
                  <div className="text-[11px] text-muted-foreground">{t("gis.assets")}</div>
                </div>
              </div>
              <div className="space-y-2">
                {selected.projects.map((project) => (
                  <div key={project.id} className="rounded-lg border p-3 text-sm">
                    <div className="font-medium">#{project.id} {project.title}</div>
                    <Badge className="mt-2" variant="outline">{t(`project.statuses.${project.status}`, project.status)}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold text-ink">{t("gis.tableTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("gis.tableDescription")}</p>
        </div>

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
                {(filtered ?? []).map((entry) => (
                  <TableRow
                    key={entry.site.id}
                    className={entry.site.id === selectedSiteId ? "bg-parchment/60" : undefined}
                    onClick={() => setSelectedSiteId(entry.site.id)}
                  >
                    <TableCell className="font-medium">
                      {entry.site.name}<DemoBadge show={entry.site.is_demo} />
                    </TableCell>
                    <TableCell>{entry.site.wilaya}</TableCell>
                    <TableCell>{entry.site.commune ?? t("common.none")}</TableCell>
                    <TableCell className="tabular-nums" dir="ltr">{entry.site.lat.toFixed(4)}, {entry.site.lon.toFixed(4)}</TableCell>
                    <TableCell>
                      {entry.projects.length === 0 ? t("common.none") : (
                        <ul className="space-y-0.5">
                          {entry.projects.map((project) => (
                            <li key={project.id}>#{project.id} {project.title} <Badge variant="outline">{t(`project.statuses.${project.status}`, project.status)}</Badge></li>
                          ))}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell>
                      {entry.resources.length === 0 ? t("common.none") : (
                        <ul className="space-y-0.5">
                          {entry.resources.map((resource) => <li key={resource.id}>#{resource.id} {resource.name}</li>)}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell>
                      {entry.assets.length === 0 ? t("common.none") : (
                        <ul className="space-y-0.5">
                          {entry.assets.map((asset) => <li key={asset.id}>#{asset.id} {asset.name}</li>)}
                        </ul>
                      )}
                    </TableCell>
                    <TableCell>
                      {entry.service_requests.length === 0 ? t("common.none") : (
                        <ul className="space-y-0.5">
                          {entry.service_requests.map((request) => (
                            <li key={request.id}>#{request.id} <Badge variant="outline">{t(`service.statuses.${request.status}`, request.status)}</Badge></li>
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
