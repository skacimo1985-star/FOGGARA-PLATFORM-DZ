import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { Evidence, Measurement } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorText, DemoBadge } from "@/components/common";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import { EvidenceFiles } from "@/components/EvidenceFiles";
import { useAuth } from "@/context/useAuth";

const DOC_TYPES = ["report", "photo", "lab_result", "permit", "field_note"];

const sVariant = (s: string) =>
  (s === "verified" ? "default" : s === "rejected" ? "destructive" : "outline") as "default" | "destructive" | "outline";

export function EvidenceSection({ projectId, evidences, measurements, reload }: {
  projectId: number; evidences: Evidence[]; measurements: Measurement[]; reload: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const mid = fd.get("measurement_id");
    try {
      await api.post("/evidences", {
        project_id: projectId,
        measurement_id: mid ? Number(mid) : null,
        title: String(fd.get("title") || ""),
        doc_type: String(fd.get("doc_type")),
        license: String(fd.get("license") || ""),
        uri: String(fd.get("uri") || "") || null,
        content_note: String(fd.get("content_note") || "") || null,
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
      <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="e-title">{t("evidence.docTitle")}</Label>
          <Input id="e-title" name="title" required maxLength={255} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="e-type">{t("evidence.docType")}</Label>
          <select id="e-type" name="doc_type" className="w-full rounded-md border bg-background px-3 py-2 text-sm">
            {DOC_TYPES.map((d) => <option key={d} value={d}>{t(`evidence.types.${d}`)}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="e-license">{t("evidence.license")}</Label>
          <Input id="e-license" name="license" required maxLength={255} placeholder="CC0 / CC-BY / داخلي مرخّص…" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="e-mid">{t("evidence.linkedMeasurement")}</Label>
          <select id="e-mid" name="measurement_id" className="w-full rounded-md border bg-background px-3 py-2 text-sm">
            <option value="">{t("common.none")}</option>
            {measurements.map((m) => (
              <option key={m.id} value={m.id}>#{m.id} — {t(`measurement.params.${m.parameter}`)} ({m.value} {m.unit})</option>
            ))}
          </select>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="e-uri">{t("evidence.uri")}</Label>
          <Input id="e-uri" name="uri" type="url" dir="ltr" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="e-note">{t("evidence.note")}</Label>
          <Textarea id="e-note" name="content_note" rows={2} />
        </div>
        <div className="sm:col-span-2"><ErrorText error={error} /></div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>{busy ? t("common.loading") : t("evidence.submit")}</Button>
        </div>
      </form>

      {evidences.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("evidence.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("evidence.docTitle")}</TableHead>
                <TableHead>{t("evidence.docType")}</TableHead>
                <TableHead>{t("evidence.license")}</TableHead>
                <TableHead>{t("project.status")}</TableHead>
                <TableHead>{t("evidence.resolution")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evidences.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    {e.title}
                    <ProvenanceBadge value={e.status === "verified" ? "VERIFIED" : "PROPOSED"} />
                    <DemoBadge show={e.is_demo} />
                    <EvidenceFiles evidenceId={e.id} canUpload={e.status === "submitted" && e.submitted_by === user?.id} />
                    {e.clarification_note && (
                      <p className="mt-1 rounded border border-sand/60 bg-sand/15 px-2 py-1 text-xs text-ink">
                        {t("evidence.clarificationNote")}: {e.clarification_note}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>{t(`evidence.types.${e.doc_type}`)}</TableCell>
                  <TableCell>{e.license}</TableCell>
                  <TableCell><Badge variant={sVariant(e.status)}>{t(`evidence.statuses.${e.status}`)}</Badge></TableCell>
                  <TableCell>
                    {e.resolution
                      ? <Badge variant="secondary">{t(`evidence.resolutions.${e.resolution}`, e.resolution)}</Badge>
                      : t("common.none")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
