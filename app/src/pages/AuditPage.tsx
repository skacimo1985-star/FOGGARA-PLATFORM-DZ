import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { AuditEntry } from "@/types";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorText } from "@/components/common";

export default function AuditPage() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api.get<AuditEntry[]>("/audit").then(setEntries).catch(setError);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="t-section text-ink">{t("audit.title")}</h1>
      <ErrorText error={error} />
      {entries === null && !error ? (
        <Skeleton className="h-64 w-full" />
      ) : entries && entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("audit.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("audit.when")}</TableHead>
                <TableHead>{t("audit.who")}</TableHead>
                <TableHead>{t("audit.what")}</TableHead>
                <TableHead>{t("audit.entity")}</TableHead>
                <TableHead>{t("project.title")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(entries || []).map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="tabular-nums" dir="ltr">{new Date(e.created_at).toLocaleString()}</TableCell>
                  <TableCell>#{e.user_id}</TableCell>
                  <TableCell><Badge variant="secondary">{e.action}</Badge></TableCell>
                  <TableCell>{e.entity_type} #{e.entity_id}</TableCell>
                  <TableCell>{e.project_id ? `#${e.project_id}` : t("common.none")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
