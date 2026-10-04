import "@/pages/landing.css";
import {Link} from "react-router";
import {useTranslation} from "react-i18next";
import {Satellite, Sprout, Droplets, Leaf, Bug, Image, CloudSun, ArrowUpRight} from "lucide-react";

const products=[{key:"soil",Icon:Sprout},{key:"moisture",Icon:Droplets},{key:"ndvi",Icon:Leaf},{key:"lswi",Icon:Satellite},{key:"irrigation",Icon:Droplets},{key:"pests",Icon:Bug},{key:"images",Icon:Image},{key:"weather",Icon:CloudSun}];
export function AgroCapabilities({compact=false}:{compact?:boolean}) {
 const {t}=useTranslation();
 return <section className="fg-offerings fg-agro-capabilities" aria-labelledby={compact?"agro-capabilities-title":"agro-page-title"}>
  <p className="fg-eyebrow">FOGGARA / AGRICULTURE</p><h2 id={compact?"agro-capabilities-title":"agro-page-title"}>{t("agroProvider.title")}</h2>
  <p>{t("agroProvider.notice")}</p>
  {!compact&&<><p>{t("agroProvider.claimsNotice")}</p><div className="fg-offerings-grid">{products.map(({key,Icon})=><article key={key} data-testid="agro-capability"><Icon size={26}/><h3>{t(`agroProvider.products.${key}.title`)}</h3><p>{t(`agroProvider.products.${key}.use`)}</p><p>{t(`agroProvider.products.${key}.claim`)}</p><Link to={`/app/services?topic=${key}`}>{t("agroProvider.request")}<ArrowUpRight size={16}/></Link></article>)}</div><p>{t("agroProvider.cadenceNotice")}</p><p>{t("agroProvider.rightsNotice")}</p><p>{t("agroProvider.validationNotice")}</p></>}
  <Link className="fg-link" to={compact?"/agriculture-services":"/app/projects"}>{t(compact?"agroProvider.explore":"agroProvider.openRecords")}<ArrowUpRight size={17}/></Link>
 </section>;
}
