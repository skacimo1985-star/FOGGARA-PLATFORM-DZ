import { useMemo, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Building2, CheckCircle2, Droplets, MapPinned, Sprout, Workflow } from "lucide-react";
import { api } from "@/lib/api";
import { WILAYAS } from "@/lib/wilayas";
import { ErrorText } from "@/components/common";

type SetupResult = {
  workspace_initialized: boolean;
  site: { id: number; created: boolean };
  resource: { id: number; created: boolean } | null;
  project: { id: number; created: boolean };
  parcel: { id: number; created: boolean } | null;
  is_demo: boolean;
};

export default function WorkspaceSetup() {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [domain, setDomain] = useState("food");
  const [createResource, setCreateResource] = useState(true);
  const [createParcel, setCreateParcel] = useState(true);
  const lang = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";

  const copy = useMemo(() => lang === "fr" ? {
    eyebrow: "MISE EN SERVICE · DONNÉES RÉELLES",
    title: "Créez votre premier espace opérationnel",
    body: "Ces données sont enregistrées dans votre organisation. Elles ne sont ni DEMO ni synthétiques.",
    site: "1. Site réel", project: "2. Projet", resource: "3. Ressource en eau (optionnelle)",
    parcel: "4. Parcelle agricole (optionnelle)", finish: "Créer et ouvrir l’espace",
    siteName: "Nom du site", wilaya: "Wilaya", commune: "Commune", lat: "Latitude", lon: "Longitude",
    projectTitle: "Nom du projet", description: "Objectif / description", domain: "Domaine WEFEH",
    resourceName: "Nom de la ressource", resourceType: "Type", parcelName: "Nom de la parcelle",
    crop: "Culture", area: "Surface (ha)", real: "PRODUCTION · is_demo=false",
    skip: "Vous pourrez ajouter d’autres sites, projets, preuves et capteurs ensuite.",
  } : lang === "en" ? {
    eyebrow: "OPERATIONAL SETUP · REAL DATA",
    title: "Create your first operational workspace",
    body: "These records are stored in your organization. They are neither DEMO nor synthetic.",
    site: "1. Real site", project: "2. Project", resource: "3. Water resource (optional)",
    parcel: "4. Agricultural parcel (optional)", finish: "Create and open workspace",
    siteName: "Site name", wilaya: "Wilaya", commune: "Commune", lat: "Latitude", lon: "Longitude",
    projectTitle: "Project name", description: "Objective / description", domain: "WEFEH domain",
    resourceName: "Resource name", resourceType: "Type", parcelName: "Parcel name",
    crop: "Crop", area: "Area (ha)", real: "PRODUCTION · is_demo=false",
    skip: "You can add more sites, projects, evidence and sensors afterwards.",
  } : {
    eyebrow: "تهيئة تشغيلية · بيانات حقيقية",
    title: "أنشئ أول مساحة عمل تشغيلية",
    body: "هذه السجلات تحفظ داخل مؤسستك في قاعدة البيانات، وليست DEMO ولا بيانات اصطناعية.",
    site: "1. الموقع الحقيقي", project: "2. المشروع", resource: "3. مورد الماء (اختياري)",
    parcel: "4. القطعة الزراعية (اختيارية)", finish: "إنشاء وفتح مساحة العمل",
    siteName: "اسم الموقع", wilaya: "الولاية", commune: "البلدية", lat: "خط العرض", lon: "خط الطول",
    projectTitle: "اسم المشروع", description: "الهدف / الوصف", domain: "مجال WEFEH",
    resourceName: "اسم مورد الماء", resourceType: "النوع", parcelName: "اسم القطعة",
    crop: "المحصول", area: "المساحة (هكتار)", real: "PRODUCTION · is_demo=false",
    skip: "يمكنك بعد ذلك إضافة مواقع ومشاريع وأدلة وحساسات أخرى.",
  }, [lang]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fd = new FormData(event.currentTarget);
    const numberOrNull = (name: string) => {
      const raw = String(fd.get(name) ?? "").trim();
      return raw === "" ? null : Number(raw);
    };
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<SetupResult>("/workspace/setup", {
        site: {
          name: fd.get("site_name"),
          wilaya: fd.get("wilaya"),
          commune: String(fd.get("commune") ?? "").trim() || null,
          lat: numberOrNull("lat"),
          lon: numberOrNull("lon"),
        },
        project: {
          title: fd.get("project_title"),
          description: String(fd.get("description") ?? "").trim() || null,
          domain,
        },
        resource: createResource ? {
          name: fd.get("resource_name"),
          type: fd.get("resource_type"),
          status: "active",
        } : null,
        parcel: createParcel ? {
          name: fd.get("parcel_name"),
          crop: fd.get("crop"),
          area_ha: Number(fd.get("area_ha")),
          stage: "initial",
        } : null,
      });
      navigate(result.parcel ? "/app/agriculture" : "/app", { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm";
  return <div className="mx-auto max-w-5xl space-y-6" dir={i18n.dir()}>
    <header className="rounded-2xl border bg-card p-6 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[.14em] text-emerald-700">
        <Workflow size={16}/>{copy.eyebrow}
        <span className="rounded-full border px-2 py-1 text-[10px] text-muted-foreground">{copy.real}</span>
      </div>
      <h1 className="text-3xl font-bold">{copy.title}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{copy.body}</p>
    </header>

    <form className="grid gap-5 lg:grid-cols-2" onSubmit={submit}>
      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><MapPinned size={20}/>{copy.site}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm sm:col-span-2">{copy.siteName}<input className={input} name="site_name" required maxLength={255}/></label>
          <label className="grid gap-1 text-sm">{copy.wilaya}<select className={input} name="wilaya" required defaultValue="">
            <option value="" disabled>—</option>{WILAYAS.map(w=><option key={w.code} value={w.ar}>{w.code} — {w[lang]}</option>)}
          </select></label>
          <label className="grid gap-1 text-sm">{copy.commune}<input className={input} name="commune" maxLength={100}/></label>
          <label className="grid gap-1 text-sm">{copy.lat}<input className={input} name="lat" type="number" step="any" min="-90" max="90" dir="ltr"/></label>
          <label className="grid gap-1 text-sm">{copy.lon}<input className={input} name="lon" type="number" step="any" min="-180" max="180" dir="ltr"/></label>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-bold"><Building2 size={20}/>{copy.project}</h2>
        <div className="grid gap-3">
          <label className="grid gap-1 text-sm">{copy.projectTitle}<input className={input} name="project_title" required maxLength={255}/></label>
          <label className="grid gap-1 text-sm">{copy.domain}<select className={input} value={domain} onChange={e=>setDomain(e.target.value)}>
            <option value="water">Water</option><option value="energy">Energy</option><option value="food">Food</option><option value="ecosystem">Ecosystem</option><option value="health">Health</option>
          </select></label>
          <label className="grid gap-1 text-sm">{copy.description}<textarea className={input} name="description" maxLength={5000} rows={4}/></label>
        </div>
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Droplets size={20}/>{copy.resource}</h2>
          <input type="checkbox" checked={createResource} onChange={e=>setCreateResource(e.target.checked)} aria-label={copy.resource}/>
        </div>
        {createResource && <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm sm:col-span-2">{copy.resourceName}<input className={input} name="resource_name" required maxLength={255}/></label>
          <label className="grid gap-1 text-sm sm:col-span-2">{copy.resourceType}<select className={input} name="resource_type" defaultValue="borehole">
            <option value="foggara">Foggara</option><option value="borehole">Borehole</option><option value="well">Well</option><option value="spring">Spring</option><option value="dam">Dam</option>
          </select></label>
        </div>}
      </section>

      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-bold"><Sprout size={20}/>{copy.parcel}</h2>
          <input type="checkbox" checked={createParcel} onChange={e=>setCreateParcel(e.target.checked)} aria-label={copy.parcel}/>
        </div>
        {createParcel && <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm sm:col-span-2">{copy.parcelName}<input className={input} name="parcel_name" required maxLength={160}/></label>
          <label className="grid gap-1 text-sm">{copy.crop}<input className={input} name="crop" required maxLength={80} placeholder={lang==="ar"?"مثال: نخيل، قمح، طماطم":"e.g. date_palm, wheat"}/></label>
          <label className="grid gap-1 text-sm">{copy.area}<input className={input} name="area_ha" required type="number" min="0.01" max="100000" step="0.01" dir="ltr"/></label>
        </div>}
      </section>

      <section className="lg:col-span-2 rounded-2xl border border-emerald-700/30 bg-card p-5">
        <ErrorText error={error}/>
        <p className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 size={17}/>{copy.skip}</p>
        <button className="w-full rounded-xl bg-emerald-700 px-5 py-3 font-bold text-white disabled:opacity-60" disabled={busy}>
          {busy ? "…" : copy.finish}
        </button>
      </section>
    </form>
  </div>;
}
