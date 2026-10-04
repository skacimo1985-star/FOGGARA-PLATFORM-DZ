import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/context/useAuth";
import type { User } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorText } from "@/components/common";
import { useRetryAfter } from "@/context/useRetryAfter";

export default function Onboarding() {
  const { t, i18n } = useTranslation(); const { startSession } = useAuth(); const navigate = useNavigate();
  const joining = useLocation().pathname === "/join"; const [error, setError] = useState<unknown>(null); const [busy, setBusy] = useState(false);
  const retryIn = useRetryAfter(error);
  return <div className="mx-auto max-w-lg"><Card><CardHeader><CardTitle className="t-section">{t(joining ? "membership.join" : "membership.register")}</CardTitle></CardHeader><CardContent>
    <form className="space-y-4" onSubmit={async e => { e.preventDefault(); if (busy || retryIn) return; const fd = new FormData(e.currentTarget); setBusy(true); setError(null); try {
      const body = joining ? { token: fd.get("token"), full_name: fd.get("full_name"), password: fd.get("password") } : { email: fd.get("email"), full_name: fd.get("full_name"), password: fd.get("password"), organization_name: fd.get("organization_name"), locale: i18n.language };
      const result = await api.post<{ token: string; user: User }>(joining ? "/org/invitations/accept" : "/auth/register", body);
      startSession(result); navigate("/app");
    } catch (err) { setError(err); } finally { setBusy(false); } }}>
      <div className="space-y-1"><Label htmlFor="full-name">{t("membership.fullName")}</Label><Input id="full-name" name="full_name" autoComplete="name" required minLength={2} maxLength={255} /></div>
      {joining ? <div className="space-y-1"><Label htmlFor="join-token">{t("membership.token")}</Label><Input id="join-token" name="token" type="password" required minLength={40} maxLength={100} dir="ltr" autoComplete="off" /></div> : <>
        <div className="space-y-1"><Label htmlFor="organization-name">{t("membership.organizationName")}</Label><Input id="organization-name" name="organization_name" required minLength={2} maxLength={255} /></div>
        <div className="space-y-1"><Label htmlFor="account-email">{t("auth.email")}</Label><Input id="account-email" name="email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={255} required dir="ltr" /></div>
      </>}
      <div className="space-y-1"><Label htmlFor="new-password">{t("auth.password")}</Label><Input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} dir="ltr" /><p className="text-xs text-muted-foreground">{t("membership.passwordNotice")}</p></div>
      <p className="text-xs text-muted-foreground">{t("membership.identityNotice")}</p><ErrorText error={error} />
      {retryIn > 0 && <p role="status">{t("auth.retryIn", {seconds: retryIn})}</p>}
      {busy && <p role="status" className="text-xs text-muted-foreground">{t("auth.startupNotice")}</p>}
      <Button className="w-full" disabled={busy || retryIn > 0}>{busy ? t("common.loading") : t(joining ? "membership.join" : "membership.register")}</Button>
    </form><div className="mt-5 flex flex-wrap justify-between gap-3 text-sm text-oasis-strong"><Link to="/login">{t("auth.title")}</Link><Link to={joining ? "/register" : "/join"}>{t(joining ? "membership.register" : "membership.join")}</Link></div>
  </CardContent></Card></div>;
}
