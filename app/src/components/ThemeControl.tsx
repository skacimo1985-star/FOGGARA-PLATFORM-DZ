import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

export type Theme = "light" | "dark";

function readTheme(): Theme {
  try { return localStorage.getItem("foggara-theme") === "dark" ? "dark" : "light"; }
  catch { return "light"; }
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
}

// Apply before the first paint; only a cosmetic preference is persisted.
applyTheme(readTheme());

export function ThemeControl() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<Theme>(readTheme);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("foggara-theme", next); } catch { /* Storage may be disabled. */ }
    setTheme(next);
  }
  return <button type="button" className="os-theme-toggle" aria-label={t("theme.toggle")}
    title={t(`theme.${theme}`)} aria-pressed={theme === "dark"} onClick={toggle}>
    {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
  </button>;
}
