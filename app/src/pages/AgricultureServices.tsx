import {useTranslation} from "react-i18next";
import {Link} from "react-router";
import {AgroCapabilities} from "@/components/AgroCapabilities";
import "./operations.css";
import "./landing.css";
export default function AgricultureServices(){const {t,i18n}=useTranslation();return <div className="fg-public" dir={i18n.dir()} lang={i18n.language}><header className="py-8"><h1 className="text-3xl font-bold">{t("agroProvider.title")}</h1><Link className="fg-link mt-4" to="/">{t("demo.back")}</Link></header><AgroCapabilities/></div>;}
