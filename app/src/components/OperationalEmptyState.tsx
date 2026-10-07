import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";

type Action =
  | { label: string; to: string }
  | { label: string; onClick: () => void };

type Props = {
  icon: LucideIcon;
  eyebrow?: string;
  title: string;
  body: string;
  steps?: string[];
  primary: Action;
  secondary?: Action;
};

function ActionControl({ action, primary = false }: { action: Action; primary?: boolean }) {
  if ("to" in action) {
    return (
      <Button asChild variant={primary ? "default" : "outline"}>
        <Link to={action.to}>
          {action.label}
          <ArrowUpRight size={15} />
        </Link>
      </Button>
    );
  }
  return (
    <Button type="button" variant={primary ? "default" : "outline"} onClick={action.onClick}>
      {action.label}
      <ArrowUpRight size={15} />
    </Button>
  );
}

export function OperationalEmptyState({
  icon: Icon,
  eyebrow = "PRODUCTION / REAL DATA",
  title,
  body,
  steps = [],
  primary,
  secondary,
}: Props) {
  return (
    <section className="rounded-2xl border border-emerald-700/20 bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-3xl">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
            {eyebrow}
          </p>
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-xl border border-emerald-700/20 bg-emerald-700/10 p-2 text-emerald-700">
              <Icon size={22} />
            </span>
            <div>
              <h2 className="text-lg font-bold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </div>
          </div>
          {steps.length > 0 ? (
            <ol className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
              {steps.map((step, index) => (
                <li className="rounded-lg border bg-background/60 p-3" key={step}>
                  <b className="me-2 text-emerald-700">{String(index + 1).padStart(2, "0")}</b>
                  {step}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <ActionControl action={primary} primary />
          {secondary ? <ActionControl action={secondary} /> : null}
        </div>
      </div>
    </section>
  );
}
