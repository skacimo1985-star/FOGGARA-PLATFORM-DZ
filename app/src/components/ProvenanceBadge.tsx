import { useTranslation } from "react-i18next";
import { Eye, ShieldCheck, Calculator, GitBranch, Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * نظام شارات المصدر/الدليل (Phase 04 §12).
 * خمس فئات ذات دلالة — لا يجوز تحويل فئة إلى أخرى ضمنيًا:
 *   OBSERVED  قراءة مستشعر/رصد ميداني
 *   VERIFIED  دليل/شهادة اجتازت مراجعة بشرية
 *   COMPUTED  حساب حتمي قابل لإعادة التنفيذ
 *   INFERRED  علاقة مستنتجة من نموذج
 *   PROPOSED  اقتراح (قاعدة/وكيل) بانتظار مراجعة بشرية
 */
export type ProvenanceKind = "OBSERVED" | "VERIFIED" | "COMPUTED" | "INFERRED" | "PROPOSED";

const STYLES: Record<ProvenanceKind, string> = {
  OBSERVED: "border-oasis/50 bg-oasis/10 text-oasis-strong",
  VERIFIED: "border-ink/50 bg-ink/10 text-ink",
  COMPUTED: "border-sand/70 bg-sand/20 text-ink",
  INFERRED: "border-clay/60 bg-clay/15 text-ink",
  PROPOSED: "border-signal/50 bg-signal/10 text-signal-strong",
};

const ICONS: Record<ProvenanceKind, typeof Eye> = {
  OBSERVED: Eye,
  VERIFIED: ShieldCheck,
  COMPUTED: Calculator,
  INFERRED: GitBranch,
  PROPOSED: Lightbulb,
};

export function ProvenanceBadge({
  kind,
  className,
}: {
  kind: ProvenanceKind;
  className?: string;
}) {
  const { t } = useTranslation();
  const Icon = ICONS[kind];
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold",
        STYLES[kind],
        className,
      )}
      title={t(`provenance.descriptions.${kind}`)}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {t(`provenance.labels.${kind}`)}
    </span>
  );
}
