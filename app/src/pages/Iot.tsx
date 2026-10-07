import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Activity, Cpu, Gauge, Radio, Send, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { Device, Sensor, TelemetryReading } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorText, DemoBadge } from "@/components/common";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";

const DEVICE_TYPES = [
  "well_controller", "pump_controller", "reservoir_monitor",
  "irrigation_controller", "energy_meter", "environmental_station", "generic_sensor_node",
];
const SENSOR_TYPES = [
  "water_level", "flow_rate", "pressure", "temperature",
  "pump_state", "valve_state", "energy", "voltage", "current", "frequency",
];
const UNITS = ["L/s", "m3/h", "m3", "m", "bar", "°C", "%", "kW", "kWh", "V", "A", "Hz", "state"];

export default function Iot() {
  const { i18n } = useTranslation();
  const lang = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const copy = lang === "fr" ? {
    title: "Centre IoT & Edge", subtitle: "Configurer les nœuds logiques, les capteurs et les lectures validées. Le matériel terrain n’est pas déclaré connecté sans passerelle réellement commissionnée.",
    devices: "Appareils", sensors: "Capteurs", latest: "Dernières lectures", addDevice: "Ajouter un appareil logique", addSensor: "Ajouter un capteur", ingest: "Enregistrer une lecture", name: "Nom", type: "Type", device: "Appareil", metric: "Mesure", unit: "Unité", min: "Min.", max: "Max.", value: "Valeur", save: "Enregistrer", edge: "Contrat Edge disponible", edgeNote: "Le backend accepte des enveloppes normalisées depuis mqtt, modbus, opcua, rest, thingsboard_gateway ou custom via /api/telemetry/edge/ingest. Cela ne prouve pas qu’une passerelle physique est actuellement connectée.", openTelemetry: "Ouvrir la télémétrie", openSimulator: "Ouvrir le simulateur", noData: "Aucune donnée", simulated: "SIMULATED", quality: "Qualité",
  } : lang === "en" ? {
    title: "IoT & Edge center", subtitle: "Configure logical nodes, sensors and validated readings. Field hardware is never shown as connected unless a real gateway has been commissioned.",
    devices: "Devices", sensors: "Sensors", latest: "Latest readings", addDevice: "Add logical device", addSensor: "Add sensor", ingest: "Record reading", name: "Name", type: "Type", device: "Device", metric: "Metric", unit: "Unit", min: "Min.", max: "Max.", value: "Value", save: "Save", edge: "Edge contract available", edgeNote: "The backend accepts normalized envelopes from mqtt, modbus, opcua, rest, thingsboard_gateway or custom through /api/telemetry/edge/ingest. This does not claim a physical gateway is currently connected.", openTelemetry: "Open telemetry", openSimulator: "Open simulator", noData: "No data", simulated: "SIMULATED", quality: "Quality",
  } : {
    title: "مركز IoT وEdge", subtitle: "تهيئة العقد المنطقية والحساسات والقراءات التي يتحقق منها الخادم. لا تُعرض أي معدات ميدانية على أنها متصلة ما لم توجد بوابة فعلية مُشغّلة.",
    devices: "الأجهزة", sensors: "الحساسات", latest: "آخر القراءات", addDevice: "إضافة جهاز منطقي", addSensor: "إضافة حساس", ingest: "تسجيل قراءة", name: "الاسم", type: "النوع", device: "الجهاز", metric: "المؤشر", unit: "الوحدة", min: "الأدنى", max: "الأعلى", value: "القيمة", save: "حفظ", edge: "عقد Edge متاح", edgeNote: "يقبل الـBackend رسائل معيارية من mqtt أو modbus أو opcua أو rest أو thingsboard_gateway أو custom عبر /api/telemetry/edge/ingest. هذا لا يعني وجود بوابة ميدانية متصلة الآن.", openTelemetry: "فتح القياس عن بُعد", openSimulator: "فتح المحاكي", noData: "لا توجد بيانات", simulated: "محاكاة", quality: "الجودة",
  };

  const [devices, setDevices] = useState<Device[]>([]);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [latest, setLatest] = useState<TelemetryReading[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setError(null);
    const [d, s, l] = await Promise.all([
      api.get<Device[]>("/telemetry/devices"),
      api.get<Sensor[]>("/telemetry/sensors"),
      api.get<TelemetryReading[]>("/telemetry/latest"),
    ]);
    setDevices(d);
    setSensors(s);
    setLatest(l);
  }, []);

  useEffect(() => { reload().catch(setError); }, [reload]);

  const deviceName = (id: number) => devices.find((device) => device.id === id)?.name ?? `#${id}`;
  const sensorName = (id: number) => sensors.find((sensor) => sensor.id === id)?.name ?? `#${id}`;

  async function addDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("device"); setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await api.post("/telemetry/devices", {
        name: String(form.get("name") || ""),
        device_type: String(form.get("device_type") || "generic_sensor_node"),
        subject_type: null,
        subject_id: null,
        configuration: { created_from: "iot_center" },
      });
      event.currentTarget.reset();
      await reload();
    } catch (err) { setError(err); } finally { setBusy(null); }
  }

  async function addSensor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("sensor"); setError(null);
    const form = new FormData(event.currentTarget);
    const optional = (key: string) => {
      const raw = String(form.get(key) ?? "").trim();
      return raw === "" ? null : Number(raw);
    };
    try {
      await api.post("/telemetry/sensors", {
        device_id: Number(form.get("device_id")),
        name: String(form.get("name") || ""),
        sensor_type: String(form.get("sensor_type") || "temperature"),
        metric: String(form.get("metric") || ""),
        unit: String(form.get("unit") || "°C"),
        min_value: optional("min_value"),
        max_value: optional("max_value"),
        subject_type: null,
        subject_id: null,
        configuration: { created_from: "iot_center" },
      });
      event.currentTarget.reset();
      await reload();
    } catch (err) { setError(err); } finally { setBusy(null); }
  }

  async function ingest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("reading"); setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await api.post("/telemetry/ingest", {
        sensor_id: Number(form.get("sensor_id")),
        value: Number(form.get("value")),
        observed_at: new Date().toISOString(),
      });
      event.currentTarget.reset();
      await reload();
    } catch (err) { setError(err); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-6" dir={i18n.dir()} data-testid="iot-operational-center">
      <header className="rounded-2xl border bg-gradient-to-br from-emerald-500/10 via-background to-sky-500/10 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">FOGGARA / IOT EDGE</p>
        <h1 className="mt-1 text-2xl font-bold">{copy.title}</h1>
        <p className="mt-2 max-w-4xl text-sm text-muted-foreground">{copy.subtitle}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link to="/app/telemetry" className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-semibold"><Activity size={16}/>{copy.openTelemetry}</Link>
          <Link to="/app/simulator" className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-semibold"><Workflow size={16}/>{copy.openSimulator}</Link>
        </div>
      </header>

      <ErrorText error={error} />

      <section className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="pt-5"><span className="text-xs text-muted-foreground">{copy.devices}</span><strong className="mt-1 block text-3xl">{devices.length}</strong></CardContent></Card>
        <Card><CardContent className="pt-5"><span className="text-xs text-muted-foreground">{copy.sensors}</span><strong className="mt-1 block text-3xl">{sensors.length}</strong></CardContent></Card>
        <Card><CardContent className="pt-5"><span className="text-xs text-muted-foreground">{copy.latest}</span><strong className="mt-1 block text-3xl">{latest.length}</strong></CardContent></Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Cpu size={18}/>{copy.addDevice}</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={addDevice}>
              <div><Label>{copy.name}</Label><Input name="name" required maxLength={255}/></div>
              <div><Label>{copy.type}</Label><select name="device_type" className="w-full rounded-md border bg-background px-3 py-2 text-sm">{DEVICE_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
              <Button type="submit" disabled={busy !== null}>{copy.save}</Button>
              <p className="text-xs text-muted-foreground">{copy.simulated}</p>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Gauge size={18}/>{copy.addSensor}</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={addSensor}>
              <div><Label>{copy.device}</Label><select name="device_id" required className="w-full rounded-md border bg-background px-3 py-2 text-sm">{devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select></div>
              <div><Label>{copy.name}</Label><Input name="name" required maxLength={255}/></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>{copy.type}</Label><select name="sensor_type" className="w-full rounded-md border bg-background px-3 py-2 text-sm">{SENSOR_TYPES.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
                <div><Label>{copy.unit}</Label><select name="unit" className="w-full rounded-md border bg-background px-3 py-2 text-sm">{UNITS.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
              </div>
              <div><Label>{copy.metric}</Label><Input name="metric" required maxLength={50} placeholder="soil_moisture"/></div>
              <div className="grid grid-cols-2 gap-2"><div><Label>{copy.min}</Label><Input name="min_value" type="number" step="any"/></div><div><Label>{copy.max}</Label><Input name="max_value" type="number" step="any"/></div></div>
              <Button type="submit" disabled={busy !== null || devices.length === 0}>{copy.save}</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Send size={18}/>{copy.ingest}</CardTitle></CardHeader>
          <CardContent>
            <form className="grid gap-3" onSubmit={ingest}>
              <div><Label>{copy.sensors}</Label><select name="sensor_id" required className="w-full rounded-md border bg-background px-3 py-2 text-sm">{sensors.map((sensor) => <option key={sensor.id} value={sensor.id}>{sensor.name} · {sensor.metric}</option>)}</select></div>
              <div><Label>{copy.value}</Label><Input name="value" type="number" step="any" required/></div>
              <Button type="submit" disabled={busy !== null || sensors.length === 0}>{copy.save}</Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Radio size={18}/>{copy.edge}</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{copy.edgeNote}</p>
          <code className="block overflow-x-auto rounded-md border bg-muted/40 p-3 text-xs" dir="ltr">POST /api/telemetry/edge/ingest · gateway=mqtt|modbus|opcua|rest|thingsboard_gateway|custom</code>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{copy.latest}</CardTitle></CardHeader>
        <CardContent>
          {latest.length === 0 ? <p className="text-sm text-muted-foreground">{copy.noData}</p> : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {latest.map((reading) => (
                <article key={reading.id} className="rounded-xl border bg-background p-3">
                  <div className="flex items-center justify-between gap-2">
                    <strong>{sensorName(reading.sensor_id)}</strong>
                    <div className="flex items-center gap-1">
                      <ProvenanceBadge kind={reading.simulation_run_id !== null ? "COMPUTED" : "OBSERVED"} />
                      {reading.is_demo ? <DemoBadge show /> : null}
                    </div>
                  </div>
                  <div className="mt-2 text-2xl font-bold tabular-nums" dir="ltr">{reading.value ?? "—"} <small className="text-sm font-normal">{reading.unit}</small></div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>{deviceName(reading.device_id)}</span>
                    <Badge variant="outline">{copy.quality}: {reading.quality}</Badge>
                    <span>{new Date(reading.observed_at).toLocaleString(i18n.language)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
