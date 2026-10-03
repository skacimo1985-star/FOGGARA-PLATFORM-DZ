import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api, type Paged } from "@/lib/api";
import { useAuth } from "@/context/useAuth";
import type {
  IrrigationZone, Pump, Reservoir, Site, Valve, Vfd, WaterAllocation, Well,
} from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ErrorText, DemoBadge } from "@/components/common";

// سلسلة المياه: مصدر → تخزين → ضخ → توزيع → سقي → تخصيص (Contract §4)
const ALLOC_NEXT: Record<string, string[]> = {
  proposed: ["approved", "cancelled"],
  approved: ["executed", "cancelled"],
  executed: [],
  cancelled: [],
};

const statusVariant = (s: string) =>
  (s === "active" || s === "approved" || s === "executed" ? "default"
    : s === "cancelled" || s === "decommissioned" ? "destructive" : "outline") as
  "default" | "destructive" | "outline";

interface WaterData {
  wells: Well[]; reservoirs: Reservoir[]; pumps: Pump[]; vfds: Vfd[];
  zones: IrrigationZone[]; valves: Valve[]; allocations: WaterAllocation[];
}

export default function Water() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [d, setD] = useState<WaterData | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const canDecide = user?.role === "reviewer" || user?.role === "admin";

  const reload = useCallback(() => {
    setError(null);
    Promise.all([
      api.get<Well[]>("/water/wells"),
      api.get<Reservoir[]>("/water/reservoirs"),
      api.get<Pump[]>("/water/pumps"),
      api.get<Vfd[]>("/water/vfds"),
      api.get<IrrigationZone[]>("/water/zones"),
      api.get<Valve[]>("/water/valves"),
      api.get<WaterAllocation[]>("/water/allocations"),
    ])
      .then(([wells, reservoirs, pumps, vfds, zones, valves, allocations]) =>
        setD({ wells, reservoirs, pumps, vfds, zones, valves, allocations }))
      .catch(setError);
    api.get<Paged<Site>>("/sites?page_size=500").then(r=>setSites(r.items)).catch(() => {});
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const siteName = (id: number) => sites.find((s) => s.id === id)?.name ?? `#${id}`;
  const sourceName = (wellId: number | null, resId: number | null) =>
    wellId != null
      ? `${t("water.well")}: ${d?.wells.find((w) => w.id === wellId)?.name ?? `#${wellId}`}`
      : `${t("water.reservoir")}: ${d?.reservoirs.find((r) => r.id === resId)?.name ?? `#${resId}`}`;

  async function create(path: string, body: Record<string, unknown>, e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post(`/water/${path}`, body);
      (e.target as HTMLFormElement).reset();
      reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function transition(id: number, to: string) {
    setError(null);
    try {
      await api.post(`/water/allocations/${id}/transition`, { to });
      reload();
    } catch (err) {
      setError(err);
    }
  }

  if (!d && !error) return <Skeleton className="h-64 w-full" />;

  const num = (fd: FormData, k: string) => (fd.get(k) ? Number(fd.get(k)) : null);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="t-section text-ink">{t("water.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("water.subtitle")}</p>
      </div>
      <ErrorText error={error} />

      {d && (
        <Tabs defaultValue="wells">
          <TabsList className="flex-wrap">
            <TabsTrigger value="wells">{t("water.wells")} ({d.wells.length})</TabsTrigger>
            <TabsTrigger value="reservoirs">{t("water.reservoirs")} ({d.reservoirs.length})</TabsTrigger>
            <TabsTrigger value="pumps">{t("water.pumps")} ({d.pumps.length})</TabsTrigger>
            <TabsTrigger value="vfds">{t("water.vfds")} ({d.vfds.length})</TabsTrigger>
            <TabsTrigger value="valves">{t("water.valves")} ({d.valves.length})</TabsTrigger>
            <TabsTrigger value="zones">{t("water.zones")} ({d.zones.length})</TabsTrigger>
            <TabsTrigger value="allocations">{t("water.allocations")} ({d.allocations.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="wells">
            <Card>
              <CardHeader><CardTitle className="text-base">{t("water.addWell")}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={(e) => create("wells", {
                  site_id: Number(new FormData(e.currentTarget).get("site_id")),
                  name: String(new FormData(e.currentTarget).get("name")),
                  depth_m: num(new FormData(e.currentTarget), "depth_m"),
                }, e)} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label>{t("water.site")}</Label>
                    <select name="site_id" required className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                      {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1"><Label>{t("common.name")}</Label><Input name="name" required maxLength={255} /></div>
                  <div className="space-y-1"><Label>{t("water.depthM")}</Label><Input name="depth_m" type="number" step="any" min="0" dir="ltr" /></div>
                  <div className="flex items-end"><Button type="submit" disabled={busy}>{t("common.add")}</Button></div>
                </form>
                <WaterTable head={[t("common.name"), t("water.site"), t("water.depthM"), t("project.status")]}>
                  {d.wells.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell>{w.name}<DemoBadge show={w.is_demo} /></TableCell>
                      <TableCell>{siteName(w.site_id)}</TableCell>
                      <TableCell className="tabular-nums" dir="ltr">{w.depth_m ?? "—"}</TableCell>
                      <TableCell><Badge variant={statusVariant(w.status)}>{t(`water.statuses.${w.status}`)}</Badge></TableCell>
                    </TableRow>
                  ))}
                </WaterTable>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reservoirs">
            <Card>
              <CardHeader><CardTitle className="text-base">{t("water.addReservoir")}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={(e) => create("reservoirs", {
                  site_id: Number(new FormData(e.currentTarget).get("site_id")),
                  name: String(new FormData(e.currentTarget).get("name")),
                  capacity_m3: Number(new FormData(e.currentTarget).get("capacity_m3")),
                  min_level_m: num(new FormData(e.currentTarget), "min_level_m"),
                }, e)} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-5">
                  <div className="space-y-1">
                    <Label>{t("water.site")}</Label>
                    <select name="site_id" required className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                      {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1"><Label>{t("common.name")}</Label><Input name="name" required maxLength={255} /></div>
                  <div className="space-y-1"><Label>{t("water.capacityM3")}</Label><Input name="capacity_m3" type="number" step="any" min="0.01" required dir="ltr" /></div>
                  <div className="space-y-1"><Label>{t("water.minLevelM")}</Label><Input name="min_level_m" type="number" step="any" min="0" dir="ltr" /></div>
                  <div className="flex items-end"><Button type="submit" disabled={busy}>{t("common.add")}</Button></div>
                </form>
                <WaterTable head={[t("common.name"), t("water.site"), t("water.capacityM3"), t("water.minLevelM"), t("project.status")]}>
                  {d.reservoirs.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.name}<DemoBadge show={r.is_demo} /></TableCell>
                      <TableCell>{siteName(r.site_id)}</TableCell>
                      <TableCell className="tabular-nums" dir="ltr">{r.capacity_m3}</TableCell>
                      <TableCell className="tabular-nums" dir="ltr">{r.min_level_m ?? "—"}</TableCell>
                      <TableCell><Badge variant={statusVariant(r.status)}>{t(`water.statuses.${r.status}`)}</Badge></TableCell>
                    </TableRow>
                  ))}
                </WaterTable>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pumps">
            <Card>
              <CardHeader><CardTitle className="text-base">{t("water.addPump")}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={(e) => {
                  const fd = new FormData(e.currentTarget);
                  const src = String(fd.get("source"));
                  create("pumps", {
                    site_id: Number(fd.get("site_id")),
                    name: String(fd.get("name")),
                    well_id: src.startsWith("w") ? Number(src.slice(1)) : null,
                    reservoir_id: src.startsWith("r") ? Number(src.slice(1)) : null,
                    rated_power_kw: num(fd, "rated_power_kw"),
                    rated_flow_l_s: num(fd, "rated_flow_l_s"),
                  }, e);
                }} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-5">
                  <div className="space-y-1">
                    <Label>{t("water.site")}</Label>
                    <select name="site_id" required className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                      {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1"><Label>{t("common.name")}</Label><Input name="name" required maxLength={255} /></div>
                  <div className="space-y-1">
                    <Label>{t("water.source")}</Label>
                    <select name="source" required className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                      <optgroup label={t("water.wells")}>
                        {d.wells.map((w) => <option key={w.id} value={`w${w.id}`}>{w.name}</option>)}
                      </optgroup>
                      <optgroup label={t("water.reservoirs")}>
                        {d.reservoirs.map((r) => <option key={r.id} value={`r${r.id}`}>{r.name}</option>)}
                      </optgroup>
                    </select>
                  </div>
                  <div className="space-y-1"><Label>{t("water.ratedFlow")}</Label><Input name="rated_flow_l_s" type="number" step="any" min="0" dir="ltr" /></div>
                  <div className="flex items-end"><Button type="submit" disabled={busy}>{t("common.add")}</Button></div>
                </form>
                <WaterTable head={[t("common.name"), t("water.source"), t("water.ratedFlow"), t("project.status")]}>
                  {d.pumps.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.name}<DemoBadge show={p.is_demo} /></TableCell>
                      <TableCell>{sourceName(p.well_id, p.reservoir_id)}</TableCell>
                      <TableCell className="tabular-nums" dir="ltr">{p.rated_flow_l_s ?? "—"}</TableCell>
                      <TableCell><Badge variant={statusVariant(p.status)}>{t(`water.statuses.${p.status}`)}</Badge></TableCell>
                    </TableRow>
                  ))}
                </WaterTable>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="vfds">
            <Card>
              <CardHeader><CardTitle className="text-base">{t("water.addVfd")}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={(e) => create("vfds", {
                  pump_id: Number(new FormData(e.currentTarget).get("pump_id")),
                  model: String(new FormData(e.currentTarget).get("model")),
                  max_frequency_hz: num(new FormData(e.currentTarget), "max_frequency_hz"),
                }, e)} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label>{t("water.pump")}</Label>
                    <select name="pump_id" required className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                      {d.pumps.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1"><Label>{t("water.model")}</Label><Input name="model" required maxLength={255} /></div>
                  <div className="space-y-1"><Label>{t("water.maxFreq")}</Label><Input name="max_frequency_hz" type="number" step="any" min="0.1" dir="ltr" /></div>
                  <div className="flex items-end"><Button type="submit" disabled={busy}>{t("common.add")}</Button></div>
                </form>
                <WaterTable head={[t("water.model"), t("water.pump"), t("water.maxFreq"), t("project.status")]}>
                  {d.vfds.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>{v.model}<DemoBadge show={v.is_demo} /></TableCell>
                      <TableCell>{d.pumps.find((p) => p.id === v.pump_id)?.name ?? `#${v.pump_id}`}</TableCell>
                      <TableCell className="tabular-nums" dir="ltr">{v.max_frequency_hz ?? "—"}</TableCell>
                      <TableCell><Badge variant={statusVariant(v.status)}>{t(`water.statuses.${v.status}`)}</Badge></TableCell>
                    </TableRow>
                  ))}
                </WaterTable>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="valves">
            <Card>
              <CardHeader><CardTitle className="text-base">{t("water.addValve")}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={(e) => {
                  const fd = new FormData(e.currentTarget);
                  create("valves", {
                    site_id: Number(fd.get("site_id")),
                    name: String(fd.get("name")),
                    zone_id: num(fd, "zone_id"),
                    diameter_mm: num(fd, "diameter_mm"),
                    normally_open: fd.get("normally_open") === "on",
                  }, e);
                }} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-5">
                  <div className="space-y-1">
                    <Label>{t("water.site")}</Label>
                    <select name="site_id" required className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                      {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1"><Label>{t("common.name")}</Label><Input name="name" required maxLength={255} /></div>
                  <div className="space-y-1">
                    <Label>{t("water.zone")}</Label>
                    <select name="zone_id" className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                      <option value="">{t("common.none")}</option>
                      {d.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1"><Label>{t("water.diameterMm")}</Label><Input name="diameter_mm" type="number" step="any" min="0.1" dir="ltr" /></div>
                  <div className="flex items-end"><Button type="submit" disabled={busy}>{t("common.add")}</Button></div>
                </form>
                <WaterTable head={[t("common.name"), t("water.zone"), t("water.diameterMm"), t("project.status")]}>
                  {d.valves.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>{v.name}<DemoBadge show={v.is_demo} /></TableCell>
                      <TableCell>{v.zone_id ? d.zones.find((z) => z.id === v.zone_id)?.name ?? `#${v.zone_id}` : "—"}</TableCell>
                      <TableCell className="tabular-nums" dir="ltr">{v.diameter_mm ?? "—"}</TableCell>
                      <TableCell><Badge variant={statusVariant(v.status)}>{t(`water.statuses.${v.status}`)}</Badge></TableCell>
                    </TableRow>
                  ))}
                </WaterTable>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="zones">
            <Card>
              <CardHeader><CardTitle className="text-base">{t("water.addZone")}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={(e) => {
                  const fd = new FormData(e.currentTarget);
                  create("zones", {
                    site_id: Number(fd.get("site_id")),
                    name: String(fd.get("name")),
                    area_ha: Number(fd.get("area_ha")),
                    soil_type: String(fd.get("soil_type") || "") || null,
                    crop_hint: String(fd.get("crop_hint") || "") || null,
                  }, e);
                }} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-6">
                  <div className="space-y-1">
                    <Label>{t("water.site")}</Label>
                    <select name="site_id" required className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                      {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1"><Label>{t("common.name")}</Label><Input name="name" required maxLength={255} /></div>
                  <div className="space-y-1"><Label>{t("water.areaHa")}</Label><Input name="area_ha" type="number" step="any" min="0.01" required dir="ltr" /></div>
                  <div className="space-y-1"><Label>{t("water.soilType")}</Label><Input name="soil_type" maxLength={100} /></div>
                  <div className="space-y-1"><Label>{t("water.cropHint")}</Label><Input name="crop_hint" maxLength={100} /></div>
                  <div className="flex items-end"><Button type="submit" disabled={busy}>{t("common.add")}</Button></div>
                </form>
                <WaterTable head={[t("common.name"), t("water.site"), t("water.areaHa"), t("water.soilType"), t("water.cropHint")]}>
                  {d.zones.map((z) => (
                    <TableRow key={z.id}>
                      <TableCell>{z.name}<DemoBadge show={z.is_demo} /></TableCell>
                      <TableCell>{siteName(z.site_id)}</TableCell>
                      <TableCell className="tabular-nums" dir="ltr">{z.area_ha}</TableCell>
                      <TableCell>{z.soil_type ?? "—"}</TableCell>
                      <TableCell>{z.crop_hint ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </WaterTable>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="allocations">
            <Card>
              <CardHeader><CardTitle className="text-base">{t("water.addAllocation")}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <form onSubmit={(e) => {
                  const fd = new FormData(e.currentTarget);
                  const src = String(fd.get("source"));
                  create("allocations", {
                    zone_id: Number(fd.get("zone_id")),
                    well_id: src.startsWith("w") ? Number(src.slice(1)) : null,
                    reservoir_id: src.startsWith("r") ? Number(src.slice(1)) : null,
                    volume_m3: Number(fd.get("volume_m3")),
                    period_start: new Date(String(fd.get("period_start"))).toISOString(),
                    period_end: new Date(String(fd.get("period_end"))).toISOString(),
                  }, e);
                }} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-6">
                  <div className="space-y-1">
                    <Label>{t("water.zone")}</Label>
                    <select name="zone_id" required className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                      {d.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>{t("water.source")}</Label>
                    <select name="source" required className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                      <optgroup label={t("water.wells")}>
                        {d.wells.map((w) => <option key={w.id} value={`w${w.id}`}>{w.name}</option>)}
                      </optgroup>
                      <optgroup label={t("water.reservoirs")}>
                        {d.reservoirs.map((r) => <option key={r.id} value={`r${r.id}`}>{r.name}</option>)}
                      </optgroup>
                    </select>
                  </div>
                  <div className="space-y-1"><Label>{t("water.volumeM3")}</Label><Input name="volume_m3" type="number" step="any" min="0.01" required dir="ltr" /></div>
                  <div className="space-y-1"><Label>{t("water.periodStart")}</Label><Input name="period_start" type="datetime-local" required dir="ltr" /></div>
                  <div className="space-y-1"><Label>{t("water.periodEnd")}</Label><Input name="period_end" type="datetime-local" required dir="ltr" /></div>
                  <div className="flex items-end"><Button type="submit" disabled={busy}>{t("common.add")}</Button></div>
                </form>
                <WaterTable head={[t("water.zone"), t("water.source"), t("water.volumeM3"), t("water.period"), t("project.status"), t("common.actions")]}>
                  {d.allocations.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell>{d.zones.find((z) => z.id === a.zone_id)?.name ?? `#${a.zone_id}`}<DemoBadge show={a.is_demo} /></TableCell>
                      <TableCell>{sourceName(a.well_id, a.reservoir_id)}</TableCell>
                      <TableCell className="tabular-nums" dir="ltr">{a.volume_m3}</TableCell>
                      <TableCell className="tabular-nums text-xs" dir="ltr">
                        {new Date(a.period_start).toLocaleDateString()} → {new Date(a.period_end).toLocaleDateString()}
                      </TableCell>
                      <TableCell><Badge variant={statusVariant(a.status)}>{t(`water.allocStatuses.${a.status}`)}</Badge></TableCell>
                      <TableCell>
                        {canDecide && ALLOC_NEXT[a.status].map((to) => (
                          <Button key={to} size="sm" variant="secondary" className="me-1"
                                  onClick={() => transition(a.id, to)}>
                            {t(`water.transitions.${to}`)}
                          </Button>
                        ))}
                      </TableCell>
                    </TableRow>
                  ))}
                </WaterTable>
                <p className="text-xs text-muted-foreground">{t("water.allocNote")}</p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

function WaterTable({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>{head.map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}
