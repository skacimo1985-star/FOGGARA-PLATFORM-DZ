import { useState } from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Sprout, Wrench, Building2, Layers3 } from "lucide-react";

const roles = [{ key: "producer", Icon: Sprout }, { key: "engineering", Icon: Wrench }, { key: "institution", Icon: Building2 }] as const;
type Role = typeof roles[number]["key"];
const paths: Record<Role, { key: string; to: string }[]> = {
  producer: [{ key: "agriculture", to: "/app/agriculture" }, { key: "water", to: "/app/water" }, { key: "operations", to: "/app/operations" }],
  engineering: [{ key: "metrology", to: "/app/metrology" }, { key: "services", to: "/app/services" }, { key: "rooms", to: "/app/vde" }],
  institution: [{ key: "projects", to: "/app/projects" }, { key: "studio", to: "/app/studio" }, { key: "decisions", to: "/app/decisions" }],
};
export function WorkflowGuide() {
  const { t } = useTranslation();
  const [role, setRole] = useState<Role>("producer");
  return <section className="fg-workflow-guide" aria-labelledby="workflow-guide-title">
    <div className="fg-landing-section-heading"><div><p className="fg-eyebrow">FOGGARA / {t("interaction.personalWorkflow")}</p>
      <h2 id="workflow-guide-title" className="fg-section-title">{t("interaction.guideTitle")}</h2></div><Layers3 size={28}/></div>
    <div className="fg-role-switch" role="group" aria-label={t("interaction.chooseRole")}>
      {roles.map(({ key, Icon }) => <button type="button" key={key} aria-pressed={role === key} onClick={() => setRole(key)}><Icon size={18}/>{t(`interaction.roles.${key}`)}</button>)}
    </div>
    <div className="fg-role-description" aria-live="polite"><p>{t(`interaction.roleCopy.${role}`)}</p></div>
    <div className="fg-guide-grid">{paths[role].map(({ key, to }, index) => <Link key={key} to={to} className="fg-guide-card">
      <span className="fg-guide-number" dir="ltr">0{index + 1}</span><h3>{t(`interaction.modules.${key}.title`)}</h3>
      <p>{t(`interaction.modules.${key}.body`)}</p><span className="fg-guide-open">{t("publicExperience.openWorkspace")}<ArrowUpRight size={16}/></span>
    </Link>)}</div>
    <div className="fg-guide-preview"><div><strong>{t("interaction.tryTitle")}</strong><p>{t("interaction.tryBody")}</p></div>
      <Link to="/presentation#matrix" className="fg-button">{t("interaction.tryAction")}<ArrowUpRight size={17}/></Link></div>
  </section>;
}
