import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, FolderLock, Plus, ShieldCheck } from "lucide-react";
import { api,type Paged } from "@/lib/api";
import { useAuth } from "@/context/useAuth";
import type { Project } from "@/types";
import type { RoomSummary } from "@/types/platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorText } from "@/components/common";

export default function Vde() {
  const { t } = useTranslation(); const { user } = useAuth();
  const [rooms, setRooms] = useState<RoomSummary[]>([]); const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const manage = user?.role === "reviewer" || user?.role === "admin";
  const reload = useCallback(async () => { const [r, p] = await Promise.all([api.get<RoomSummary[]>("/data-rooms"), api.get<Paged<Project>>("/projects?page_size=500").then(r=>r.items)]); setRooms(r); setProjects(p); }, []);
  useEffect(() => { reload().catch(setError).finally(() => setLoading(false)); }, [reload]);
  async function create(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form); setBusy(true); setError(null);
    try { await api.post("/data-rooms", { project_id: Number(fd.get("project_id")), title: fd.get("title"), purpose: fd.get("purpose"), discoverable: fd.get("discoverable") === "on" }); form.reset(); await reload(); } catch (err) { setError(err); } finally { setBusy(false); }
  }
  return <div className="space-y-6">
    <div className="rounded-3xl border bg-paper p-6 sm:p-8"><p className="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest text-oasis-strong"><FolderLock size={18} />{t("rooms.controlled")}</p><h1 className="t-section text-ink">{t("rooms.title")}</h1><p className="mt-3 max-w-2xl text-sm text-muted-foreground">{t("rooms.subtitle")}</p></div>
    <ErrorText error={error} />
    {manage && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus size={18} />{t("rooms.create")}</CardTitle></CardHeader><CardContent>
      <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="room-title">{t("rooms.roomTitle")}</Label><Input id="room-title" name="title" required minLength={3} maxLength={255} /></div>
        <div className="space-y-1"><Label htmlFor="room-project">{t("nav.projects")}</Label><select id="room-project" name="project_id" required className="w-full rounded-md border bg-background px-3 py-2 text-sm"><option value="">{t("rooms.chooseProject")}</option>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="room-purpose">{t("rooms.purpose")}</Label><Textarea id="room-purpose" name="purpose" required minLength={5} maxLength={3000} /></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="discoverable" />{t("rooms.discoverable")}</label>
        <p className="text-xs text-muted-foreground sm:col-span-2">{t("rooms.publicNotice")}</p>
        <Button disabled={busy || projects.length === 0}>{t("rooms.create")}</Button>
      </form>
    </CardContent></Card>}
    {loading ? <p>{t("common.loading")}</p> : rooms.length === 0 ? <div className="rounded-2xl border border-dashed p-8 text-center text-muted-foreground">{t("rooms.empty")}</div> : <div className="grid gap-4 md:grid-cols-2">
      {rooms.map(room => <Card key={room.id}><CardHeader><CardTitle className="flex justify-between gap-3 text-lg">{room.title}<Badge variant="outline">{t(`rooms.status.${room.status}`)}</Badge></CardTitle></CardHeader><CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{room.purpose}</p><p className="flex items-center gap-2 text-xs text-oasis-strong"><ShieldCheck size={14} />{t(`rooms.status.${room.access}`)}</p>
        {(room.own || room.access === "approved") && room.status === "open" && <Button asChild><Link to={`/app/vde/${room.id}`}>{t("rooms.open")}<ArrowUpRight size={16} /></Link></Button>}
        {!room.own && room.access === "none" && <form className="space-y-2" onSubmit={async e => { e.preventDefault(); const fd = new FormData(e.currentTarget); setError(null); setBusy(true); try { await api.post(`/data-rooms/${room.id}/access`, { reason: fd.get("reason") }); await reload(); } catch (err) { setError(err); } finally { setBusy(false); } }}><Textarea aria-label={t("rooms.reason")} name="reason" placeholder={t("rooms.reason")} required minLength={5} maxLength={3000} /><Button variant="outline" disabled={busy}>{t("rooms.requestAccess")}</Button></form>}
        {room.can_manage && <Button disabled={busy} variant="outline" onClick={async () => { setBusy(true); setError(null); try { await api.patch(`/data-rooms/${room.id}`, { status: room.status === "open" ? "closed" : "open" }); await reload(); } catch (err) { setError(err); } finally { setBusy(false); } }}>{t(room.status === "open" ? "rooms.close" : "rooms.reopen")}</Button>}
      </CardContent></Card>)}
    </div>}
  </div>;
}
