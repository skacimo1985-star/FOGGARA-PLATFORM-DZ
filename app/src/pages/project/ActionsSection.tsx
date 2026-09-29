import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { Action } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ErrorText } from "@/components/common";

export function ActionsSection({ projectId, actions, reload }: {
  projectId: number; actions: Action[]; reload: () => void;
}) {
  const { t } = useTranslation();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      await api.post("/actions", {
        project_id: projectId,
        title: String(fd.get("title") || ""),
        assignee: String(fd.get("assignee") || "") || null,
      });
      (e.target as HTMLFormElement).reset();
      reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(id: number, status: string, result_note?: string) {
    setError(null);
    try {
      await api.patch(`/actions/${id}`, { status, ...(result_note ? { result_note } : {}) });
      reload();
    } catch (err) {
      setError(err);
    }
  }

  async function complete(id: number) {
    const note = window.prompt(t("action.result") + ":");
    if (note === null) return;
    await updateStatus(id, "done", note);
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="a-title">{t("action.actionTitle")}</Label>
          <Input id="a-title" name="title" required maxLength={255} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="a-assignee">{t("action.assignee")}</Label>
          <Input id="a-assignee" name="assignee" maxLength={255} />
        </div>
        <div className="sm:col-span-2"><ErrorText error={error} /></div>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={busy}>{busy ? t("common.loading") : t("action.submit")}</Button>
        </div>
      </form>

      {actions.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("action.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {actions.map((a) => (
            <li key={a.id} className="space-y-2 rounded-md border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{a.title}</span>
                <Badge variant={a.status === "done" ? "default" : "outline"}>{t(`action.statuses.${a.status}`)}</Badge>
              </div>
              {a.assignee && <p className="text-muted-foreground">{t("action.assignee")}: {a.assignee}</p>}
              {a.result_note && <p className="rounded bg-parchment/70 p-2">{a.result_note}</p>}
              {a.status !== "done" && (
                <div className="flex gap-2">
                  {a.status === "open" && (
                    <Button size="sm" variant="outline" onClick={() => updateStatus(a.id, "in_progress")}>
                      {t("action.statuses.in_progress")}
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" onClick={() => complete(a.id)}>
                    {t("action.statuses.done")}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
