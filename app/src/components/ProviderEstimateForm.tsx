import {useState} from "react";
import {useTranslation} from "react-i18next";
import {useAuth} from "@/context/useAuth";
import {api} from "@/lib/api";
import type {Evidence} from "@/types";
import {ErrorText} from "@/components/common";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
const metrics={soil:["nitrogen_mg_kg","phosphorus_mg_kg","potassium_mg_kg","soc_g_kg","ph"],moisture:["moisture_percent"],ndvi:["ndvi"],lswi:["lswi"]};
export function ProviderEstimateForm({projectId,evidences,onSaved}:{projectId:number;evidences:Evidence[];onSaved:()=>Promise<void>}){
 const {t}=useTranslation(),{user}=useAuth();const [product,setProduct]=useState<keyof typeof metrics>("soil"),[busy,setBusy]=useState(false),[error,setError]=useState<unknown>(null);
 if(!user||!["admin","reviewer"].includes(user.role))return null;
 return <details className="rounded-2xl border p-5"><summary className="cursor-pointer font-semibold">{t("agroProvider.importTitle")}</summary><p className="my-4 text-sm text-muted-foreground">{t("agroProvider.importNotice")}</p><ErrorText error={error}/><form className="grid gap-4 sm:grid-cols-2" onSubmit={async e=>{e.preventDefault();if(busy)return;const form=e.currentTarget,fd=new FormData(form);setBusy(true);setError(null);try{const body:Record<string,unknown>={product,evidence_id:Number(fd.get("evidence_id")),source:fd.get("source"),observed_at:new Date(String(fd.get("observed_at"))).toISOString(),report_ref:fd.get("report_ref"),method:fd.get("method"),rights_confirmed:fd.get("rights_confirmed")==="on"};for(const k of [...metrics[product],"source_resolution_m","update_interval_days"])body[k]=fd.get(k)===""?null:Number(fd.get(k));await api.post(`/projects/${projectId}/agriculture/provider-estimate`,body);form.reset();await onSaved();}catch(err){setError(err);}finally{setBusy(false);}}}>
 <label className="space-y-1">{t("agri.recordKind")}<select className="w-full rounded-md border bg-background p-2" value={product} onChange={e=>setProduct(e.target.value as keyof typeof metrics)}>{Object.keys(metrics).map(k=><option key={k} value={k}>{t(`agroProvider.products.${k}.title`)}</option>)}</select></label>
 <label className="space-y-1">{t("agri.sourceEvidence")}<select name="evidence_id" required className="w-full rounded-md border bg-background p-2"><option value="">{t("rooms.chooseEvidence")}</option>{evidences.filter(e=>e.status==="verified").map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
 {(["source","report_ref","method","observed_at"] as const).map(k=><label key={k}>{t(k==="source"?"nexus.source":k==="observed_at"?"agri.observedAt":`agri.fields.${k}`)}<Input name={k} required type={k==="observed_at"?"datetime-local":"text"} minLength={k==="observed_at"?undefined:3} maxLength={255}/></label>)}
 {[...metrics[product],"source_resolution_m","update_interval_days"].map(k=><label key={`${product}-${k}`}>{t(`agri.fields.${k}`)}<Input name={k} type="number" step={k==="update_interval_days"?"1":"any"} required={product!=="soil"&&metrics[product].includes(k)} /></label>)}
 <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="rights_confirmed" required/>{t("agroProvider.rightsConfirm")}</label><Button disabled={busy||!evidences.some(e=>e.status==="verified")}>{t(busy?"common.loading":"agri.record")}</Button>
 </form></details>;
}
