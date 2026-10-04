import {useEffect, useState} from "react";
import {Link} from "react-router";
import {useTranslation} from "react-i18next";
import {ArrowUpRight, Gauge, ClipboardCheck, Activity, FileSearch, Droplets, Wrench, MessagesSquare} from "lucide-react";
import {api} from "@/lib/api";
import type {Service} from "@/types";
import {ErrorText} from "@/components/common";

const icons = {calibration:Gauge, inspection:ClipboardCheck, measurement:Activity, technical_study:FileSearch, irrigation_service:Droplets, maintenance:Wrench, consultation:MessagesSquare};
export function ServiceOfferings() {
  const {t,i18n} = useTranslation();
  const [items,setItems] = useState<Service[]|null>(null), [error,setError] = useState<unknown>(null);
  useEffect(()=>{let live=true;api.get<Service[]>("/public/services").then(data=>{if(live)setItems(data);}).catch(e=>{if(live)setError(e);});return()=>{live=false;};},[]);
  return <section id="services" className="fg-offerings" aria-labelledby="offerings-title">
    <p className="fg-eyebrow">SIREP / SERVICES</p><h2 id="offerings-title">{t("service.offeringsTitle")}</h2><p>{t("service.offeringsNotice")}</p>
    <ErrorText error={error}/>{!items&&!error&&<p role="status">{t("common.loading")}</p>}
    {items?.length===0&&<p>{t("service.emptyCatalog")}</p>}
    <div className="fg-offerings-grid">{items?.map(s=>{const Icon=icons[s.type as keyof typeof icons]??Wrench;return <article key={s.id}><Icon size={26}/><h3>{i18n.language==="fr"?s.name_fr:i18n.language==="en"?s.name_en:s.name_ar}</h3><p>{t(`service.catalogDescriptions.${s.type}`)}</p><Link to={`/app/services?service=${s.id}`}>{t("service.requestThis")}<ArrowUpRight size={16}/></Link></article>;})}</div>
  </section>;
}
