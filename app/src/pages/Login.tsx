import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorText } from "@/components/common";

const DEMO_ACCOUNTS = [
  "member@demo1.dz", "reviewer@demo1.dz", "admin@demo1.dz", "member@demo2.dz", "reviewer@demo2.dz",
];

export default function Login() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
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
              <Input id="email" type="email" required autoComplete="username" dir="ltr"
                     value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input id="password" type="password" required autoComplete="current-password" dir="ltr"
                     value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <ErrorText error={error} />
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t("common.loading") : t("auth.submit")}
            </Button>
          </form>
          <p className="mt-4 text-xs text-muted-foreground">{t("membership.sessionNotice")}</p>
          <div className="mt-4 flex flex-wrap justify-between gap-3 text-sm text-oasis-strong"><Link to="/register">{t("membership.register")}</Link><Link to="/join">{t("membership.join")}</Link></div>

          {import.meta.env.DEV && (
            <div className="mt-6 rounded-md border border-sand/60 bg-parchment p-3 text-xs text-ink/80">
              <p className="mb-1 font-bold text-ink">{t("auth.demoAccounts")}</p>
              <ul dir="ltr" className="list-inside list-disc">
                {DEMO_ACCOUNTS.map((a) => <li key={a}>{a} / Demo#2026</li>)}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
