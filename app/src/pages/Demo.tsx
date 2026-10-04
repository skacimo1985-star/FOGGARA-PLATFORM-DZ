import {useState} from "react";
import {Link} from "react-router";
import {useTranslation} from "react-i18next";
import {ArrowUpRight, Droplets, Zap, ShieldCheck, RotateCcw} from "lucide-react";
import {calculateDemo,DEMO_WATER} from "@/lib/demo-scenario";
import {ServiceOfferings} from "@/components/ServiceOfferings";
import "./operations.css";
import "./landing.css";
import "./demo.css";

export default function Demo() {
  const {t,i18n}=useTranslation();
  const [scenario,setScenario]=useState<keyof typeof DEMO_WATER>("balanced");
  const [area,setArea]=useState("1"),[depth,setDepth]=useState("8"),[efficiency,setEfficiency]=useState("80"),[lift,setLift]=useState("35");
  const points=DEMO_WATER[scenario],available=points[6];
  const result=[area,depth,efficiency,lift].some(s=>s.trim()==="") ? null : calculateDemo(Number(area),Number(depth),Number(efficiency)/100,Number(lift),available);
  const format=(n:number)=>new Intl.NumberFormat(i18n.language,{maximumFractionDigits:1}).format(n);
  const reset=()=>{setScenario("balanced");setArea("1");setDepth("8");setEfficiency("80");setLift("35");};
  return <div className="fg-public fg-demo" dir={i18n.dir()} lang={i18n.language}>
    <header className="fg-demo-heading"><span className="fg-demo-badge">DEMO / {t("demo.synthetic")}</span><h1>{t("demo.title")}</h1><p>{t("demo.notice")}</p><Link className="fg-link" to="/">{t("demo.back")}</Link></header>
    <div className="fg-demo-layout"><section className="fg-demo-inputs" aria-labelledby="demo-inputs-title"><h2 id="demo-inputs-title">{t("demo.inputs")}</h2>
      <div className="fg-demo-scenarios">{(["balanced","stress"] as const).map(key=><button key={key} type="button" aria-pressed={scenario===key} onClick={()=>setScenario(key)}>{t(`demo.${key}`)}</button>)}</div>
      {([{key:"area",unit:"ha",value:area,set:setArea,min:0.01,max:100},{key:"depth",unit:"mm",value:depth,set:setDepth,min:0.1,max:50},{key:"efficiency",unit:"%",value:efficiency,set:setEfficiency,min:1,max:100},{key:"lift",unit:"m",value:lift,set:setLift,min:0,max:300}]).map(f=><label key={f.key}>{t(`demo.${f.key}`)} <span dir="ltr">({f.unit})</span><input type="number" step="any" min={f.min} max={f.max} value={f.value} onChange={e=>f.set(e.target.value)}/></label>)}
      <button type="button" className="fg-demo-reset" onClick={reset}><RotateCcw size={16}/>{t("demo.reset")}</button>
      <p>{t("demo.assumptions")}</p>
    </section><section className="fg-demo-results" aria-labelledby="demo-result-title"><h2 id="demo-result-title">{t("demo.result")}</h2>
      <div className="fg-demo-metrics"><article><Droplets size={22}/><span>{t("demo.demand")}</span><strong data-testid="demo-demand">{result?format(result.demandM3):"—"}<small> m³</small></strong></article><article><Zap size={22}/><span>{t("demo.energy")}</span><strong>{result?format(result.energyKwh):"—"}<small> kWh</small></strong></article><article><ShieldCheck size={22}/><span>{t("demo.available")}</span><strong>{format(available)}<small> m³</small></strong></article></div>
      <p className={`fg-demo-decision ${result?.blocked?"blocked":""}`} role="status" data-testid="demo-decision">{t(!result?"demo.invalid":result.blocked?"demo.blocked":"demo.feasible")}</p>
      <figure className="fg-demo-chart"><figcaption>{t("demo.chartTitle")} · m³ · DEMO</figcaption><svg viewBox="0 0 600 220" role="img" aria-label={t("demo.chartTitle")}>
        {[0,50,100,150].map(v=><g key={v}><line x1="44" x2="578" y1={184-v} y2={184-v} stroke="currentColor" opacity=".15"/><text x="8" y={189-v}>{v}</text></g>)}
        <polyline points={points.map((v,i)=>`${52+i*85},${184-v}`).join(" ")} fill="none" stroke="var(--chart-demo)" strokeWidth="3"/>
        {points.map((v,i)=><g key={i}><circle cx={52+i*85} cy={184-v} r="5" fill="var(--chart-demo)"/><text x={52+i*85} y="210" textAnchor="middle">D{i+1}</text></g>)}
      </svg><p>{t("demo.chartNote")}</p></figure>
      <details><summary>{t("demo.method")}</summary><p>{t("demo.formula")}</p><code dir="ltr">V = area(ha) × depth(mm) × 10 / efficiency<br/>E(kWh) = 1000 × 9.81 × lift(m) × V / (3,600,000 × 0.65)</code></details>
      <div className="fg-hero-actions"><Link className="fg-button" to="/app/projects">{t("demo.startProject")}<ArrowUpRight size={17}/></Link><Link className="fg-link" to="/presentation#matrix">{t("demo.matrix")}</Link></div>
    </section></div>
    <ServiceOfferings/>
  </div>;
}
