import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, Users } from "lucide-react";

import { useAuth } from "@/context/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorText } from "@/components/common";
import { ApiError, api } from "@/lib/api";
import { useRetryAfter } from "@/context/useRetryAfter";

type ExpoStats = { visitors: number; feedback: number };
type VisitResponse = ExpoStats & { visit_id: number; name: string | null; visitor_role: string | null };

function expoSessionKey() {
  const key = "fg_expo_session";
  let value = sessionStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID();
    sessionStorage.setItem(key, value);
  }
  return value;
}

export default function Login() {
  const { t, i18n } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const teamMode = new URLSearchParams(location.search).get("mode") === "team";
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<unknown>(null);
  const [guestError, setGuestError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [stats, setStats] = useState<ExpoStats>({ visitors: 0, feedback: 0 });
  const retryIn = useRetryAfter(error);
  const lang = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";

  const copy = lang === "fr" ? {
    badge: "AGRITECH EXPO · ACCÈS VISITEUR",
    title: "Entrez directement dans FOGGARA",
    body: "Le nom et la qualité sont facultatifs. Aucun mot de passe n'est demandé aux visiteurs.",
    name: "Nom (facultatif)",
    role: "Qualité / fonction (facultatif)",
    roleHint: "Ex. agriculteur, investisseur, institution, chercheur…",
    enter: "Entrer comme visiteur",
    visitors: "visiteurs",
    pro: "Accès équipe / administration",
    privacy: "Les champs visiteur sont facultatifs et utilisés uniquement pour le suivi du salon et l'amélioration de l'expérience.",
  } : lang === "en" ? {
    badge: "AGRITECH EXPO · VISITOR ACCESS",
    title: "Enter FOGGARA directly",
    body: "Name and role are optional. Expo visitors do not need a password.",
    name: "Name (optional)",
    role: "Role / capacity (optional)",
    roleHint: "E.g. farmer, investor, institution, researcher…",
    enter: "Enter as visitor",
    visitors: "visitors",
    pro: "Team / administration access",
    privacy: "Visitor fields are optional and used only for expo follow-up and experience improvement.",
  } : {
    badge: "AGRITECH EXPO · دخول الزوار",
    title: "ادخل إلى FOGGARA مباشرة",
    body: "الاسم والصفة اختياريان، ولا يحتاج زائر المعرض إلى كلمة مرور.",
    name: "الاسم (اختياري)",
    role: "الصفة / الوظيفة (اختياري)",
    roleHint: "مثال: فلاح، مستثمر، مؤسسة، باحث، جامعة…",
    enter: "دخول مباشر كزائر",
    visitors: "زائر",
    pro: "دخول الفريق / الإدارة",
    privacy: "بيانات الزائر اختيارية وتستخدم فقط لمتابعة المعرض وتحسين التجربة.",
  };

  useEffect(() => {
    let cancelled = false;
    api.get<ExpoStats>("/expo/stats").then(value => {
      if (!cancelled) setStats(value);
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  async function onGuestSubmit(e: FormEvent) {
    e.preventDefault();
    if (guestBusy) return;
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    const name = String(fd.get("guest_name") ?? "").trim();
    const visitorRole = String(fd.get("guest_role") ?? "").trim();
    setGuestBusy(true);
    setGuestError(null);
    try {
      const result = await api.post<VisitResponse>("/expo/visit", {
        session_key: expoSessionKey(),
        name: name || null,
        visitor_role: visitorRole || null,
      });
      sessionStorage.setItem("fg_expo_visit_id", String(result.visit_id));
      sessionStorage.setItem("fg_expo_profile", JSON.stringify({ name, visitor_role: visitorRole }));
      setStats({ visitors: result.visitors, feedback: result.feedback });
      navigate("/expo", { replace: true });
    } catch (err) {
      setGuestError(err);
    } finally {
      setGuestBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy || retryIn) return;
    const fd = new FormData(e.currentTarget as HTMLFormElement);
    setBusy(true);
    setError(null);
    try {
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
    <div className="mx-auto grid max-w-4xl gap-5 lg:grid-cols-[1.15fr_.85fr]">
      <Card className={teamMode?"order-2 lg:order-2 border-emerald-700/30":"border-emerald-700/30"}>
        <CardHeader>
          <div className="mb-3 flex items-center justify-between gap-3">
            <span className="rounded-full border px-3 py-1 text-[10px] font-bold tracking-[.12em] text-emerald-700">{copy.badge}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground"><Users size={16}/><b className="text-foreground">{stats.visitors}</b> {copy.visitors}</span>
          </div>
          <CardTitle className="t-section">{copy.title}</CardTitle>
          <p className="text-sm leading-7 text-muted-foreground">{copy.body}</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onGuestSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="guest_name">{copy.name}</Label>
              <Input id="guest_name" name="guest_name" maxLength={120} autoComplete="name" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="guest_role">{copy.role}</Label>
              <Input id="guest_role" name="guest_role" maxLength={120} placeholder={copy.roleHint} />
            </div>
            <ErrorText error={guestError} />
            <Button type="submit" className="w-full" disabled={guestBusy}>
              {guestBusy ? t("common.loading") : copy.enter}
            </Button>
            <p className="text-xs leading-6 text-muted-foreground">{copy.privacy}</p>
          </form>
        </CardContent>
      </Card>

      <Card className={teamMode?"order-1 lg:order-1 border-emerald-700/40":""}>
        <CardHeader>
          <CardTitle className="text-base">{copy.pro}</CardTitle>
          {teamMode ? <p className="text-xs leading-6 text-muted-foreground">{lang==="ar"?"لحفظ قطعة GIS وتحليلها في فقارة، سجّل الدخول بحساب المؤسسة أو أنشئ حسابًا جديدًا.":lang==="fr"?"Connectez-vous avec un compte d’organisation pour enregistrer et analyser votre parcelle FOGGARA.":"Sign in with an organization account to persist and analyze your FOGGARA field."}</p> : null}
        </CardHeader>
        <CardContent>
          <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">{t("auth.email")}</Label>
              <Input id="email" name="email" type="email" required maxLength={255} autoComplete="username" autoCapitalize="none" spellCheck={false} dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <div className="flex gap-2">
                <Input id="password" name="password" type={showPassword ? "text" : "password"} required maxLength={1024} autoComplete="current-password" dir="ltr"
                  onKeyUp={e=>setCapsLock(e.getModifierState("CapsLock"))} />
                <Button type="button" variant="outline" aria-label={t(showPassword ? "auth.hidePassword" : "auth.showPassword")} aria-pressed={showPassword} onClick={()=>setShowPassword(v=>!v)}>
                  {showPassword ? <EyeOff size={18}/> : <Eye size={18}/>}
                </Button>
              </div>
              {capsLock && <p role="status" className="text-xs text-muted-foreground">{t("auth.capsLock")}</p>}
            </div>
            <ErrorText error={error} />
            {error instanceof ApiError && error.code === "BAD_CREDENTIALS" && <p className="text-sm text-muted-foreground">{t("auth.loginHelp")}</p>}
            {retryIn > 0 && <p role="status" className="text-sm text-muted-foreground">{t("auth.retryIn", {seconds: retryIn})}</p>}
            <Button type="submit" className="w-full" variant="outline" disabled={busy || retryIn > 0}>
              {busy ? t("common.loading") : t("auth.submit")}
            </Button>
            <Button type="button" variant="ghost" className="w-full" disabled={busy} onClick={()=>{
              formRef.current?.reset();
              if(!retryIn)setError(null);
              setShowPassword(false);setCapsLock(false);
              formRef.current?.querySelector<HTMLInputElement>('input[name="email"]')?.focus();
            }}>{t("auth.clearSaved")}</Button>
          </form>
          <div className="mt-4 flex flex-wrap justify-between gap-3 text-xs text-oasis-strong">
            <Link to="/register">{t("membership.register")}</Link>
            <Link to="/join">{t("membership.join")}</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
