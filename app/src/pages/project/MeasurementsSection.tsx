import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { Instrument, Measurement } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorText, DemoBadge } from "@/components/common";

// وحدات كل كمية كما يفرضها الـbackend (services/indicators.py) — ممنوع إدخال وحدة خارج القائمة
const PARAM_UNITS: Record<string, string[]> = {
  flow_rate: ["L/s", "m3/h"],
  water_level: ["m"],
  ph: ["pH"],
  temperature: ["°C"],
  turbidity: ["NTU"],
  pressure: ["bar", "kPa"],
  dissolved_oxygen: ["mg/L"],
  rainfall: ["mm"],
  electrical_power: ["kW"],
  voltage: ["V"],
  humidity: ["%RH"],
  soil_moisture: ["%"],
};

const SOURCE_TYPES = ["manual", "instrument", "imported"] as const;

const qVariant = (s: string) => (s === "validated" ? "default" : s === "rejected" ? "destructive" : "outline") as "default" | "destructive" | "outline";
const vVariant = (s: string) => (s === "verified" ? "default" : s === "rejected" ? "destructive" : "outline") as "default" | "destructive" | "outline";

export function MeasurementsSection({ projectId, measurements, reload }: {
  projectId: number; measurements: Measurement[]; reload: () => void;
}) {
  const { t } = useTranslation();
  const [parameter, setParameter] = useState("flow_rate");
  const [sourceType, setSourceType] = useState<string>("manual");
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get<Instrument[]>("/instruments").then(setInstruments).catch(() => setInstruments([]));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const instId = fd.get("instrument_id");
    try {
      await api.post("/measurements", {
        project_id: projectId,
        parameter,
        value: Number(fd.get("value")),
        unit: String(fd.get("unit")),
        measured_at: new Date(String(fd.get("measured_at"))).toISOString(),
        source: String(fd.get("source") || ""),
        method: String(fd.get("method") || ""),
        source_type: sourceType,
        instrument_id: instId ? Number(instId) : null,
      });
      (e.target as HTMLFormElement).reset();
      reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="m-param">{t("measurement.parameter")}</Label>
          <select id="m-param" className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={parameter} onChange={(e) => setParameter(e.target.value)}>
            {Object.keys(PARAM_UNITS).map((p) => <option key={p} value={p}>{t(`measurement.params.${p}`)}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="m-value">{t("measurement.value")}</Label>
          <Input id="m-value" name="value" type="number" step="any" required dir="ltr" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="m-unit">{t("measurement.unit")}</Label>
          <select id="m-unit" name="unit" className="w-full rounded-md border bg-background px-3 py-2 text-sm">
            {PARAM_UNITS[parameter].map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="m-at">{t("measurement.measuredAt")}</Label>
          <Input id="m-at" name="measured_at" type="datetime-local" required dir="ltr" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="m-source">{t("measurement.source")}</Label>
          <Input id="m-source" name="source" required maxLength={255} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="m-method">{t("measurement.method")}</Label>
          <Input id="m-method" name="method" required maxLength={255} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="m-stype">{t("measurement.sourceType")}</Label>
          <select id="m-stype" className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
            {SOURCE_TYPES.map((s) => <option key={s} value={s}>{t(`measurement.sourceTypes.${s}`)}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="m-inst">{t("measurement.instrument")}</Label>
          <select id="m-inst" name="instrument_id" className="w-full rounded-md border bg-background px-3 py-2 text-sm">
            <option value="">{t("common.none")}</option>
            {instruments.map((i) => (
              <option key={i.id} value={i.id}>#{i.id} — {i.type} ({i.serial_number})</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-3"><ErrorText error={error} /></div>
        <div className="sm:col-span-3">
          <Button type="submit" disabled={busy}>{busy ? t("common.loading") : t("measurement.submit")}</Button>
        </div>
      </form>

      {measurements.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("measurement.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("measurement.parameter")}</TableHead>
                <TableHead>{t("measurement.value")}</TableHead>
                <TableHead>{t("measurement.measuredAt")}</TableHead>
                <TableHead>{t("measurement.source")}</TableHead>
                <TableHead>{t("measurement.sourceType")}</TableHead>
                <TableHead>{t("measurement.quality")}</TableHead>
                <TableHead>{t("measurement.verification")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {measurements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>{t(`measurement.params.${m.parameter}`)}<DemoBadge show={m.is_demo} /></TableCell>
                  <TableCell className="tabular-nums" dir="ltr">{m.value} {m.unit}</TableCell>
                  <TableCell className="tabular-nums" dir="ltr">{new Date(m.measured_at).toLocaleString()}</TableCell>
                  <TableCell>{m.source}</TableCell>
                  <TableCell><Badge variant="secondary">{t(`measurement.sourceTypes.${m.source_type}`, m.source_type)}</Badge></TableCell>
                  <TableCell><Badge variant={qVariant(m.quality_status)}>{t(`measurement.qualityStatuses.${m.quality_status}`)}</Badge></TableCell>
                  <TableCell><Badge variant={vVariant(m.verification_status)}>{t(`measurement.verificationStatuses.${m.verification_status}`, m.verification_status)}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
