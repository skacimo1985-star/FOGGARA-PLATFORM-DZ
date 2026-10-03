import { useTranslation } from "react-i18next";
import { ApiError } from "@/lib/api";

export function ErrorText({ error }: { error: unknown }) {
  const { t } = useTranslation();
  if (!error) return null;
  let code = error instanceof ApiError ? error.code : "NETWORK";
  if (code === "ERROR" && error instanceof ApiError) {
    // حالات أمان عامة: 403/404 برسالة مترجمة حتى بلا كود صريح
    if (error.status === 403) code = "FORBIDDEN";
    else if (error.status === 404) code = "NOT_FOUND";
  }
  return (
    <p role="alert" className="rounded-md border border-signal-strong/40 bg-signal/10 px-3 py-2 text-sm font-medium text-signal-strong">
      {t(`errors.${code}`, t("common.error"))}
    </p>
  );
}

export function DemoBadge({ show }: { show: boolean }) {
  const { t } = useTranslation();
  if (!show) return null;
  return (
    <span className="ms-1 rounded-full border border-sand/70 bg-sand/25 px-1.5 py-0.5 text-[10px] font-bold text-ink">
      {t("common.demoBadge")}
    </span>
  );
}

/**
 * شريط «قناة فڨارة» — فاصل بصري بين الأقسام:
 * خط أفقي رفيع متدرج تقطعه نقاط تمثل الآبار الأم على طول القناة.
 */
export function FoggaraDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`py-2 ${className}`} role="separator" aria-hidden="true">
      <svg viewBox="0 0 640 24" preserveAspectRatio="xMidYMid meet" className="h-6 w-full">
        <defs>
          <linearGradient id="foggara-channel" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="var(--oasis)" stopOpacity="0" />
            <stop offset="0.15" stopColor="var(--oasis)" stopOpacity="0.55" />
            <stop offset="0.85" stopColor="var(--oasis)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--oasis)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* القناة */}
        <line x1="0" y1="12" x2="640" y2="12" stroke="url(#foggara-channel)" strokeWidth="2.5" strokeDasharray="3 9" strokeLinecap="round" />
        {/* الآبار الأم */}
        {[80, 240, 400, 560].map((cx) => (
          <g key={cx}>
            <circle cx={cx} cy="12" r="5.5" fill="var(--paper)" stroke="var(--ink)" strokeOpacity="0.5" strokeWidth="1.2" />
            <circle cx={cx} cy="12" r="2" fill="var(--oasis)" fillOpacity="0.8" />
          </g>
        ))}
      </svg>
    </div>
  );
}
