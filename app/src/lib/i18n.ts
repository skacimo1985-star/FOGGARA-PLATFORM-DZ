import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import * as ar from "../locales/ar.json";
import * as fr from "../locales/fr.json";
import * as en from "../locales/en.json";

export type Locale = "ar" | "fr" | "en";

export function applyDir(locale: Locale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
}

const saved = (localStorage.getItem("locale") as Locale) || "ar";
applyDir(saved);

i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    fr: { translation: fr },
    en: { translation: en },
  },
  lng: saved,
  fallbackLng: "ar",
  interpolation: { escapeValue: false },
});

export function setLocale(locale: Locale) {
  localStorage.setItem("locale", locale);
  applyDir(locale);
  i18n.changeLanguage(locale);
}

export default i18n;
