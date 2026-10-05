import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { Activity, ArrowUpLeft, Check, Layers3, Plus, RefreshCw, ShieldCheck, Sprout } from "lucide-react";
import { api, type Paged } from "@/lib/api";
import { useAuth } from "@/context/useAuth";
import { WILAYAS } from "@/lib/wilayas";
import type { Project } from "@/types";
import "./operations.css";

type Item = {
  id: number; name?: string; version?: number; active?: boolean; status?: string;
  title?: string; project_id?: number; domain?: string; metric?: string; value?: string; unit?: string;
  source?: string; submitted_by?: number; kind?: string; sector?: string; product_code?: string;
  quantity?: string; wilaya?: string; code?: string; product?: string; stage?: string;
  offer_id?: number; demand_id?: number; score?: number; attempts?: number; error?: string;
  note?: string; response?: string; rules?: Record<string, Rule>;
  trace?: {stage: string; user_id: number; at: string; note: string}[];
  result?: {score: number | null; coverage: number; scores: Record<string, number>; missing: string[];
    evaluated_at: string; policy_version: number; observations: Record<string, number>};
};
type Rule = {metric: string; unit: string; lower: number; upper: number; direction: string; weight: number; max_age_hours: number};
const resources = ["evaluations", "observations", "lots", "listings", "matches", "policies", "jobs", "privacy"] as const;
type Resource = typeof resources[number];
function getLabels(t: TFunction): Record<string, string> { return {
  evaluations:t("productionCopy.wefehMatrix"), observations:t("productionCopy.measurementsAndReview"), lots:t("productionCopy.productionLots"),
  listings:t("productionCopy.supplyAndDemand"), matches:t("productionCopy.matchingOpportunities"), policies:t("productionCopy.evaluationRules"), jobs:t("productionCopy.jobProcessing"), privacy:t("productionCopy.dataRights"),
  water:t("productionCopy.water"), energy:t("productionCopy.energy"), food:t("productionCopy.food"), ecosystem:t("productionCopy.ecosystem"), health:t("productionCopy.health"),
  production:t("productionCopy.production"), processing:t("productionCopy.processing"), quality_review:t("productionCopy.qualityReview"), ready:t("productionCopy.readyForDistribution"),
  dispatched:t("productionCopy.dispatched"), closed:t("productionCopy.closed"), pending:t("productionCopy.pendingReview"), approved:t("productionCopy.approved"), rejected:t("productionCopy.rejected"),
  completed:t("productionCopy.completed"), failed:t("productionCopy.failed"), active:t("productionCopy.active"), received:t("productionCopy.received"), resolved:t("productionCopy.resolved"),
  offer:t("productionCopy.offer"), demand:t("productionCopy.demand"), agriculture:t("productionCopy.cropProduction"), livestock:t("productionCopy.livestockProduction"), aquaculture:t("productionCopy.fishingAndAquaculture"),
  logistics:t("productionCopy.logistics"), equipment:t("productionCopy.equipment"), services:t("productionCopy.services"), suggested:t("productionCopy.suggestion"),
  matching:t("productionCopy.supplyAndDemandMatching"), wefeh:t("productionCopy.wefehEvaluation"), access:t("productionCopy.dataAccess"), rectification:t("productionCopy.rectification"),
  erasure:t("productionCopy.erasure"), objection:t("productionCopy.objection"), restriction:t("productionCopy.restrictionOfProcessing"),
}; }
const domains = ["water", "energy", "food", "ecosystem", "health"];
const units = ["kg","t","l","m3","kWh","unit","hour"];
const stages = ["production","processing","quality_review","ready","dispatched","closed"];
const inputClass = "fg-input";
function Field({label, children}: {label: string; children: ReactNode}) {
  return <label className="fg-field"><span>{label}</span>{children}</label>;
}
function TextField({label, name, type="text", required=true, ...props}:
  {label: string; name: string; type?: string; required?: boolean; min?: number; max?: number; maxLength?: number; minLength?: number; step?: string; defaultValue?: string}) {
  return <Field label={label}><input className={inputClass} name={name} type={type} required={required} {...props}/></Field>;
}
function SelectField({label,name,values}: {label:string;name:string;values:string[]}) {
  const {t}=useTranslation(); const labels=getLabels(t);
  return <Field label={label}><select className={inputClass} name={name}>{values.map(v=><option key={v} value={v}>{labels[v] || v}</option>)}</select></Field>;
}
function Review({row,resource,disabled,onReview}:{
  row:Item;resource:"observations"|"evaluations";disabled:boolean;
  onReview:(path:string,body?:unknown)=>Promise<boolean>;
}) {
  const {t}=useTranslation();
  const {user}=useAuth();
  if(!user||!["admin","reviewer"].includes(user.role)||row.status!=="pending"||row.submitted_by===user.id)return null;
  return <form className="fg-inline-form" onSubmit={e=>{
    e.preventDefault();const f=new FormData(e.currentTarget);
    void onReview("/"+resource+"/"+row.id+"/review",{status:String(f.get("status")),note:String(f.get("note"))});
  }}>
    <TextField name="note" label={t("productionCopy.reviewRationale")} minLength={3} maxLength={2000}/>
    <SelectField name="status" label={t("productionCopy.decision")} values={["approved","rejected"]}/>
    <button className="fg-button" disabled={disabled}>{t("productionCopy.saveReview")}</button>
  </form>;
}
function ProjectSelector({projects}:{projects:Project[]}) {
  const {t}=useTranslation();
  return <Field label={t("productionCopy.project")}><select name="project_id" className={inputClass} required>
    <option value="">{t("productionCopy.selectAProject")}</option>{projects.map(p=><option key={p.id} value={p.id}>{p.title}{p.is_demo?" · DEMO":""}</option>)}
  </select></Field>;
}
export default function Operations() {
  const {t,i18n}=useTranslation(); const labels=getLabels(t);
  const {user} = useAuth();
  const [tab,setTab] = useState<Resource>("evaluations");
  const [page,setPage] = useState(1);
  const [data,setData] = useState<Partial<Record<Resource,Paged<Item>>>>({});
  const [projects,setProjects] = useState<Project[]>([]);
  const [busy,setBusy] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [expanded,setExpanded] = useState<number | null>(null);
  const [revision,setRevision] = useState(0);
  const [rules,setRules] = useState<Record<string,Rule>>(()=>Object.fromEntries(domains.map(d=>[
    d,{metric:d+"-index",unit:"%",lower:0,upper:100,direction:"higher",weight:0.2,max_age_hours:24}
  ])));
  const [policyChecked,setPolicyChecked] = useState(false);
  const reviewer = user?.role === "admin" || user?.role === "reviewer";
  const canAdmin = user?.role === "admin";
  useEffect(()=>{
    let alive=true;
    setLoading(true); setError("");
    Promise.all([
      api.getAll<Project>("/projects"),
      ...resources.map(r=>api.get<Paged<Item>>("/operations/"+r+"?page="+(r===tab?page:1)+"&page_size=20"))
    ]).then(([p,...result])=>{
      if(!alive)return;
      setProjects(p as Project[]);
      setData(Object.fromEntries(resources.map((r,i)=>[r,result[i]])));
    }).catch((e:unknown)=>{if(alive)setError(e instanceof Error?e.message:t("productionCopy.unableToConnect"));})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[tab,page,revision,t]);
  const run = useCallback(async (path:string,body?:unknown)=>{
    setBusy(true);setError("");setNotice("");
    try {
      await api.post("/operations"+path,body);
      setNotice(t("productionCopy.theOperationWasSaved"));
      setRevision(v=>v+1);
      setExpanded(null);
      return true;
    } catch(e) {setError(e instanceof Error?e.message:t("productionCopy.unableToSaveTheOperation"));return false;}
    finally {setBusy(false);}
  },[t]);
  const submit = (fn:(f:FormData)=>[string,unknown])=>(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();const form=e.currentTarget;const [path,body]=fn(new FormData(form));
    void run(path,body).then(ok=>{if(ok)form.reset();});
  };
  const s=(f:FormData,k:string)=>String(f.get(k)||"");
  const n=(f:FormData,k:string)=>Number(f.get(k));
  const projectField = <ProjectSelector projects={projects}/>;
  const current=data[tab];
  const actionsDisabled=busy||loading;
  return <div className="fg-console" dir={i18n.dir()} lang={i18n.language}>
    <div className="fg-console-heading"><div><p className="fg-eyebrow">FOGGARA / OPERATIONS</p>
      <h1>{t("productionCopy.fromResourcesToValue")}</h1><p>{t("productionCopy.productionWorkspaceYourOrganizationsDataAndTraceable")}</p></div>
      <button className="fg-button fg-secondary" onClick={()=>setRevision(v=>v+1)} disabled={loading}><RefreshCw size={16}/>{t("productionCopy.refreshData")}</button>
    </div>
    <div className="fg-metrics">
      {([["lots",t("productionCopy.productionLots"),Sprout],["listings",t("productionCopy.supplyAndDemand"),Layers3],["evaluations",t("productionCopy.evaluationResults"),ShieldCheck],["jobs",t("productionCopy.processingJobs"),Activity]] as const).map(([key,label,Icon])=>
        <button key={key} className="fg-metric" onClick={()=>{setTab(key);setPage(1);}}><Icon size={20}/><strong>{data[key]?.total??"—"}</strong><span>{label}</span></button>)}
    </div>
    <nav className="fg-tabs" aria-label={t("productionCopy.productionModules")}>{resources.map(r=><button key={r} aria-current={tab===r?"page":undefined}
      onClick={()=>{setTab(r);setPage(1);setExpanded(null);}}>{labels[r]}</button>)}</nav>
    {error&&<div role="alert" className="fg-alert">{error} <button onClick={()=>setRevision(v=>v+1)}>{t("productionCopy.tryAgain")}</button></div>}
    {notice&&<p role="status" className="fg-success"><Check size={16}/>{notice}</p>}
    {!projects.length&&!loading&&<p className="fg-note">{t("productionCopy.startByAddingAProjectToYour")} <Link to="/app/projects">{t("productionCopy.openProjects")}</Link></p>}
    <div className="fg-workspace">
      <section className="fg-panel">
        <div className="fg-section-heading"><div><p className="fg-eyebrow">WORKSPACE / {tab.toUpperCase()}</p><h2>{labels[tab]}</h2></div><span className="fg-counter">{current?.total??0}</span></div>
        {loading?<p role="status" className="fg-empty">{t("productionCopy.loadingRecords")}</p>:!current?.items.length?
          <div className="fg-empty"><Layers3 size={34}/><h3>{t("productionCopy.aWorkspaceReadyForYourData")}</h3><p>{t("productionCopy.noRecordsYetAddRealDataOr")}</p></div>:
          <div className="fg-records">{current.items.map(row=><article className="fg-record" key={row.id}>
            <div className="fg-record-top"><div><span className="fg-record-id">#{row.id}</span><h3>{row.name||row.title||row.product||labels[row.domain||row.kind||""]||(t("productionCopy.project2")+row.project_id)}</h3></div>
              <span className={"fg-status "+(row.status==="approved"||row.status==="completed"?"fg-status-good":"")}>{labels[row.status||row.stage||""]||(row.active?t("productionCopy.activeRules"):t("productionCopy.draft"))}</span></div>
            {tab==="evaluations"&&row.result&&<>
              <div className="fg-score"><strong>{row.result.score===null?"—":row.result.score}<small>/ 100</small></strong>
                <span>{t("productionCopy.dataCoverage")} {Math.round(row.result.coverage*100)}{t("productionCopy.policyVersion")} {row.result.policy_version}</span></div>
              <div className="fg-domain-bars">{domains.map(d=><div key={d}><span>{labels[d]}</span><meter min={0} max={100} value={row.result?.scores[d]??0} aria-label={labels[d]}/><b>{row.result?.scores[d]??"—"}</b></div>)}</div>
              {!!row.result.missing.length&&<p className="fg-note">{t("productionCopy.approvedDataRequired")} {row.result.missing.map(d=>labels[d]).join(t("productionCopy.listSeparator"))}</p>}
              <p className="fg-muted">{t("productionCopy.snapshotSavedOn")} {new Date(row.result.evaluated_at).toLocaleString(i18n.language+"-DZ")}  {t("productionCopy.approvalDoesNotOperateFieldEquipment")}</p>
              <Review row={row} resource="evaluations" disabled={actionsDisabled} onReview={run}/>
            </>}
            {tab==="observations"&&<><p className="fg-value">{row.value} <small>{row.unit}</small></p><p className="fg-muted">{row.metric} · {row.source}  {t("productionCopy.project3")}{row.project_id}</p><Review row={row} resource="observations" disabled={actionsDisabled} onReview={run}/></>}
            {tab==="lots"&&<>
              <p>{row.code} · {row.quantity} {row.unit} · {labels[row.sector||""]}</p>
              <ol className="fg-stages">{stages.map((stage,i)=><li key={stage} className={i<=stages.indexOf(row.stage||"")?"done":""}>{labels[stage]}</li>)}</ol>
              {row.stage!=="closed"&&<form className="fg-inline-form" onSubmit={submit(f=>["/lots/"+row.id+"/transition",{stage:stages[stages.indexOf(row.stage||"")+1],note:s(f,"note")}])}>
                <TextField label={t("productionCopy.stageReferenceOrNote")} name="note" minLength={3} maxLength={2000}/>
                <button className="fg-button" disabled={actionsDisabled||(row.stage==="quality_review"&&!reviewer)}>{t("productionCopy.moveTo")} {labels[stages[stages.indexOf(row.stage||"")+1]]}</button>
              </form>}
              <details><summary>{t("productionCopy.traceHistory")}</summary><ol>{row.trace?.map((t,i)=><li key={i}>{labels[t.stage]} · {t.note} · {new Date(t.at).toLocaleString(i18n.language+"-DZ")} · #{t.user_id}</li>)}</ol></details>
            </>}
            {tab==="listings"&&<><p>{labels[row.kind||""]} · {row.quantity} {row.unit} · {row.wilaya}</p><p className="fg-muted">{row.product_code} · {labels[row.sector||""]}</p>
              {row.status==="active"&&<button className="fg-link" disabled={actionsDisabled} onClick={()=>void run("/listings/"+row.id+"/close")}>{t("productionCopy.closeRecord")}</button>}</>}
            {tab==="matches"&&<><p>{t("productionCopy.offer2")}{row.offer_id}  {t("productionCopy.demand2")}{row.demand_id}</p><p className="fg-value">{row.quantity} {row.unit} <small>{t("productionCopy.suggestedQuantityCompatibility")} {row.score}/100</small></p>
              <p className="fg-muted">{t("productionCopy.aProposalForReviewWithinTheOrganization")}</p></>}
            {tab==="policies"&&<><p>{t("productionCopy.version")} {row.version}  {t("productionCopy.organizationspecificRules")}</p>
              <button className="fg-link" onClick={()=>setExpanded(expanded===row.id?null:row.id)}>{t("productionCopy.showBoundsAndWeights")}</button>
              {expanded===row.id&&<div className="fg-table-wrap"><table><thead><tr><th>{t("productionCopy.domain")}</th><th>{t("productionCopy.metricUnit")}</th><th>{t("productionCopy.range")}</th><th>{t("productionCopy.weight")}</th><th>{t("productionCopy.validityInHours")}</th></tr></thead>
                <tbody>{Object.entries(row.rules||{}).map(([d,r])=><tr key={d}><td>{labels[d]}</td><td>{r.metric} / {r.unit}</td><td>{r.lower} – {r.upper} ({r.direction})</td><td>{r.weight}</td><td>{r.max_age_hours}</td></tr>)}</tbody></table></div>}
              {canAdmin&&!row.active&&<button className="fg-button" disabled={actionsDisabled} onClick={()=>void run("/policies/"+row.id+"/activate")}>{t("productionCopy.activateThisVersion")}</button>}</>}
            {tab==="jobs"&&<p className="fg-muted">{t("productionCopy.attempts")} {row.attempts} {row.error?" · "+row.error:""} · {row.project_id?t("productionCopy.project2")+row.project_id:t("productionCopy.organization")}</p>}
            {tab==="privacy"&&<><p>{row.note}</p>{row.response&&<p className="fg-note">{row.response}</p>}{canAdmin&&row.status==="received"&&<form onSubmit={submit(f=>["/privacy/"+row.id+"/resolve",{response:s(f,"response")}])}>
              <TextField label={t("productionCopy.responseAfterProcessingAndIdentityVerification")} name="response" minLength={10} maxLength={3000}/><button className="fg-button" disabled={actionsDisabled}>{t("productionCopy.saveResponse")}</button></form>}</>}
          </article>)}</div>}
        {(current?.pages??1)>1&&<div className="fg-pagination"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>{t("productionCopy.previous")}</button><span>{page} / {current?.pages}</span><button disabled={page===(current?.pages??1)} onClick={()=>setPage(p=>p+1)}>{t("productionCopy.next")}</button></div>}
      </section>
      <aside className="fg-panel fg-compose">
        <div className="fg-section-heading"><h2>{tab==="jobs"?t("productionCopy.howDoesProcessingWork"):t("productionCopy.newAction")}</h2><Plus size={18}/></div>
        {tab==="evaluations"&&<form onSubmit={submit(f=>["/projects/"+s(f,"project_id")+"/evaluate",undefined])}>
          <p className="fg-note">{t("productionCopy.theEvaluationUsesEachDomainsLatestApproved")}</p>{projectField}
          <button className="fg-button" disabled={actionsDisabled||!projects.length}><Activity size={16}/>{t("productionCopy.evaluateNow")}</button></form>}
        {tab==="observations"&&<form onSubmit={submit(f=>["/observations",{project_id:n(f,"project_id"),domain:s(f,"domain"),metric:s(f,"metric"),value:s(f,"value"),unit:s(f,"unit"),source:s(f,"source"),measured_at:new Date(s(f,"measured_at")).toISOString()}])}>
          {projectField}<SelectField label={t("productionCopy.domain")} name="domain" values={domains}/><TextField label={t("productionCopy.metricCodeMatchingThePolicy")} name="metric" minLength={2} maxLength={80}/><TextField label={t("productionCopy.value")} name="value" type="number" step="0.00001"/>
          <TextField label={t("productionCopy.unitMatchingThePolicy")} name="unit" maxLength={30}/><TextField label={t("productionCopy.measurementEvidenceReference")} name="source" minLength={3} maxLength={500}/>
          <TextField label={t("productionCopy.localMeasurementTime")} name="measured_at" type="datetime-local"/><button className="fg-button" disabled={actionsDisabled||!projects.length}>{t("productionCopy.submitForReview")}</button></form>}
        {tab==="lots"&&<form onSubmit={submit(f=>["/lots",{project_id:n(f,"project_id"),code:s(f,"code"),product:s(f,"product"),sector:s(f,"sector"),quantity:s(f,"quantity"),unit:s(f,"unit")}])}>
          {projectField}<TextField label={t("productionCopy.uniqueLotCode")} name="code" minLength={2} maxLength={80}/><TextField label={t("productionCopy.product")} name="product" minLength={2} maxLength={150}/>
          <SelectField label={t("productionCopy.sector")} name="sector" values={["agriculture","livestock","aquaculture","processing","logistics","equipment","services"]}/>
          <TextField label={t("productionCopy.quantity")} name="quantity" type="number" min={0.0001} step="0.0001"/><SelectField label={t("productionCopy.unit")} name="unit" values={units}/>
          <button className="fg-button" disabled={actionsDisabled||!projects.length}>{t("productionCopy.addProductionLot")}</button></form>}
        {tab==="listings"&&<form onSubmit={submit(f=>["/listings",{kind:s(f,"kind"),sector:s(f,"sector"),title:s(f,"title"),product_code:s(f,"product_code"),quantity:s(f,"quantity"),unit:s(f,"unit"),wilaya:s(f,"wilaya")}])}>
          <SelectField label={t("productionCopy.recordType")} name="kind" values={["offer","demand"]}/><TextField label={t("productionCopy.title")} name="title" minLength={3} maxLength={200}/>
          <SelectField label={t("productionCopy.sector")} name="sector" values={["agriculture","livestock","aquaculture","processing","logistics","equipment","services"]}/>
          <TextField label={t("productionCopy.sharedProductCode")} name="product_code" minLength={2} maxLength={80}/>
          <TextField label={t("productionCopy.quantity")} name="quantity" type="number" min={0.0001} step="0.0001"/><SelectField label={t("productionCopy.unit")} name="unit" values={units}/>
          <Field label={t("productionCopy.wilayaCode")}><select className={inputClass} name="wilaya" required><option value="">{t("registry.choose")}</option>{WILAYAS.map(w=><option key={w.code} value={w.code}>{w.code} — {w[(i18n.language||"ar") as "ar"|"fr"|"en"]}</option>)}</select></Field><button className="fg-button" disabled={actionsDisabled}>{t("productionCopy.saveRecord")}</button></form>}
        {tab==="matches"&&<><p className="fg-note">{t("productionCopy.matchingReturnsUpTo20AlternativesPer")}</p><button className="fg-button" disabled={actionsDisabled} onClick={()=>void run("/match")}>{t("productionCopy.refreshMatching")}</button></>}
        {tab==="policies"&&(canAdmin?<form onSubmit={submit(f=>["/policies",{name:s(f,"name"),rules}])}>
          <p className="fg-note">{t("productionCopy.theseEditableExamplesAreNotScientificOr")}</p>
          <TextField label={t("productionCopy.versionNameAndReference")} name="name" minLength={3} maxLength={150}/>
          {domains.map(d=><fieldset key={d} className="fg-rule"><legend>{labels[d]}</legend>
            {(["metric","unit","lower","upper","weight","max_age_hours"] as const).map(k=><Field key={k} label={({metric:t("productionCopy.metricCode"),unit:t("productionCopy.unit"),lower:t("productionCopy.lowerBound"),upper:t("productionCopy.upperBound"),weight:t("productionCopy.weight"),max_age_hours:t("productionCopy.validityHours")})[k]}>
              <input className={inputClass} required type={k==="unit"||k==="metric"?"text":"number"} step={k==="max_age_hours"?"1":"any"} value={rules[d][k]}
                onChange={e=>setRules(prev=>({...prev,[d]:{...prev[d],[k]:k==="unit"||k==="metric"?e.target.value:Number(e.target.value)}}))}/></Field>)}
            <Field label={t("productionCopy.preferredPerformanceDirection")}><select className={inputClass} value={rules[d].direction} onChange={e=>setRules(prev=>({...prev,[d]:{...prev[d],direction:e.target.value}}))}><option value="higher">{t("productionCopy.higherIsBetter")}</option><option value="lower">{t("productionCopy.lowerIsBetter")}</option></select></Field>
          </fieldset>)}
          <label className="fg-checkbox"><input type="checkbox" checked={policyChecked} onChange={e=>setPolicyChecked(e.target.checked)}/>{t("productionCopy.iReviewedTheBoundsAndWeightsFor")}</label>
          <button className="fg-button" disabled={actionsDisabled||!policyChecked}>{t("productionCopy.saveSeparateVersion")}</button></form>:<p>{t("productionCopy.organizationRulesAreManagedByTheAdministrator")}</p>)}
        {tab==="jobs"&&<><p>{t("productionCopy.aJobIsCreatedWhenAMeasurement")}</p><p className="fg-note">{t("productionCopy.pendingJobsRequireTheServerProcessingService")}</p><Link to="/app/audit" className="fg-link">{t("productionCopy.auditTrail")} <ArrowUpLeft size={15}/></Link></>}
        {tab==="privacy"&&<form onSubmit={submit(f=>["/privacy",{kind:s(f,"kind"),note:s(f,"note")}])}>
          <SelectField label={t("productionCopy.requestType")} name="kind" values={["access","rectification","erasure","objection","restriction"]}/>
          <Field label={t("productionCopy.requestDescription")}><textarea className={inputClass} name="note" required minLength={3} maxLength={3000}/></Field>
          <p className="fg-muted">{t("productionCopy.processingFollowsIdentityVerificationAndApplicableObligations")}</p><button className="fg-button" disabled={actionsDisabled}>{t("productionCopy.saveRequest")}</button><Link to="/privacy" className="fg-link">{t("productionCopy.privacyPolicy")}</Link></form>}
      </aside>
    </div>
  </div>;
}
