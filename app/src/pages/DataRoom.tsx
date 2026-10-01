import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Download, FileCheck2, LockKeyhole } from "lucide-react";
import { api } from "@/lib/api";
import type { Evidence } from "@/types";
import type { AccessRequest, RoomAudit, RoomDetail } from "@/types/platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorText, DemoBadge } from "@/components/common";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";

export default function DataRoom() {
  const { id } = useParams(); const { t, i18n } = useTranslation();
  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [available, setAvailable] = useState<Evidence[]>([]);
  const [trail, setTrail] = useState<RoomAudit[]>([]);
  const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    const r = await api.get<RoomDetail>(`/data-rooms/${id}`); setRoom(r);
    if (r.can_manage && r.project_id) {
      const [a, e, h] = await Promise.all([api.get<AccessRequest[]>(`/data-rooms/${id}/access`), api.get<Evidence[]>(`/projects/${r.project_id}/evidences`), api.get<RoomAudit[]>(`/data-rooms/${id}/audit`)]);
      setRequests(a); setAvailable(e.filter(item => item.status === "verified")); setTrail(h);
    }
  }, [id]);
  useEffect(() => { setRoom(null); reload().catch(setError); }, [reload]);
  async function perform(work: () => Promise<unknown>) {
    setError(null); setBusy(true); try { await work(); await reload(); } catch (err) { setError(err); } finally { setBusy(false); }
  }
  if (!room) return <div className="space-y-4"><ErrorText error={error} /><Link to="/app/vde">{t("rooms.back")}</Link></div>;
  const selectClass = "w-full rounded-md border bg-background px-3 py-2 text-sm";
  return <div className="space-y-6">
    <Link className="text-sm text-oasis-strong" to="/app/vde">{t("rooms.back")}</Link>
    <div className="rounded-3xl border bg-paper p-6 sm:p-8"><p className="mb-3 flex items-center gap-2 text-xs font-bold tracking-widest text-oasis-strong"><LockKeyhole size={16} />{t("rooms.controlled")}</p><h1 className="t-section text-ink">{room.title}</h1><p className="mt-3 text-sm text-muted-foreground">{room.purpose}</p><p className="mt-4 text-xs text-oasis-strong">{t("rooms.noLegalClaim")}</p></div>
    <ErrorText error={error} />
    {room.can_manage && <Card><CardHeader><CardTitle>{t("rooms.accessRequests")}</CardTitle></CardHeader><CardContent className="space-y-4">
      {requests.length === 0 && <p className="text-sm text-muted-foreground">{t("rooms.noRequests")}</p>}
      {requests.map(req => <form key={req.id} className="rounded-xl border p-4 space-y-3" onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); void perform(() => api.patch(`/data-rooms/${id}/access/${req.id}`, { status: fd.get("status"), reason: fd.get("reason") })); }}>
        <p className="font-medium">{req.user_name} · {req.organization}</p><p className="text-sm">{req.reason}</p><p className="text-xs text-muted-foreground">{t(`rooms.status.${req.status}`)} {req.decision_reason && `· ${req.decision_reason}`}</p>
        {(req.status === "pending" || req.status === "approved") && <div className="grid gap-3 sm:grid-cols-3"><select aria-label={t("rooms.accessDecision")} name="status" className={selectClass}>{(req.status === "pending" ? ["approved", "rejected"] : ["revoked"]).map(s => <option key={s} value={s}>{t(`rooms.status.${s}`)}</option>)}</select><Input aria-label={t("rooms.reason")} name="reason" placeholder={t("rooms.reason")} required minLength={5} maxLength={3000} /><Button disabled={busy}>{t("rooms.recordDecision")}</Button></div>}
      </form>)}
    </CardContent></Card>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><FileCheck2 size={20} />{t("rooms.disclosedEvidence")}</CardTitle></CardHeader><CardContent className="space-y-4">
      {room.can_manage && <form className="flex flex-wrap gap-3" onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); void perform(() => api.post(`/data-rooms/${id}/disclosures`, { evidence_id: Number(fd.get("evidence_id")) })); }}><select aria-label={t("rooms.disclosedEvidence")} name="evidence_id" required className={`${selectClass} sm:max-w-md`}><option value="">{t("rooms.chooseEvidence")}</option>{available.filter(e => !room.evidence.some(d => d.id === e.id)).map(e => <option value={e.id} key={e.id}>{e.title}</option>)}</select><Button disabled={busy}>{t("rooms.disclose")}</Button></form>}
      {room.evidence.length === 0 && <p className="text-sm text-muted-foreground">{t("rooms.noEvidence")}</p>}
      {room.evidence.map(e => <article key={e.id} className="rounded-xl border p-4 space-y-3"><h3 className="font-semibold">{e.title} <ProvenanceBadge value="VERIFIED" /><DemoBadge show={e.is_demo} /></h3><p className="text-xs text-muted-foreground">{t(`evidence.types.${e.doc_type}`)} · {e.license}</p>{e.content_note && <p className="whitespace-pre-wrap text-sm">{e.content_note}</p>}
        {e.files.map(f => <div key={f.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 p-3 text-sm"><span dir="auto">{f.filename}</span><span>{Math.ceil(f.size / 1024)} KB</span><Button variant="outline" size="sm" disabled={busy} onClick={() => api.download(`/data-rooms/${id}/files/${f.id}`, f.filename).catch(setError)}><Download size={14} />{t("rooms.download")}</Button><details className="w-full text-xs"><summary>{t("rooms.integrity")}</summary><code dir="ltr" className="break-all">SHA-256: {f.sha256}</code></details></div>)}
        {room.can_manage && <Button variant="outline" size="sm" disabled={busy} onClick={() => void perform(() => api.delete(`/data-rooms/${id}/disclosures/${e.id}`))}>{t("rooms.withdraw")}</Button>}
      </article>)}
    </CardContent></Card>
    <Card><CardHeader><CardTitle>{t("rooms.qa")}</CardTitle></CardHeader><CardContent className="space-y-4">
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); const form = event.currentTarget; const text = String(new FormData(form).get("question")); void perform(async () => { await api.post(`/data-rooms/${id}/questions`, { question: text }); form.reset(); }); }}><Textarea aria-label={t("rooms.question")} name="question" placeholder={t("rooms.question")} required minLength={5} maxLength={3000} /><Button disabled={busy}>{t("rooms.ask")}</Button></form>
      {room.questions.map(q => <article key={q.id} className="rounded-xl border p-4 space-y-3"><p className="whitespace-pre-wrap text-sm font-medium">{q.question}</p>{q.answer ? <p className="whitespace-pre-wrap rounded-lg bg-oasis/10 p-3 text-sm">{q.answer}</p> : room.can_manage ? <form className="space-y-2" onSubmit={e => { e.preventDefault(); const fd = new FormData(e.currentTarget); void perform(() => api.patch(`/data-rooms/${id}/questions/${q.id}`, { answer: fd.get("answer") })); }}><Textarea aria-label={t("rooms.answer")} name="answer" required minLength={2} maxLength={3000} /><Button size="sm" disabled={busy}>{t("rooms.answer")}</Button></form> : <p className="text-xs text-muted-foreground">{t("rooms.awaitingAnswer")}</p>}</article>)}
    </CardContent></Card>
    {room.can_manage && <Card><CardHeader><CardTitle>{t("rooms.audit")}</CardTitle></CardHeader><CardContent className="space-y-2">{trail.map(event => <p key={event.id} className="flex flex-wrap justify-between gap-2 border-b py-2 text-xs"><span>{t(`rooms.actions.${event.action}`, event.action)} · #{event.user_id}</span><time>{new Date(event.created_at).toLocaleString(i18n.language)}</time></p>)}</CardContent></Card>}
  </div>;
}
