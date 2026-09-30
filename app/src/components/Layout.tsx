import { useEffect, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import {
  Droplets, Globe, MapPin, Clock3, LogOut, CloudOff,
  Home, Compass, FolderKanban, Wrench, Gauge, BarChart3,
  Map, Radio, Sun, Building2, ClipboardCheck, ScrollText, Gavel,
  Activity, FlaskConical, Menu, X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { setLocale, type Locale } from "@/lib/i18n";
import { WILAYAS } from "@/lib/wilayas";
import { Button } from "@/components/ui/button";

function AlgeriaClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const fmt = new Intl.DateTimeFormat("fr-DZ", {
    timeZone: "Africa/Algiers", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  return <span className="tabular-nums">{fmt.format(now)}</span>;
}

type NavItem = { to: string; key: string; icon: LucideIcon; end?: boolean };

const NAV_ITEMS: NavItem[] = [
  { to: "/app", key: "nav.home", icon: Home, end: true },
  { to: "/app/explore", key: "nav.explore", icon: Compass },
  { to: "/app/projects", key: "nav.projects", icon: FolderKanban },
  { to: "/app/services", key: "nav.services", icon: Wrench },
  { to: "/app/metrology", key: "nav.metrology", icon: Gauge },
  { to: "/app/water", key: "nav.water", icon: Droplets },
  { to: "/app/decisions", key: "nav.decisions", icon: Gavel },
  { to: "/app/analytics", key: "nav.analytics", icon: BarChart3 },
  { to: "/app/gis", key: "nav.gis", icon: Map },
  { to: "/app/iot", key: "nav.iot", icon: Radio },
  { to: "/app/telemetry", key: "nav.telemetry", icon: Activity },
  { to: "/app/simulator", key: "nav.simulator", icon: FlaskConical },
  { to: "/app/vde", key: "nav.vde", icon: Sun },
  { to: "/app/org", key: "nav.org", icon: Building2 },
  { to: "/app/audit", key: "nav.audit", icon: ScrollText },
];

export function Layout({ children }: { children: ReactNode }) {
  const { t, i18n } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [wilaya, setWilaya] = useState(() => localStorage.getItem("wilaya") || "");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const locale = (i18n.language || "ar") as Locale;

  const items = [...NAV_ITEMS];
  if (user && (user.role === "reviewer" || user.role === "admin")) {
    items.splice(10, 0, { to: "/app/review", key: "nav.review", icon: ClipboardCheck });
  }

  const topSelectCls =
    "rounded-full border border-ink/10 bg-white/75 px-3 py-1.5 text-sm text-ink " +
    "focus-visible:outline-sand [&>option]:text-ink";

  return (
    <div className="min-h-screen bg-background">
      {/* ==== الترويسة العلوية: شريط ink بهوية المخطوطات ==== */}
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/90 text-ink shadow-[0_4px_20px_rgb(38_70_83/0.035)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
          <Link to="/" className="flex items-center gap-2 font-extrabold text-ink">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-oasis/10 text-oasis-strong" aria-hidden="true">
              <Droplets className="h-5 w-5" />
            </span>
            <span>{t("app.name")}</span>
            <span className="rounded-full border border-sand/60 bg-sand/20 px-2 py-0.5 text-[10px] font-bold text-ink/70">
              {t("common.demoBadge")}
            </span>
          </Link>

          <div className="ms-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <label className="flex items-center gap-1 text-ink/65">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              <select
                aria-label={t("topbar.selectWilaya")}
                className={topSelectCls}
                value={wilaya}
                onChange={(e) => { setWilaya(e.target.value); localStorage.setItem("wilaya", e.target.value); }}
              >
                <option value="">{t("topbar.selectWilaya")}</option>
                {WILAYAS.map((w) => (
                  <option key={w.code} value={w.code}>
                    {w.code} — {w[locale]}
                  </option>
                ))}
              </select>
            </label>

            {user && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-ink/75 hover:bg-ink/5 hover:text-ink lg:hidden"
                aria-expanded={mobileNavOpen}
                aria-controls="mobile-main-navigation"
                aria-label={t(mobileNavOpen ? "common.closeMenu" : "common.openMenu")}
                onClick={() => setMobileNavOpen((open) => !open)}
              >
                {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </Button>
            )}

            <span
              className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-white/70 px-3 py-1.5 text-ink"
              title={t("topbar.algiersTime")}
            >
              <Clock3 className="h-4 w-4 text-sand" aria-hidden="true" />
              <AlgeriaClock />
            </span>

            <span
              className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-white/70 px-3 py-1.5 text-xs text-ink/65"
              title={t("topbar.weatherUnavailable")}
            >
              <CloudOff className="h-4 w-4 text-clay" aria-hidden="true" />
              {t("topbar.weatherUnavailable")}
            </span>

            <label className="flex items-center gap-1 text-ink/65">
              <Globe className="h-4 w-4" aria-hidden="true" />
              <select
                aria-label="Language"
                className={topSelectCls}
                value={locale}
                onChange={(e) => setLocale(e.target.value as Locale)}
              >
                <option value="ar">العربية</option>
                <option value="fr">Français</option>
                <option value="en">English</option>
              </select>
            </label>

            {user && (
              <Button
                variant="ghost"
                size="sm"
                className="text-ink/75 hover:bg-ink/5 hover:text-ink"
                onClick={() => { logout(); navigate("/"); }}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {t("nav.logout")}
              </Button>
            )}
          </div>
        </div>

        {/* قائمة قابلة للفتح على الهاتف بدل شريط روابط طويل */}
        {user && (
          <nav
            id="mobile-main-navigation"
            className={`${mobileNavOpen ? "grid" : "hidden"} mx-auto max-w-7xl grid-cols-2 gap-1 px-4 pb-3 sm:grid-cols-3 lg:hidden`}
            aria-label={t("nav.mainNavigation")}
          >
            {items.map(({ to, key, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={() => setMobileNavOpen(false)}
                className={({ isActive }) =>
                  `flex min-w-0 items-center gap-1.5 rounded-md px-3 py-2 text-start text-sm font-medium transition-colors ${
                    isActive ? "bg-ink font-bold text-paper" : "text-ink/75 hover:bg-ink/5 hover:text-ink"
                  }`
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {t(key)}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-7xl">
        {/* ==== شريط جانبي ثابت ضيق (يمين في RTL) ==== */}
        {user && (
          <aside className="sticky top-[57px] hidden h-[calc(100vh-57px)] w-60 shrink-0 self-start overflow-y-auto border-e border-ink/10 bg-parchment/60 px-3 py-6 lg:block">
            <nav className="flex flex-col gap-1" aria-label="main side">
              {items.map(({ to, key, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                      isActive
                        ? "bg-ink font-bold text-paper shadow-sm"
                        : "text-ink/75 hover:bg-ink/5 hover:text-ink"
                    }`
                  }
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {t(key)}
                </NavLink>
              ))}
            </nav>
          </aside>
        )}

        {/* ==== محتوى مائع ==== */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
