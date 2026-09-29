import { useTranslation } from "react-i18next";
import type { Review } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const dVariant = (d: string) =>
  (d === "accepted" ? "default" : d === "rejected" ? "destructive" : "outline") as "default" | "destructive" | "outline";

export function ReviewsSection({ reviews }: { reviews: Review[] }) {
  const { t } = useTranslation();

  if (reviews.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("review.empty")}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("review.when")}</TableHead>
            <TableHead>{t("review.target")}</TableHead>
            <TableHead>{t("review.decision")}</TableHead>
            <TableHead>{t("review.note")}</TableHead>
            <TableHead>{t("review.reason")}</TableHead>
            <TableHead>{t("review.reviewer")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {reviews.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="tabular-nums" dir="ltr">{new Date(r.created_at).toLocaleString()}</TableCell>
              <TableCell>{t(`review.targets.${r.target_type}`)} #{r.target_id}</TableCell>
              <TableCell>
                <Badge variant={dVariant(r.decision)}>{t(`review.decisions.${r.decision}`, r.decision)}</Badge>
              </TableCell>
              <TableCell className="max-w-xs">{r.note}</TableCell>
              <TableCell className="max-w-xs">{r.reason}</TableCell>
              <TableCell>#{r.reviewer_id}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
