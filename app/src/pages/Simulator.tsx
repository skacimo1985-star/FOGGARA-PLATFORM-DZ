import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/context/useAuth";
import type { Device, SimScenario, SimulationResult, SimulationRun, TelemetryRule } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorText, DemoBadge } from "@/components/common";

// المحاكي الحتمي (Phase 03 §28/§29) — SIMULATION ONLY، بلا صيغ اعتباطية
const SCENARIOS: SimScenario[] = ["NORMAL", "HIGH_DEMAND", "LOW_WATER",
  "PRESSURE_ANOMALY", "SENSOR_FAILURE", "ENERGY_ANOMALY"];

const runVariant = (s: string) =>
  (s === "COMPLETED" ? "default" : s === "FAILED" ? "destructive" : "outline") as
  "default" | "destructive" | "outline";

export default function Simulator() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [devices, setDevices] = useState<Device[]>([]);
  const [runs, setRuns] = useState<SimulationRun[] | null>(null);
  const [rules, setRules] = useState<TelemetryRule[]>([]);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const canRun = user?.role === "reviewer" || user?.role === "admin";

  const load = useCallback(async () => {
    const [d, r, rl] = await Promise.all([
      api.get<Device[]>("/telemetry/devices"),
      api.get<SimulationRun[]>("/simulator/runs"),
      api.get<TelemetryRule[]>("/telemetry-rules"),
    ]);
    setDevices(d); setRuns(r); setRules(rl);
  }, []);

  useEffect(() => { load().catch(setError); }, [load]);

  const submitRun = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const run = await api.post<SimulationRun>("/simulator/runs", {
        device_id: Number(f.get("device_id")),
        scenario: f.get("scenario"),
        seed: Number(f.get("seed")),
        steps: Number(f.get("steps")),
        step_seconds: Number(f.get("step_seconds")),
      });
      const res = await api.post<SimulationResult>(`/simulator/runs/${run.id}/run`, {});
      setResult(res);
      await load();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{t("simulator.title")}</h1>
        <Badge variant="destructive">{t("simulator.simulationOnly")}</Badge>
      </div>
      <ErrorText error={error} />
      <p className="text-sm text-muted-foreground">{t("simulator.safetyNote")}</p>

      {/* إنشاء + تنفيذ تشغيلة */}
      {canRun && (
        <Card>
          <CardHeader><CardTitle>{t("simulator.newRun")}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submitRun} className="flex flex-wrap gap-3 items-end">
              <div><Label>{t("simulator.device")}</Label>
                <select name="device_id" required
                  className="border rounded-md px-2 py-1.5 text-sm bg-background">
                  {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select></div>
              <div><Label>{t("simulator.scenario")}</Label>
                <select name="scenario" className="border rounded-md px-2 py-1.5 text-sm bg-background">
                  {SCENARIOS.map((s) => <option key={s} value={s}>{t(`simulator.scenarios.${s}`)}</option>)}
                </select></div>
              <div><Label>{t("simulator.seed")}</Label>
                <Input name="seed" type="number" defaultValue={42} min={0} max={2147483647} className="w-28" /></div>
              <div><Label>{t("simulator.steps")}</Label>
                <Input name="steps" type="number" defaultValue={24} min={1} max={1000} className="w-24" /></div>
              <div><Label>{t("simulator.stepSeconds")}</Label>
                <Input name="step_seconds" type="number" defaultValue={3600} min={1} max={86400} className="w-28" /></div>
              <Button type="submit" disabled={busy}>{t("simulator.run")}</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* نتيجة آخر تشغيلة: telemetry → rule → decision */}
      {result && (
        <Card>
          <CardHeader><CardTitle>{t("simulator.lastResult")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{t("simulator.generated")}: <b>{result.generated}</b> · {t("simulator.runStatus")}: <Badge variant={runVariant(result.run.status)}>{t(`simulator.runStatuses.${result.run.status}`)}</Badge></p>
            {result.proposals.length > 0 ? (
              <div className="space-y-2">
                <p className="font-semibold">{t("simulator.proposalsChain")}</p>
                {result.proposals.map((p) => (
                  <div key={p.id} className="border rounded p-2 flex items-center justify-between">
                    <span>
                      {p.title} — <Badge variant="outline">{t(`decisions.statuses.${p.status}`)}</Badge>
                      <span className="text-muted-foreground ms-2">{p.reason}</span>
                    </span>
                    <Link to="/app/decisions" className="underline text-primary">{t("simulator.openDecision")}</Link>
                  </div>
                ))}
              </div>
            ) : <p className="text-muted-foreground">{t("simulator.noProposals")}</p>}
          </CardContent>
        </Card>
      )}

      {/* التشغيلات السابقة */}
      <Card>
        <CardHeader><CardTitle>{t("simulator.runs")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {runs === null && <Skeleton className="h-24 w-full" />}
          {runs?.length === 0 && <p className="text-muted-foreground">{t("simulator.noRuns")}</p>}
          {runs?.map((r) => (
            <div key={r.id} className="border rounded-lg p-3 flex items-center justify-between">
              <div>
                <span className="font-medium">{t(`simulator.scenarios.${r.scenario}`)}</span>
                <span className="text-sm text-muted-foreground ms-2">
                  {devices.find((d) => d.id === r.device_id)?.name} · seed={r.seed} · {r.steps}×{r.step_seconds}s
                </span>
              </div>
              <div className="flex items-center gap-2">
                {r.is_demo && <DemoBadge show />}
                <Badge variant={runVariant(r.status)}>{t(`simulator.runStatuses.${r.status}`)}</Badge>
                <span className="text-sm text-muted-foreground">{r.generated_count}</span>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* القواعد النشطة */}
      <Card>
        <CardHeader><CardTitle>{t("simulator.rules")}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {rules.length === 0 && <p className="text-muted-foreground">{t("simulator.noRules")}</p>}
          {rules.map((r) => (
            <div key={r.id} className="border rounded p-2 text-sm flex items-center gap-2">
              <Badge variant={r.enabled ? "default" : "outline"}>
                {r.enabled ? t("simulator.enabled") : t("simulator.disabled")}
              </Badge>
              <span className="font-medium">{r.name}</span>
              <span className="text-muted-foreground">
                {t(`telemetry.metrics.${r.metric}`, r.metric)} {r.operator} {r.threshold}{r.unit}
                → {t(`decisions.domains.${r.domain}`)} / {r.decision_type}
              </span>
              {r.is_demo && <DemoBadge show />}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
