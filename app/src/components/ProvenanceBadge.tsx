import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";

export type ProvenanceClass =
  | "OBSERVED"
  | "VERIFIED"
  | "COMPUTED"
  | "INFERRED"
  | "PROPOSED"
  | "SIMULATION";

const STYLES: Record<ProvenanceClass, string> = {
  OBSERVED: "border-sky-700/30 bg-sky-100 text-sky-900",
  VERIFIED: "border-emerald-700/30 bg-emerald-100 text-emerald-900",
  COMPUTED: "border-violet-700/30 bg-violet-100 text-violet-900",
  INFERRED: "border-amber-700/30 bg-amber-100 text-amber-950",
  PROPOSED: "border-orange-700/30 bg-orange-100 text-orange-950",
  SIMULATION: "border-fuchsia-700/30 bg-fuchsia-100 text-fuchsia-950",
};

/** Describes how a value was produced; it is separate from the DEMO and review-status badges. */
export function ProvenanceBadge({ value }: { value: ProvenanceClass }) {
  const { t } = useTranslation();
  return (
    <Badge variant="outline" className={`ms-1 align-middle ${STYLES[value]}`}>
      {t(`provenance.${value}`)}
    </Badge>
  );
}
