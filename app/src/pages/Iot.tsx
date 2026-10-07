import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Network, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import type { PlannedStatus } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorText } from "@/components/common";

export default function Iot() {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<PlannedStatus | null>(null);
  const [error, setError] = useState<unknown>(null);
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

  useEffect(() => {
    api.get<PlannedStatus>("/iot/status").then(setStatus).catch(setError);
  }, []);

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
