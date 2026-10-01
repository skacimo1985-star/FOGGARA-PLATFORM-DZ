import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Paperclip } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import type { EvidenceFile } from "@/types/platform";
import { Button } from "@/components/ui/button";
import { ErrorText } from "@/components/common";

export function EvidenceFiles({ evidenceId, canUpload }: { evidenceId: number; canUpload: boolean }) {
  const { t } = useTranslation(); const [files, setFiles] = useState<EvidenceFile[]>([]);
  const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const reload = useCallback(() => api.get<EvidenceFile[]>(`/evidences/${evidenceId}/files`).then(setFiles), [evidenceId]);
  useEffect(() => { reload().catch(setError); }, [reload]);
  return <div className="mt-3 max-w-md space-y-2">
    <ErrorText error={error} />
    {files.map(file => <div key={file.id} className="rounded-md border p-2 text-xs"><Button variant="ghost" size="sm" className="max-w-full" onClick={() => api.download(`/evidence-files/${file.id}/download`, file.filename).catch(setError)}><Download size={12} /><span className="truncate" dir="auto">{file.filename}</span></Button><details><summary>{t("rooms.integrity")}</summary><code className="break-all" dir="ltr">{file.sha256}</code></details></div>)}
    {canUpload && <label className="block space-y-1 rounded-lg border border-dashed p-2 text-xs"><span className="flex items-center gap-1"><Paperclip size={12} />{t("files.attach")}</span>
      <input className="w-full text-xs" type="file" accept="application/pdf,image/png,image/jpeg" disabled={busy} onChange={async event => {
        const input = event.currentTarget; const file = input.files?.[0]; if (!file) return;
        setError(null); if (file.size > 5242880) { setError(new ApiError(413, "FILE_TOO_LARGE", "File too large")); input.value = ""; return; }
        setBusy(true); try { await api.upload(`/evidences/${evidenceId}/files?filename=${encodeURIComponent(file.name)}`, file); await reload(); } catch (err) { setError(err); } finally { setBusy(false); input.value = ""; }
      }} /><p className="text-muted-foreground">{t("files.notice")}</p>
    </label>}
  </div>;
}
