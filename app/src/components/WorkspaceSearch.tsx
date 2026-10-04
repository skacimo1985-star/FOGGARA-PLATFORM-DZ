import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Search, X, ArrowUpRight, FolderKanban } from "lucide-react";
import { api, type Paged } from "@/lib/api";
import type { Project } from "@/types";

type Destination = { to: string; key: string };
export function WorkspaceSearch({ destinations }: { destinations: Destination[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setLoading(true); setFailed(false); setOpen(value => !value);
      }
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open) { element.showModal(); input.current?.focus(); }
    else if (element.open) { element.close(); trigger.current?.focus(); }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    let alive = true;
    api.get<Paged<Project>>("/projects?page_size=100")
      .then(result => { if (alive) setProjects(result.items); })
      .catch(() => { if (alive) { setProjects([]); setFailed(true); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open]);
  const needle = query.trim().toLocaleLowerCase();
  const pages = destinations.filter(item => t(item.key).toLocaleLowerCase().includes(needle));
  const matches = projects.filter(project => `${project.title} ${project.id}`.toLocaleLowerCase().includes(needle));
  const go = (to: string) => { setOpen(false); setQuery(""); navigate(to); };
  return <>
    <button ref={trigger} type="button" className="os-search-trigger" onClick={() => { setLoading(true); setFailed(false); setOpen(true); }} aria-label={t("interaction.search")}>
      <Search size={17}/><span>{t("interaction.search")}</span><kbd dir="ltr">Ctrl K</kbd>
    </button>
    <dialog ref={dialog} className="os-search-dialog" aria-labelledby="workspace-search-title"
      onCancel={() => setOpen(false)} onClick={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <div className="os-search-dialog-header"><h2 id="workspace-search-title">{t("interaction.search")}</h2>
        <button type="button" onClick={() => setOpen(false)} aria-label={t("interaction.close")}><X size={20}/></button></div>
      <label className="os-search-dialog-input"><Search size={18}/><input ref={input} value={query}
        onChange={event => setQuery(event.target.value)} placeholder={t("interaction.searchPlaceholder")} aria-label={t("interaction.searchPlaceholder")}/></label>
      <div className="os-search-dialog-results">
        <p>{t("interaction.pages")}</p>{pages.map(item => <button type="button" key={item.to} onClick={() => go(item.to)}><span>{t(item.key)}</span><ArrowUpRight size={16}/></button>)}
        <p>{t("nav.projects")}</p>{loading && <span role="status">{t("common.loading")}</span>}
        {failed && <span role="status">{t("interaction.searchError")}</span>}
        {matches.slice(0, 20).map(project => <button type="button" key={project.id} onClick={() => go(`/app/projects/${project.id}`)}><FolderKanban size={16}/><span dir="auto">{project.title}</span><small dir="ltr">#{project.id}{project.is_demo ? " · DEMO" : ""}</small></button>)}
        {!loading && !failed && matches.length === 0 && <span>{t("interaction.noProjects")}</span>}
        {!pages.length && !matches.length && needle && <span role="status">{t("interaction.noResults")}</span>}
      </div><p className="os-search-dialog-note">{t("interaction.searchScope")}</p>
    </dialog>
  </>;
}
