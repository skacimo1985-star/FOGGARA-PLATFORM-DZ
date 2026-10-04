import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/context/useAuth";
import type { Project, Service, ServiceRequest, Site } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorText, DemoBadge } from "@/components/common";

const SERVICE_TYPES = ["calibration", "inspection", "measurement", "technical_study", "irrigation_service", "maintenance", "consultation"];
const DOMAINS = ["water", "energy", "food", "ecosystem", "health"];

// انتقالات الحالة الموثقة في الـbackend (services.py ALLOWED_TRANSITIONS)
const NEXT_STATUSES: Record<string, string[]> = {
  submitted: ["triaged", "cancelled"],
  triaged: ["assigned", "cancelled"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const srVariant = (s: string) =>
  (s === "completed" ? "default" : s === "cancelled" ? "destructive" : "outline") as "default" | "destructive" | "outline";

export default function Services() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [services, setServices] = useState<Service[] | null>(null);
  const [requests, setRequests] = useState<ServiceRequest[] | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [typeFilter, setTypeFilter] = useState("");
  const [domainFilter, setDomainFilter] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const canTriage = user?.role === "reviewer" || user?.role === "admin";
  const serviceName = (s: Service) =>
    i18n.language === "fr" ? s.name_fr : i18n.language === "en" ? s.name_en : s.name_ar;

  const reload = useCallback(() => {
    setError(null);
    const qs = new URLSearchParams();
    if (typeFilter) qs.set("type", typeFilter);
    if (domainFilter) qs.set("domain", domainFilter);
    const suffix = qs.size ? `?${qs.toString()}` : "";
    api.get<Service[]>(`/services${suffix}`).then(setServices).catch(setError);
    api.get<ServiceRequest[]>("/service-requests").then(setRequests).catch(() => setRequests([]));
    api.getAll<Project>("/projects").then(setProjects).catch(setError);
    api.getAll<Site>("/sites").then(setSites).catch(setError);
  }, [typeFilter, domainFilter]);

  useEffect(reload, [reload]);

  async function onRequest(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const num = (k: string) => (fd.get(k) ? Number(fd.get(k)) : null);
    try {
      await api.post("/service-requests", {
        service_id: Number(fd.get("service_id")),
        project_id: num("project_id"),
        site_id: num("site_id"),
        requesting_entity: String(fd.get("requesting_entity") || "") || null,
        notes: String(fd.get("notes") || "") || null,
      });
      (e.target as HTMLFormElement).reset();
      reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(id: number, status: string) {
    setError(null);
    try {
      await api.patch(`/service-requests/${id}/status`, { status });
      reload();
    } catch (err) {
      setError(err);
    }
  }

  const selectCls = "w-full rounded-md border bg-background px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <h1 className="t-section text-ink">{t("service.title")}</h1>
      <ErrorText error={error} />

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
            <span>{t("service.catalog")}</span>
            <div className="flex gap-2">
              <select aria-label={t("service.filterType")} className="rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">{t("service.filterType")}: {t("service.all")}</option>
                {SERVICE_TYPES.map((st) => <option key={st} value={st}>{t(`service.types.${st}`)}</option>)}
              </select>
              <select aria-label={t("service.filterDomain")} className="rounded-md border bg-background px-2 py-1.5 text-sm"
                      value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}>
                <option value="">{t("service.filterDomain")}: {t("service.all")}</option>
                {DOMAINS.map((d) => <option key={d} value={d}>{t(`landing.${d}`)}</option>)}
              </select>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {services === null ? (
            <Skeleton className="h-32 w-full" />
          ) : services.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("service.emptyCatalog")}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((s) => (
                <li key={s.id} className="space-y-2 rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{serviceName(s)}</span>
                    <DemoBadge show={s.is_demo} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{t(`service.types.${s.type}`, s.type)}</Badge>
                    {s.domain && <Badge variant="outline">{t(`landing.${s.domain}`, s.domain)}</Badge>}
                    {s.is_demo && <Badge variant="outline">{t("service.demoNote")}</Badge>}
                  </div>
                  {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                  <p className="text-xs text-muted-foreground">{t("service.provider")}: {s.provider}</p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("service.request")}</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onRequest} className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="sr-service">{t("service.selectService")}</Label>
              <select id="sr-service" name="service_id" required className={selectCls} defaultValue="">
                <option value="" disabled>{t("service.selectService")}</option>
                {(services ?? []).map((s) => <option key={s.id} value={s.id}>{serviceName(s)}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sr-project">{t("service.selectProject")}</Label>
              <select id="sr-project" name="project_id" className={selectCls}>
                <option value="">{t("common.none")}</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sr-site">{t("service.selectSite")}</Label>
              <select id="sr-site" name="site_id" className={selectCls}>
                <option value="">{t("common.none")}</option>
                {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sr-entity">{t("service.requestingEntity")}</Label>
              <Input id="sr-entity" name="requesting_entity" maxLength={255} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="sr-notes">{t("service.notes")}</Label>
              <Textarea id="sr-notes" name="notes" rows={2} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>{busy ? t("common.loading") : t("service.submit")}</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("service.myRequests")}</CardTitle></CardHeader>
        <CardContent>
          {requests === null ? (
            <Skeleton className="h-24 w-full" />
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("service.emptyRequests")}</p>
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => {
                const srv = (services ?? []).find((s) => s.id === r.service_id);
                return (
                  <li key={r.id} className="space-y-2 rounded-md border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        #{r.id} — {srv ? serviceName(srv) : `${t("service.selectService")} #${r.service_id}`}
                        <DemoBadge show={r.is_demo} />
                      </span>
                      <Badge variant={srVariant(r.status)}>{t(`service.statuses.${r.status}`, r.status)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t("service.requestedAt")}: <span dir="ltr" className="tabular-nums">{new Date(r.created_at).toLocaleString()}</span>
                      {r.project_id && (
                        <>
                          {" · "}
                          <Link className="text-oasis-strong underline" to={`/app/projects/${r.project_id}`}>
                            {t("project.title")} #{r.project_id}
                          </Link>
                        </>
                      )}
                    </p>
                    {r.notes && <p className="rounded bg-parchment/70 p-2 text-xs">{r.notes}</p>}
                    {canTriage && NEXT_STATUSES[r.status]?.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t("service.changeStatus")}:</span>
                        {NEXT_STATUSES[r.status].map((ns) => (
                          <Button key={ns} size="sm" variant={ns === "cancelled" ? "destructive" : "outline"}
                                  onClick={() => changeStatus(r.id, ns)}>
                            {t(`service.statuses.${ns}`)}
                          </Button>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
