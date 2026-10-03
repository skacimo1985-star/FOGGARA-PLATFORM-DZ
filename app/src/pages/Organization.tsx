import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { UsersRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/useAuth";
import type { Organization, User } from "@/types";
import type { Invitation } from "@/types/platform";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ErrorText, DemoBadge } from "@/components/common";

export default function OrganizationPage() {
  const { t, i18n } = useTranslation(); const { user, startSession } = useAuth();
  const [org, setOrg] = useState<Organization | null>(null); const [members, setMembers] = useState<User[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]); const [token, setToken] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const reload = useCallback(async () => {
    const [o, m] = await Promise.all([api.get<Organization>("/org"), api.get<User[]>("/org/members")]); setOrg(o); setMembers(m);
    if (user?.role === "admin") setInvitations(await api.get<Invitation[]>("/org/invitations"));
  }, [user?.role]);
  useEffect(() => { reload().catch(setError); }, [reload]);
  const orgName = org ? (i18n.language === "fr" ? org.name_fr : i18n.language === "en" ? org.name_en : org.name_ar) : "";
  return <div className="space-y-6"><h1 className="t-section text-ink">{t("org.title")}</h1><ErrorText error={error} />
    {org && <Card><CardHeader><CardTitle>{orgName}<DemoBadge show={org.is_demo} /></CardTitle></CardHeader><CardContent><p className="text-sm" dir="ltr">{org.code}</p></CardContent></Card>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><UsersRound size={20} />{t("membership.members")}</CardTitle></CardHeader><CardContent className="space-y-3">{members.map(m => <div key={m.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><p className="font-medium">{m.full_name}</p><p className="text-xs text-muted-foreground" dir="ltr">{m.email}</p></div><Badge variant="outline">{t(`membership.roles.${m.role}`)}</Badge></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle>{t("accountSecurity.title")}</CardTitle></CardHeader><CardContent>
      <form className="space-y-4" onSubmit={async e => { e.preventDefault(); const form=e.currentTarget; const data=new FormData(form); setPasswordStatus(""); setError(null); if(data.get("new_password")!==data.get("confirm_password")){setPasswordStatus(t("accountSecurity.mismatch"));return;} setBusy(true); try { startSession(await api.post<{token:string;user:User}>("/auth/password", {current_password:data.get("current_password"),new_password:data.get("new_password")})); form.reset(); setPasswordStatus(t("accountSecurity.success")); } catch(err){setError(err);} finally{setBusy(false);} }}>
        {["current", "new", "confirm"].map(field=><div key={field} className="space-y-1"><Label htmlFor={`security-${field}`}>{t(`accountSecurity.${field}`)}</Label><Input id={`security-${field}`} name={field==='current'?'current_password':field==='new'?'new_password':'confirm_password'} type="password" required minLength={field==='current'?1:12} maxLength={1024} autoComplete={field==='current'?'current-password':'new-password'} dir="ltr" /></div>)}
        <Button disabled={busy}>{t("accountSecurity.submit")}</Button><p role="status" className="text-sm">{passwordStatus}</p>
      </form>
    </CardContent></Card>
    {user?.role === "admin" && <Card><CardHeader><CardTitle>{t("membership.invite")}</CardTitle></CardHeader><CardContent className="space-y-4">
      <form className="grid gap-3 sm:grid-cols-3" onSubmit={async e => { e.preventDefault(); const form = e.currentTarget; const fd = new FormData(form); setBusy(true); setToken(""); setError(null); try { const r = await api.post<{ token: string }>("/org/invitations", { email: fd.get("email"), role: fd.get("role") }); setToken(r.token); form.reset(); await reload(); } catch (err) { setError(err); } finally { setBusy(false); } }}>
        <div className="space-y-1"><Label htmlFor="invite-email">{t("auth.email")}</Label><Input id="invite-email" name="email" type="email" required dir="ltr" /></div>
        <div className="space-y-1"><Label htmlFor="invite-role">{t("org.yourRole")}</Label><select id="invite-role" name="role" className="w-full rounded-md border bg-background px-3 py-2 text-sm">{["member", "reviewer"].map(r => <option key={r} value={r}>{t(`membership.roles.${r}`)}</option>)}</select></div><Button disabled={busy} className="self-end">{t("membership.invite")}</Button>
      </form>
      <p className="text-xs text-muted-foreground">{t("membership.manualNotice")}</p>
      {token && <div className="rounded-xl border border-oasis/40 bg-oasis/10 p-4 space-y-3"><p className="text-sm">{t("membership.tokenNotice")}</p><Input aria-label={t("membership.token")} value={token} readOnly dir="ltr" /><Button variant="outline" onClick={() => navigator.clipboard.writeText(token).catch(setError)}>{t("membership.copy")}</Button><Button variant="ghost" onClick={() => setToken("")}>{t("membership.hide")}</Button></div>}
      {invitations.map(inv => <div key={inv.id} className="flex flex-wrap justify-between gap-3 border-t pt-3 text-sm"><span dir="ltr">{inv.email}</span><span>{t(`rooms.status.${inv.status}`)}</span>{inv.status === "pending" && <Button variant="outline" size="sm" disabled={busy} onClick={async () => { setBusy(true); setError(null); try { await api.patch(`/org/invitations/${inv.id}/revoke`, {}); setToken(""); await reload(); } catch (err) { setError(err); } finally { setBusy(false); } }}>{t("membership.revoke")}</Button>}</div>)}
    </CardContent></Card>}
  </div>;
}
