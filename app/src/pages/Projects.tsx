import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import type { Asset, Project, Site, WaterResource } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorText, DemoBadge } from "@/components/common";

export default function Projects() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [resources, setResources] = useState<WaterResource[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.get<Project[]>("/projects").then(setProjects).catch(setError);
    api.get<Site[]>("/sites").then(setSites).catch(() => {});
    api.get<WaterResource[]>("/resources").then(setResources).catch(() => {});
    api.get<Asset[]>("/assets").then(setAssets).catch(() => {});
  };
  useEffect(load, []);

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const num = (k: string) => (fd.get(k) ? Number(fd.get(k)) : null);
    try {
      await api.post("/projects", {
        title: String(fd.get("title") || ""),
        description: String(fd.get("description") || "") || null,
        domain: String(fd.get("domain") || "water"),
        site_id: num("site_id"),
        resource_id: num("resource_id"),
        asset_id: num("asset_id"),
      });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="t-section text-ink">{t("project.title")}</h1>
        <Button onClick={() => setShowForm((v) => !v)}>{t("project.new")}</Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t("project.new")}</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="title">{t("project.name")}</Label>
                <Input id="title" name="title" required maxLength={255} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="description">{t("project.description")}</Label>
                <Textarea id="description" name="description" rows={2} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="domain">{t("project.domain")}</Label>
                <select id="domain" name="domain" className="w-full rounded-md border bg-background px-3 py-2 text-sm" defaultValue="water">
                  {["water", "energy", "food", "ecosystem", "health"].map((d) => (
                    <option key={d} value={d}>{t(`landing.${d}`)}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="site_id">{t("project.site")}</Label>
                <select id="site_id" name="site_id" className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                  <option value="">{t("common.none")}</option>
                  {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="resource_id">{t("project.resource")}</Label>
                <select id="resource_id" name="resource_id" className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                  <option value="">{t("common.none")}</option>
                  {resources.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="asset_id">{t("project.asset")}</Label>
                <select id="asset_id" name="asset_id" className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                  <option value="">{t("common.none")}</option>
                  {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div className="flex items-end gap-2 sm:col-span-2">
                <Button type="submit" disabled={busy}>{busy ? t("common.loading") : t("project.create")}</Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>{t("project.cancel")}</Button>
              </div>
              <div className="sm:col-span-2"><ErrorText error={error} /></div>
            </form>
          </CardContent>
        </Card>
      )}

      {projects === null ? (
        <Skeleton className="h-40 w-full" />
      ) : projects.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-muted-foreground">{t("project.empty")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <Link to={`/app/projects/${p.id}`}>
                <Card className="transition-colors hover:border-oasis/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center justify-between text-base">
                      <span>{p.title}<DemoBadge show={p.is_demo} /></span>
                      <span className="flex items-center gap-1">
                        <Badge variant="secondary">{t(`landing.${p.domain}`, p.domain)}</Badge>
                        <Badge variant="outline">{t(`project.statuses.${p.status}`)}</Badge>
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {p.description || t("common.none")}
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
