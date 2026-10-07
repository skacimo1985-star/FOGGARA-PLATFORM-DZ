import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Network, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import type { Device, PlannedStatus, Sensor } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorText } from "@/components/common";

const SIM_SENSOR_PRESETS = [
  { key: "water_level", sensor_type: "water_level", metric: "water_level", unit: "m", min: 0, max: 20, base: 5 },
  { key: "flow_rate", sensor_type: "flow_rate", metric: "flow_rate", unit: "L/s", min: 0, max: 100, base: 12 },
  { key: "pressure", sensor_type: "pressure", metric: "pressure", unit: "bar", min: 0, max: 25, base: 3 },
  { key: "temperature", sensor_type: "temperature", metric: "temperature", unit: "°C", min: -20, max: 80, base: 25 },
  { key: "energy", sensor_type: "energy", metric: "energy", unit: "kWh", min: 0, max: 10000, base: 100 },
  { key: "voltage", sensor_type: "voltage", metric: "voltage", unit: "V", min: 0, max: 500, base: 230 },
  { key: "current", sensor_type: "current", metric: "current", unit: "A", min: 0, max: 200, base: 10 },
  { key: "frequency", sensor_type: "frequency", metric: "frequency", unit: "Hz", min: 0, max: 100, base: 50 },
] as const;

