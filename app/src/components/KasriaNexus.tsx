import { useTranslation } from "react-i18next";
import { Droplets, Zap, Wheat, Leaf, HeartPulse } from "lucide-react";

/**
 * مرئية «القصريّة» (Phase 04 §6): خمسة روافد WEFEH تصبّ في حوض توزيع واحد —
 * نظام واحد مترابط، لا خمس لوحات مستقلة.
 * SVG خفيف بلا مكتبات وبلا حركة أساسية (الحركة الاختيارية تُلغى تلقائيًا
 * مع prefers-reduced-motion عبر القاعدة العامة في index.css).
 */
const STREAMS = [
  { key: "water", icon: Droplets, color: "var(--oasis)", x: 60 },
  { key: "energy", icon: Zap, color: "var(--sand)", x: 190 },
  { key: "food", icon: Wheat, color: "var(--clay)", x: 320 },
  { key: "ecosystem", icon: Leaf, color: "var(--oasis-strong)", x: 450 },
  { key: "health", icon: HeartPulse, color: "var(--signal)", x: 580 },
] as const;

export function KasriaNexus() {
  const { t } = useTranslation();
  return (
    <figure
      className="rounded-2xl border border-ink/10 bg-parchment/60 p-4"
      aria-label={t("nexus.kasria")}
    >
      <svg viewBox="0 0 640 150" className="h-32 w-full sm:h-36" role="img" aria-hidden="true">
        {/* الروافد الخمسة → حوض القصريّة */}
        {STREAMS.map((s) => (
          <path
            key={s.key}
            d={`M ${s.x} 26 C ${s.x} 70, 320 60, 320 96`}
            fill="none"
            stroke={s.color}
            strokeWidth="2.5"
            strokeDasharray="5 7"
            strokeLinecap="round"
            opacity="0.75"
          />
        ))}
        {/* حوض القصريّة */}
        <circle cx="320" cy="108" r="15" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" />
        <circle cx="320" cy="108" r="6.5" fill="var(--oasis)" opacity="0.85" />
        {/* قناة التوزيع بعد الحوض */}
        <line x1="60" y1="138" x2="580" y2="138" stroke="var(--ink)" strokeOpacity="0.35"
              strokeWidth="2" strokeDasharray="3 9" strokeLinecap="round" />
        {[130, 250, 390, 510].map((cx) => (
          <circle key={cx} cx={cx} cy="138" r="4" fill="var(--paper)"
                  stroke="var(--ink)" strokeOpacity="0.5" strokeWidth="1.2" />
        ))}
      </svg>
      {/* أسماء الروافد */}
      <ul className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs font-medium text-ink/80">
        {STREAMS.map((s) => {
          const Icon = s.icon;
          return (
            <li key={s.key} className="flex items-center gap-1">
              <Icon className="h-3.5 w-3.5" style={{ color: s.color }} aria-hidden="true" />
              {t(`landing.${s.key}`)}
            </li>
          );
        })}
      </ul>
      <figcaption className="mt-1 text-center text-[11px] text-muted-foreground">
        {t("nexus.kasria")}
      </figcaption>
    </figure>
  );
}
