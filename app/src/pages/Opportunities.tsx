import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Handshake, ArrowUpRight } from "lucide-react";
import { api } from "@/lib/api";
import type { RoomSummary } from "@/types/platform";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ErrorText, DemoBadge } from "@/components/common";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";

interface Opportunity { id: number; title: string; description: string; domain: string; kind: string; category: string; wilaya: string | null; room_id: number | null; published: boolean; status: string; own: boolean; is_demo: boolean; organization: string; }
interface Match { opportunity: Opportunity; score: number; basis: string[]; }
const domains = ["water", "energy", "food", "ecosystem", "health"];
const categories = ["equipment", "engineering", "laboratory", "investment", "research", "production", "training"];
export default function Opportunities() {
  const { t } = useTranslation(); const [rows, setRows] = useState<Opportunity[]>([]); const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [matches, setMatches] = useState<Match[] | null>(null); const [selected, setSelected] = useState<string>("");
  const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => { const [r, dr] = await Promise.all([api.get<Opportunity[]>("/opportunities"), api.get<RoomSummary[]>("/data-rooms")]); setRows(r); setRooms(dr.filter(r => r.can_manage)); }, []);
  useEffect(() => { reload().catch(setError).finally(() => setLoading(false)); }, [reload]);
  const selectClass = "w-full rounded-md border bg-background px-3 py-2 text-sm";
  function opportunityCard(row: Opportunity) {
    return <Card key={row.id}><CardHeader><CardTitle className="text-lg">{row.title}<DemoBadge show={row.is_demo} /></CardTitle></CardHeader><CardContent className="space-y-3">
      <div className="flex flex-wrap gap-2"><Badge variant="outline">{t(`opportunities.kinds.${row.kind}`)}</Badge><Badge variant="secondary">{t(`domains.${row.domain}`)}</Badge><Badge variant="outline">{t(`opportunities.categories.${row.category}`)}</Badge><ProvenanceBadge value="PROPOSED" /></div>
      <p className="whitespace-pre-wrap text-sm">{row.description}</p><p className="text-xs text-muted-foreground">{row.organization} {row.wilaya && `· ${row.wilaya}`}</p>
      {row.room_id && <Button asChild variant="outline"><Link to="/app/vde">{t("opportunities.roomAccess")}<ArrowUpRight size={14} /></Link></Button>}
      {row.own && <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={busy || row.status !== "open"} onClick={async () => { setBusy(true); setError(null); setSelected(row.title); try { const result = await api.get<{ matches: Match[] }>(`/opportunities/${row.id}/matches`); setMatches(result.matches); } catch (err) { setError(err); } finally { setBusy(false); } }}>{t("opportunities.findMatches")}</Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={async () => { setBusy(true); setError(null); try { await api.patch(`/opportunities/${row.id}`, { status: "closed", published: false }); await reload(); setMatches(null); } catch (err) { setError(err); } finally { setBusy(false); } }}>{t("opportunities.close")}</Button>
      </div>}
    </CardContent></Card>;
  }
  return <div className="space-y-6"><div className="rounded-3xl border bg-paper p-6"><p className="mb-3 flex items-center gap-2 text-xs font-semibold text-oasis-strong"><Handshake size={18} />{t("opportunities.matching")}</p><h1 className="t-section text-ink">{t("opportunities.title")}</h1><p className="mt-3 text-sm text-muted-foreground">{t("opportunities.subtitle")}</p></div><ErrorText error={error} />
    <Card><CardHeader><CardTitle>{t("opportunities.create")}</CardTitle></CardHeader><CardContent><form className="grid gap-4 sm:grid-cols-2" onSubmit={async event => { event.preventDefault(); const form = event.currentTarget; const fd = new FormData(form); setBusy(true); setError(null); try { await api.post("/opportunities", { title: fd.get("title"), description: fd.get("description"), domain: fd.get("domain"), kind: fd.get("kind"), category: fd.get("category"), wilaya: fd.get("wilaya") || null, room_id: fd.get("room_id") ? Number(fd.get("room_id")) : null, published: fd.get("consent") === "on", consent: fd.get("consent") === "on" }); form.reset(); await reload(); } catch (err) { setError(err); } finally { setBusy(false); } }}>
      <div className="space-y-1"><Label htmlFor="opp-title">{t("opportunities.itemTitle")}</Label><Input id="opp-title" name="title" required minLength={3} maxLength={255} /></div>
      <div className="space-y-1"><Label htmlFor="opp-kind">{t("opportunities.kind")}</Label><select id="opp-kind" name="kind" className={selectClass}>{["need", "offer"].map(k => <option value={k} key={k}>{t(`opportunities.kinds.${k}`)}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="opp-domain">{t("project.domain")}</Label><select id="opp-domain" name="domain" className={selectClass}>{domains.map(d => <option value={d} key={d}>{t(`domains.${d}`)}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="opp-category">{t("opportunities.category")}</Label><select id="opp-category" name="category" className={selectClass}>{categories.map(c => <option value={c} key={c}>{t(`opportunities.categories.${c}`)}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="opp-wilaya">{t("topbar.selectWilaya")}</Label><Input id="opp-wilaya" name="wilaya" maxLength={100} /></div>
      <div className="space-y-1"><Label htmlFor="opp-room">{t("rooms.title")}</Label><select id="opp-room" name="room_id" className={selectClass}><option value="">{t("common.none")}</option>{rooms.map(r => <option value={r.id} key={r.id}>{r.title}</option>)}</select></div>
      <div className="space-y-1 sm:col-span-2"><Label htmlFor="opp-description">{t("opportunities.description")}</Label><Textarea id="opp-description" name="description" required minLength={10} maxLength={3000} /></div>
      <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="consent" className="mt-1" />{t("opportunities.consent")}</label><p className="text-xs text-muted-foreground sm:col-span-2">{t("opportunities.privacy")}</p><Button disabled={busy}>{t("opportunities.create")}</Button>
    </form></CardContent></Card>
    {matches !== null && <section className="space-y-4 rounded-2xl border border-oasis/30 bg-oasis/5 p-4"><h2 className="text-lg font-semibold">{t("opportunities.matchesFor")}: {selected}</h2><p className="text-xs text-muted-foreground">{t("opportunities.rules")}</p>{matches.length === 0 ? <p className="text-sm">{t("opportunities.noMatches")}</p> : matches.map(match => <div key={match.opportunity.id}><p className="mb-2 text-xs">{t("opportunities.score")}: {match.score}/3 · {match.basis.map(b => t(`opportunities.basis.${b}`)).join(" · ")} <ProvenanceBadge value="COMPUTED" /></p>{opportunityCard(match.opportunity)}</div>)}</section>}
    {loading ? <p>{t("common.loading")}</p> : <div className="grid gap-4 md:grid-cols-2">{rows.map(opportunityCard)}</div>}
  </div>;
}