export default function Iot() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<PlannedStatus | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const lang = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const copy = lang === "fr"
    ? {
        capabilities: "État réel des capacités",
        available: "Disponible",
        notImplemented: "Non implémenté",
        notConfigured: "Non configuré",
        note: "Disponible signifie disponible dans la plateforme, pas connecté à un équipement terrain vérifié.",
        labels: {
          simulation_registry: "Registre de simulation",
          deterministic_simulator: "Simulateur déterministe",
          authenticated_telemetry_api: "API télémétrie authentifiée",
          vendor_neutral_edge_envelope: "Enveloppe edge multi-protocole",
          verified_device_provisioning: "Provisionnement d’identité appareil",
          field_broker_connectivity: "Connexion broker terrain",
        },
      }
    : lang === "en"
      ? {
          capabilities: "Actual capability state",
          available: "Available",
          notImplemented: "Not implemented",
          notConfigured: "Not configured",
          note: "Available means implemented in the platform, not connected to a verified field device.",
          labels: {
            simulation_registry: "Simulation registry",
            deterministic_simulator: "Deterministic simulator",
            authenticated_telemetry_api: "Authenticated telemetry API",
            vendor_neutral_edge_envelope: "Vendor-neutral edge envelope",
            verified_device_provisioning: "Verified device provisioning",
            field_broker_connectivity: "Field broker connectivity",
          },
        }
      : {
          capabilities: "الحالة الفعلية لقدرات IoT",
          available: "متاح",
          notImplemented: "غير منفذ",
          notConfigured: "غير مهيأ",
          note: "كلمة متاح تعني أن الوظيفة منفذة داخل المنصة، ولا تعني وجود جهاز ميداني موثق ومتصل.",
          labels: {
            simulation_registry: "سجل المحاكاة",
            deterministic_simulator: "المحاكي الحتمي",
            authenticated_telemetry_api: "API القياس المصادق عليه",
            vendor_neutral_edge_envelope: "غلاف Edge متعدد البروتوكولات",
            verified_device_provisioning: "تهيئة هوية الجهاز الموثقة",
            field_broker_connectivity: "اتصال وسيط الأجهزة الميداني",
          },
        };

  const labCopy = lang === "fr"
    ? {
        title: "Laboratoire de simulation",
        note: "Créez des appareils et capteurs synthétiques appartenant à votre organisation. Ils alimentent uniquement le simulateur et ne représentent pas une connexion terrain.",
        newDevice: "Nouvel appareil simulé",
        deviceName: "Nom de l’appareil",
        deviceType: "Type",
        newSensor: "Nouveau capteur simulé",
        sensorName: "Nom du capteur",
        measurement: "Mesure",
        create: "Créer",
        noDevice: "Créez d’abord un appareil simulé.",
        inventory: "Inventaire simulation",
        devices: "appareils",
        sensors: "capteurs",
      }
    : lang === "en"
      ? {
          title: "Simulation lab",
          note: "Create synthetic devices and sensors owned by your organization. They feed only the simulator and do not represent a field connection.",
          newDevice: "New simulated device",
          deviceName: "Device name",
          deviceType: "Type",
          newSensor: "New simulated sensor",
          sensorName: "Sensor name",
          measurement: "Measurement",
          create: "Create",
          noDevice: "Create a simulated device first.",
          inventory: "Simulation inventory",
          devices: "devices",
          sensors: "sensors",
        }
      : {
          title: "مختبر المحاكاة",
          note: "أنشئ أجهزة وحساسات اصطناعية تخص مؤسستك وتغذي المحاكي فقط. هذه السجلات لا تعني وجود اتصال ميداني.",
          newDevice: "جهاز محاكاة جديد",
          deviceName: "اسم الجهاز",
          deviceType: "النوع",
          newSensor: "حساس محاكى جديد",
          sensorName: "اسم الحساس",
          measurement: "القياس",
          create: "إنشاء",
          noDevice: "أنشئ جهاز محاكاة أولًا.",
          inventory: "مخزون المحاكاة",
          devices: "أجهزة",
          sensors: "حساسات",
        };

  const load = useCallback(async () => {
    try {
      const [nextStatus, nextDevices, nextSensors] = await Promise.all([
        api.get<PlannedStatus>("/iot/status"),
        api.get<Device[]>("/telemetry/devices"),
        api.get<Sensor[]>("/telemetry/sensors"),
      ]);
      setStatus(nextStatus);
      setDevices(nextDevices);
      setSensors(nextSensors);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function createSimulationDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      await api.post<Device>("/telemetry/devices", {
        name: String(form.get("name") || ""),
        device_type: String(form.get("device_type") || "generic_sensor_node"),
        configuration: {},
      });
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function createSimulationSensor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const preset = SIM_SENSOR_PRESETS.find((item) => item.key === form.get("preset"));
    if (!preset) {
      setBusy(false);
      return;
    }
    try {
      await api.post<Sensor>("/telemetry/sensors", {
        device_id: Number(form.get("device_id")),
        name: String(form.get("name") || ""),
        sensor_type: preset.sensor_type,
        metric: preset.metric,
        unit: preset.unit,
        min_value: preset.min,
        max_value: preset.max,
        configuration: { base_value: preset.base },
      });
      event.currentTarget.reset();
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const simulationDevices = devices.filter((device) => device.is_simulated);

  return (
    <div className="space-y-6">
      <h1 className="t-section text-ink">{t("iot.title")}</h1>

      <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm font-medium text-destructive">
        {t("iot.fieldWarning")}
      </p>

      <ErrorText error={error} />

      {status?.capabilities ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Network size={18} />
              {copy.capabilities}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Object.entries(status.capabilities).map(([key, value]) => {
                const available = value === "available";
                const label = copy.labels[key as keyof typeof copy.labels] ?? key;
                const statusLabel = available
                  ? copy.available
                  : value === "not_implemented"
                    ? copy.notImplemented
                    : copy.notConfigured;
                return (
                  <div key={key} className="rounded-xl border bg-background p-4">
                    <div className="flex items-start justify-between gap-3">
                      <strong className="text-sm">{label}</strong>
                      {available
                        ? <CheckCircle2 className="text-emerald-700" size={18} />
                        : <ShieldAlert className="text-amber-700" size={18} />}
                    </div>
                    <Badge className="mt-3" variant={available ? "default" : "outline"}>{statusLabel}</Badge>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">{copy.note}</p>
          </CardContent>
        </Card>
      ) : null}

      {status === null && !error ? (
        <Skeleton className="h-40 w-full" />
      ) : status ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {t("iot.plannedEntities")}
                <Badge variant="outline">{t("iot.plannedCard")}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-wrap gap-2">
                {status.model.map((m) => (
                  <li key={m} className="rounded-md border bg-parchment/70 px-3 py-1.5 text-sm" dir="ltr">{m}</li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">{t("iot.warningsTitle")}</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 ps-5 text-sm text-muted-foreground">
                {status.warnings.map((w) => (
                  <li key={w}>{t(`iot.warnings.${w}`, w)}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
