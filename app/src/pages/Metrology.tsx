import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { Asset, Calibration, Certificate, Inspection, Instrument, MetrologyStatus, Site } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorText, DemoBadge } from "@/components/common";

const INSTRUMENT_STATUSES = ["active", "maintenance", "out_of_service"] as const;

function YesNo({ value }: { value: boolean | undefined }) {
  const { t } = useTranslation();
  if (value === undefined) return <span className="text-muted-foreground">…</span>;
  return (
    <Badge variant={value ? "default" : "destructive"}>
      {t(value ? "common.yes" : "common.no")}
    </Badge>
  );
}

export default function Metrology() {
  const { t } = useTranslation();
  const [instruments, setInstruments] = useState<Instrument[] | null>(null);
  const [statuses, setStatuses] = useState<Record<number, MetrologyStatus>>({});
  const [certificates, setCertificates] = useState<Certificate[] | null>(null);
  const [inspections, setInspections] = useState<Inspection[] | null>(null);
  const [calibrations, setCalibrations] = useState<Calibration[] | null>(null);
  const [selectedInstrument, setSelectedInstrument] = useState<number | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    setError(null);
    api.get<Instrument[]>("/instruments")
      .then(async (list) => {
        setInstruments(list);
        const entries = await Promise.all(
          list.map((i) =>
            api.get<MetrologyStatus>(`/instruments/${i.id}/metrology-status`)
              .then((s) => [i.id, s] as const)
              .catch(() => null),
          ),
        );
        const map: Record<number, MetrologyStatus> = {};
        for (const e of entries) if (e) map[e[0]] = e[1];
        setStatuses(map);
      })
      .catch(setError);
    api.get<Certificate[]>("/certificates").then(setCertificates).catch(() => setCertificates([]));
    api.get<Inspection[]>("/inspections").then(setInspections).catch(() => setInspections([]));
    api.get<Site[]>("/sites").then(setSites).catch(() => {});
    api.get<Asset[]>("/assets").then(setAssets).catch(() => {});
  }, []);

  useEffect(reload, [reload]);

  function loadCalibrations(instrumentId: number) {
    setSelectedInstrument(instrumentId);
    setCalibrations(null);
    api.get<Calibration[]>(`/instruments/${instrumentId}/calibrations`)
      .then(setCalibrations)
      .catch(setError);
  }

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const num = (k: string) => (fd.get(k) ? Number(fd.get(k)) : null);
    try {
      await api.post("/instruments", {
        type: String(fd.get("type") || ""),
        serial_number: String(fd.get("serial_number") || ""),
        site_id: num("site_id"),
        asset_id: num("asset_id"),
        status: String(fd.get("status") || "active"),
      });
      setShowForm(false);
      reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const resultVariant = (r: string) =>
    (r === "pass" ? "default" : r === "fail" ? "destructive" : "outline") as "default" | "destructive" | "outline";
  const certVariant = (s: string) =>
    (s === "active" ? "default" : s === "draft" ? "outline" : "destructive") as "default" | "destructive" | "outline";
  const fmtDate = (d: string) => new Date(d).toLocaleDateString();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="t-section text-ink">{t("metrology.title")}</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{t("metrology.addInstrument")}</Button>
      </div>
      <ErrorText error={error} />

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("metrology.addInstrument")}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="i-type">{t("metrology.type")}</Label>
                <Input id="i-type" name="type" required maxLength={50} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="i-serial">{t("metrology.serial")}</Label>
                <Input id="i-serial" name="serial_number" required maxLength={100} dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="i-site">{t("metrology.site")}</Label>
                <select id="i-site" name="site_id" className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                  <option value="">{t("common.none")}</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="i-asset">{t("metrology.asset")}</Label>
                <select id="i-asset" name="asset_id" className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                  <option value="">{t("common.none")}</option>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="i-status">{t("metrology.status")}</Label>
                <select id="i-status" name="status" className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                  {INSTRUMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>{t(`metrology.instrumentStatuses.${s}`)}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <Button type="submit" disabled={busy}>{busy ? t("common.loading") : t("metrology.create")}</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>{t("project.cancel")}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">{t("metrology.instruments")}</CardTitle></CardHeader>
        <CardContent>
          {instruments === null ? (
            <Skeleton className="h-32 w-full" />
          ) : instruments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("metrology.emptyInstruments")}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>{t("metrology.type")}</TableHead>
                    <TableHead>{t("metrology.serial")}</TableHead>
                    <TableHead>{t("metrology.status")}</TableHead>
                    <TableHead>{t("metrology.calibrationValid")}</TableHead>
                    <TableHead>{t("metrology.certificateActive")}</TableHead>
                    <TableHead>{t("metrology.calibrations")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {instruments.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{i.id}<DemoBadge show={i.is_demo} /></TableCell>
                      <TableCell>{i.type}</TableCell>
                      <TableCell dir="ltr">{i.serial_number}</TableCell>
                      <TableCell>
                        <Badge variant={i.status === "active" ? "default" : "outline"}>
                          {t(`metrology.instrumentStatuses.${i.status}`, i.status)}
                        </Badge>
                      </TableCell>
                      <TableCell><YesNo value={statuses[i.id]?.has_valid_calibration} /></TableCell>
                      <TableCell><YesNo value={statuses[i.id]?.has_active_certificate} /></TableCell>
                      <TableCell>
                        <Button size="sm" variant="secondary" onClick={() => loadCalibrations(i.id)}>
                          {t("common.details")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedInstrument !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("metrology.calibrations")} — {t("metrology.instrument")} #{selectedInstrument}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {calibrations === null ? (
              <Skeleton className="h-24 w-full" />
            ) : calibrations.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("metrology.emptyCalibrations")}</p>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("metrology.authority")}</TableHead>
                      <TableHead>{t("metrology.calibratedOn")}</TableHead>
                      <TableHead>{t("metrology.nextDue")}</TableHead>
                      <TableHead>{t("metrology.result")}</TableHead>
                      <TableHead>{t("metrology.certificates")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {calibrations.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.authority}</TableCell>
                        <TableCell className="tabular-nums" dir="ltr">{fmtDate(c.calibrated_on)}</TableCell>
                        <TableCell className="tabular-nums" dir="ltr">{fmtDate(c.next_due)}</TableCell>
                        <TableCell><Badge variant={resultVariant(c.result)}>{t(`metrology.results.${c.result}`)}</Badge></TableCell>
                        <TableCell>{c.certificate_id ? `#${c.certificate_id}` : t("common.none")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">{t("metrology.certificates")}</CardTitle></CardHeader>
        <CardContent>
          {certificates === null ? (
            <Skeleton className="h-24 w-full" />
          ) : certificates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("metrology.emptyCertificates")}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("metrology.number")}</TableHead>
                    <TableHead>{t("metrology.issuer")}</TableHead>
                    <TableHead>{t("metrology.status")}</TableHead>
                    <TableHead>{t("metrology.validFrom")}</TableHead>
                    <TableHead>{t("metrology.validTo")}</TableHead>
                    <TableHead>{t("metrology.instrument")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {certificates.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell dir="ltr">{c.number}<DemoBadge show={c.is_demo} /></TableCell>
                      <TableCell>{c.issuer}</TableCell>
                      <TableCell><Badge variant={certVariant(c.status)}>{t(`metrology.certStatuses.${c.status}`, c.status)}</Badge></TableCell>
                      <TableCell className="tabular-nums" dir="ltr">{fmtDate(c.valid_from)}</TableCell>
                      <TableCell className="tabular-nums" dir="ltr">{fmtDate(c.valid_to)}</TableCell>
                      <TableCell>{c.instrument_id ? `#${c.instrument_id}` : t("common.none")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("metrology.inspections")}</CardTitle></CardHeader>
        <CardContent>
          {inspections === null ? (
            <Skeleton className="h-24 w-full" />
          ) : inspections.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("metrology.emptyInspections")}</p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("metrology.inspectedOn")}</TableHead>
                    <TableHead>{t("metrology.inspector")}</TableHead>
                    <TableHead>{t("metrology.instrument")}</TableHead>
                    <TableHead>{t("metrology.asset")}</TableHead>
                    <TableHead>{t("metrology.result")}</TableHead>
                    <TableHead>{t("metrology.notes")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspections.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="tabular-nums" dir="ltr">{fmtDate(i.inspected_on)}<DemoBadge show={i.is_demo} /></TableCell>
                      <TableCell>{i.inspector}</TableCell>
                      <TableCell>{i.instrument_id ? `#${i.instrument_id}` : t("common.none")}</TableCell>
                      <TableCell>{i.asset_id ? `#${i.asset_id}` : t("common.none")}</TableCell>
                      <TableCell><Badge variant={resultVariant(i.result)}>{t(`metrology.results.${i.result}`, i.result)}</Badge></TableCell>
                      <TableCell className="max-w-xs">{i.notes ?? t("common.none")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
