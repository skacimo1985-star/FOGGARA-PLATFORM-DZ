import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorText } from "@/components/common";
import { Eye, EyeOff } from "lucide-react";
import { ApiError } from "@/lib/api";
import { useRetryAfter } from "@/context/useRetryAfter";


export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const retryIn = useRetryAfter(error);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || retryIn) return;
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    setBusy(true);
    setError(null);
    try {
      // Read the submitted controls, including browser/password-manager autofill.
      await login(String(fd.get("email") ?? "").trim(), String(fd.get("password") ?? ""));
      const from = (location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null)?.from;
      const pathname = from?.pathname;
      const safePath = pathname?.startsWith("/") && !pathname.startsWith("//") ? pathname : "/app";
      navigate({ pathname: safePath, search: from?.search ?? "", hash: from?.hash ?? "" }, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle className="t-section">{t("auth.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" name="email" type="email" required maxLength={255} autoComplete="username" autoCapitalize="none" spellCheck={false} dir="ltr"
                     value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <div className="flex gap-2"><Input id="password" name="password" type={showPassword ? "text" : "password"} required maxLength={1024} autoComplete="current-password" dir="ltr"
                     value={password} onChange={(e) => setPassword(e.target.value)} onKeyUp={e=>setCapsLock(e.getModifierState("CapsLock"))} />
                <Button type="button" variant="outline" aria-label={t(showPassword ? "auth.hidePassword" : "auth.showPassword")} aria-pressed={showPassword} onClick={()=>setShowPassword(v=>!v)}>{showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}</Button></div>
              {capsLock && <p role="status" className="text-xs text-muted-foreground">{t("auth.capsLock")}</p>}
            </div>
            <ErrorText error={error} />
            {error instanceof ApiError && error.code === "BAD_CREDENTIALS" && <p className="text-sm text-muted-foreground">{t("auth.loginHelp")}</p>}
            {retryIn > 0 && <p role="status" className="text-sm text-muted-foreground">{t("auth.retryIn", {seconds: retryIn})}</p>}
            {busy && <p role="status" className="text-xs text-muted-foreground">{t("auth.startupNotice")}</p>}
            <Button type="submit" className="w-full" disabled={busy || retryIn > 0}>
              {busy ? t("common.loading") : t("auth.submit")}
            </Button>
          </form>
          <Button className="mt-3" type="button" variant="ghost" disabled={busy || retryIn > 0} onClick={()=>{setEmail("");setPassword("");setError(null);setShowPassword(false);setCapsLock(false);}}>{t("auth.clearSaved")}</Button>
          <p className="mt-3 text-xs text-muted-foreground">{t("auth.autofillNotice")}</p>
          <Link className="mt-3 inline-block text-sm text-oasis-strong underline" to="/demo">{t("demo.try")}</Link>
          <p className="mt-4 text-xs text-muted-foreground">{t("membership.sessionNotice")}</p>
          <div className="mt-4 flex flex-wrap justify-between gap-3 text-sm text-oasis-strong"><Link to="/register">{t("membership.register")}</Link><Link to="/join">{t("membership.join")}</Link></div>

        </CardContent>
      </Card>
    </div>
  );
}
