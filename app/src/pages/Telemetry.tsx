import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { Device, Sensor, TelemetryAggregate, TelemetryReading } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorText, DemoBadge } from "@/components/common";

// لوحة القياس عن بُعد (Phase 03 §27) — عرض فقط، لا تحكم بمعدات
const QUALITIES = ["VALID", "INVALID", "SUSPECT", "MISSING"] as const;

const qVariant = (q: string) =>
  (q === "VALID" ? "default" : q === "INVALID" ? "destructive" : "outline") as
  "default" | "destructive" | "outline";

export default function Telemetry() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<Device[]>([]);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [readings, setReadings] = useState<TelemetryReading[] | null>(null);
  const [latest, setLatest] = useState<TelemetryReading[]>([]);
  const [agg, setAgg] = useState<TelemetryAggregate | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState({ device_id: "", sensor_id: "", metric: "", quality: "" });

  useEffect(() => {
    Promise.all([
      api.get<Device[]>("/telemetry/devices"),
      api.get<Sensor[]>("/telemetry/sensors"),
      api.get<TelemetryReading[]>("/telemetry/latest"),
    ]).then(([d, s, l]) => { setDevices(d); setSensors(s); setLatest(l); })
      .catch(setError);
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filter.device_id) params.set("device_id", filter.device_id);
    if (filter.sensor_id) params.set("sensor_id", filter.sensor_id);
    if (filter.metric) params.set("metric", filter.metric);
    if (filter.quality) params.set("quality", filter.quality);
    const q = params.toString();
    setReadings(await api.get<TelemetryReading[]>(`/telemetry${q ? `?${q}` : ""}`));
    setAgg(null);
    if (filter.sensor_id) {
      setAgg(await api.get<TelemetryAggregate>(
        `/telemetry/aggregate?sensor_id=${filter.sensor_id}`));
    }
  }, [filter]);

  useEffect(() => { load().catch(setError); }, [load]);

  const deviceName = (id: number) => devices.find((d) => d.id === id)?.name ?? `#${id}`;
  const sensorName = (id: number) => sensors.find((s) => s.id === id)?.name ?? `#${id}`;
  const metrics = [...new Set(sensors.map((s) => s.metric))];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{t("telemetry.title")}</h1>
        <Badge variant="outline">{t("telemetry.readOnly")}</Badge>
      </div>
      <ErrorText error={error} />

      {/* أحدث القراءات لكل مستشعر */}
      <Card>
        <CardHeader><CardTitle>{t("telemetry.latest")}</CardTitle></CardHeader>
        <CardContent>
          {latest.length === 0 && <p className="text-muted-foreground">{t("telemetry.empty")}</p>}
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {latest.map((r) => (
              <div key={r.id} className="border rounded-lg p-3">
                <div className="flex justify-between items-center">
                  <span className="font-medium">{sensorName(r.sensor_id)}</span>
                  {r.is_demo && <DemoBadge show />}
                </div>
                <div className="text-2xl font-bold mt-1">
                  {r.value ?? "—"} <span className="text-sm font-normal">{r.unit}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {deviceName(r.device_id)} · {new Date(r.observed_at).toLocaleString()} · {t(`telemetry.sources.${r.source}`)}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* الفلاتر */}
      <div className="flex flex-wrap gap-2 items-center">
        <select className="border rounded-md px-2 py-1.5 text-sm bg-background" value={filter.device_id}
          onChange={(e) => setFilter((p) => ({ ...p, device_id: e.target.value }))}>
          <option value="">{t("telemetry.allDevices")}</option>
          {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select className="border rounded-md px-2 py-1.5 text-sm bg-background" value={filter.sensor_id}
          onChange={(e) => setFilter((p) => ({ ...p, sensor_id: e.target.value }))}>
          <option value="">{t("telemetry.allSensors")}</option>
          {sensors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="border rounded-md px-2 py-1.5 text-sm bg-background" value={filter.metric}
          onChange={(e) => setFilter((p) => ({ ...p, metric: e.target.value }))}>
          <option value="">{t("telemetry.allMetrics")}</option>
          {metrics.map((m) => <option key={m} value={m}>{t(`telemetry.metrics.${m}`, m)}</option>)}
        </select>
        <select className="border rounded-md px-2 py-1.5 text-sm bg-background" value={filter.quality}
          onChange={(e) => setFilter((p) => ({ ...p, quality: e.target.value }))}>
          <option value="">{t("telemetry.allQualities")}</option>
          {QUALITIES.map((q) => <option key={q} value={q}>{t(`telemetry.qualities.${q}`)}</option>)}
        </select>
      </div>

      {/* التجميع الحتمي */}
      {agg && (
        <Card>
          <CardHeader><CardTitle>{t("telemetry.aggregateTitle")} — {agg.metric} ({agg.unit})</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-4 text-sm">
            <span>{t("telemetry.agg.latest")}: <b>{agg.latest ?? "—"}</b></span>
            <span>{t("telemetry.agg.min")}: <b>{agg.min ?? "—"}</b></span>
            <span>{t("telemetry.agg.max")}: <b>{agg.max ?? "—"}</b></span>
            <span>{t("telemetry.agg.avg")}: <b>{agg.avg ?? "—"}</b></span>
            <span>{t("telemetry.agg.sum")}: <b>{agg.sum ?? "—"}</b></span>
            <span>{t("telemetry.agg.count")}: <b>{agg.count}</b></span>
          </CardContent>
        </Card>
      )}

      {/* القراءات */}
      <Card>
        <CardHeader><CardTitle>{t("telemetry.readings")}</CardTitle></CardHeader>
        <CardContent>
          {readings === null && <Skeleton className="h-40 w-full" />}
          {readings?.length === 0 && <p className="text-muted-foreground">{t("telemetry.empty")}</p>}
          {readings && readings.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("telemetry.sensor")}</TableHead>
                  <TableHead>{t("telemetry.metric")}</TableHead>
                  <TableHead>{t("telemetry.value")}</TableHead>
                  <TableHead>{t("telemetry.quality")}</TableHead>
                  <TableHead>{t("telemetry.source")}</TableHead>
                  <TableHead>{t("telemetry.observedAt")}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readings.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{sensorName(r.sensor_id)}</TableCell>
                    <TableCell>{t(`telemetry.metrics.${r.metric}`, r.metric)}</TableCell>
                    <TableCell>{r.value ?? "—"} {r.unit}</TableCell>
                    <TableCell><Badge variant={qVariant(r.quality)}>{t(`telemetry.qualities.${r.quality}`)}</Badge></TableCell>
                    <TableCell>{t(`telemetry.sources.${r.source}`)}</TableCell>
                    <TableCell>{new Date(r.observed_at).toLocaleString()}</TableCell>
                    <TableCell>{r.is_demo && <DemoBadge show />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-sm text-muted-foreground">
        <Link to="/app/simulator" className="underline">{t("telemetry.goSimulator")}</Link>
      </p>
    </div>
  );
}
