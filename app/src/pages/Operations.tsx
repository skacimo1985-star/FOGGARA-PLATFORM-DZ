import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { Activity, ArrowUpLeft, Check, Layers3, Plus, RefreshCw, ShieldCheck, Sprout } from "lucide-react";
import { api, type Paged } from "@/lib/api";
import { useAuth } from "@/context/useAuth";
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
const labels: Record<string, string> = {
  evaluations:"مصفوفة WEFEH", observations:"القياسات والمراجعة", lots:"دفعات الإنتاج",
  listings:"العرض والطلب", matches:"فرص المطابقة", policies:"قواعد التقييم", jobs:"التشغيل الذاتي", privacy:"حقوق البيانات",
  water:"المياه", energy:"الطاقة", food:"الغذاء", ecosystem:"النظام البيئي", health:"الصحة",
  production:"الإنتاج", processing:"التحويل", quality_review:"مراجعة الجودة", ready:"جاهز للتوزيع",
  dispatched:"تم الإرسال", closed:"مغلق", pending:"بانتظار المراجعة", approved:"معتمد", rejected:"مرفوض",
  completed:"مكتمل", failed:"فشل", active:"نشط", received:"مستلم", resolved:"تمت المعالجة",
  offer:"عرض", demand:"طلب", agriculture:"إنتاج نباتي", livestock:"إنتاج حيواني", aquaculture:"صيد وتربية مائية",
  logistics:"خدمات لوجستية", equipment:"معدات", services:"خدمات", suggested:"اقتراح",
  matching:"مطابقة العرض والطلب", wefeh:"تقييم WEFEH", access:"الوصول إلى البيانات", rectification:"التصحيح",
  erasure:"المحو", objection:"الاعتراض", restriction:"تقييد المعالجة",
};
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
  return <Field label={label}><select className={inputClass} name={name}>{values.map(v=><option key={v} value={v}>{labels[v] || v}</option>)}</select></Field>;
}
export default function Operations() {
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
      api.get<Paged<Project>>("/projects?page_size=500"),
      ...resources.map(r=>api.get<Paged<Item>>("/operations/"+r+"?page="+(r===tab?page:1)+"&page_size=20"))
    ]).then(([p,...result])=>{
      if(!alive)return;
      setProjects((p as Paged<Project>).items);
      setData(Object.fromEntries(resources.map((r,i)=>[r,result[i]])));
    }).catch((e:unknown)=>{if(alive)setError(e instanceof Error?e.message:"تعذر الاتصال");})
      .finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[tab,page,revision]);
  const run = useCallback(async (path:string,body?:unknown)=>{
    setBusy(true);setError("");setNotice("");
    try {
      await api.post("/operations"+path,body);
      setNotice("تم حفظ العملية في قاعدة البيانات.");
      setRevision(v=>v+1);
      setExpanded(null);
      return true;
    } catch(e) {setError(e instanceof Error?e.message:"تعذر حفظ العملية");return false;}
    finally {setBusy(false);}
  },[]);
  const submit = (fn:(f:FormData)=>[string,unknown])=>(e:FormEvent<HTMLFormElement>)=>{
    e.preventDefault();const form=e.currentTarget;const [path,body]=fn(new FormData(form));
    void run(path,body).then(ok=>{if(ok)form.reset();});
  };
  const s=(f:FormData,k:string)=>String(f.get(k)||"");
  const n=(f:FormData,k:string)=>Number(f.get(k));
  const ProjectField=()=> <Field label="المشروع"><select name="project_id" className={inputClass} required>
    <option value="">اختر مشروعًا</option>{projects.map(p=><option key={p.id} value={p.id}>{p.title}{p.is_demo?" · DEMO":""}</option>)}
  </select></Field>;
  const current=data[tab];
  const actionsDisabled=busy||loading;
  function Review({row,resource}:{row:Item;resource:"observations"|"evaluations"}) {
    if(!reviewer||row.status!=="pending"||row.submitted_by===user?.id)return null;
    return <form className="fg-inline-form" onSubmit={submit(f=>["/"+resource+"/"+row.id+"/review",{status:s(f,"status"),note:s(f,"note")}])}>
      <TextField name="note" label="مبرر المراجعة" minLength={3} maxLength={2000}/>
      <SelectField name="status" label="القرار" values={["approved","rejected"]}/>
      <button className="fg-button" disabled={actionsDisabled}>تسجيل المراجعة</button>
    </form>;
  }
  return <div className="fg-console" dir="rtl" lang="ar">
    <div className="fg-console-heading"><div><p className="fg-eyebrow">FOGGARA / OPERATIONS</p>
      <h1>من الموارد إلى القيمة.</h1><p>مساحة العمل الإنتاجية · بيانات مؤسستك وقرارات قابلة للتتبّع</p></div>
      <button className="fg-button fg-secondary" onClick={()=>setRevision(v=>v+1)} disabled={loading}><RefreshCw size={16}/>تحديث البيانات</button>
    </div>
    <div className="fg-metrics">
      {([["lots","دفعات الإنتاج",Sprout],["listings","العرض والطلب",Layers3],["evaluations","نتائج التقييم",ShieldCheck],["jobs","مهام التشغيل",Activity]] as const).map(([key,label,Icon])=>
        <button key={key} className="fg-metric" onClick={()=>{setTab(key);setPage(1);}}><Icon size={20}/><strong>{data[key]?.total??"—"}</strong><span>{label}</span></button>)}
    </div>
    <nav className="fg-tabs" aria-label="وحدات الإنتاج">{resources.map(r=><button key={r} aria-current={tab===r?"page":undefined}
      onClick={()=>{setTab(r);setPage(1);setExpanded(null);}}>{labels[r]}</button>)}</nav>
    {error&&<div role="alert" className="fg-alert">{error} <button onClick={()=>setRevision(v=>v+1)}>إعادة المحاولة</button></div>}
    {notice&&<p role="status" className="fg-success"><Check size={16}/>{notice}</p>}
    {!projects.length&&!loading&&<p className="fg-note">ابدأ بإضافة مشروع إلى مؤسستك. <Link to="/app/projects">فتح المشاريع ←</Link></p>}
    <div className="fg-workspace">
      <section className="fg-panel">
        <div className="fg-section-heading"><div><p className="fg-eyebrow">WORKSPACE / {tab.toUpperCase()}</p><h2>{labels[tab]}</h2></div><span className="fg-counter">{current?.total??0}</span></div>
        {loading?<p role="status" className="fg-empty">جارٍ تحميل السجلات…</p>:!current?.items.length?
          <div className="fg-empty"><Layers3 size={34}/><h3>مساحة جاهزة لبياناتك</h3><p>لا توجد سجلات بعد. أضف بيانات فعلية أو استخدم مشروعًا موسومًا DEMO للتجربة.</p></div>:
          <div className="fg-records">{current.items.map(row=><article className="fg-record" key={row.id}>
            <div className="fg-record-top"><div><span className="fg-record-id">#{row.id}</span><h3>{row.name||row.title||row.product||labels[row.domain||row.kind||""]||("المشروع #"+row.project_id)}</h3></div>
              <span className={"fg-status "+(row.status==="approved"||row.status==="completed"?"fg-status-good":"")}>{labels[row.status||row.stage||""]||(row.active?"قواعد مفعّلة":"مسودة")}</span></div>
            {tab==="evaluations"&&row.result&&<>
              <div className="fg-score"><strong>{row.result.score===null?"—":row.result.score}<small>/ 100</small></strong>
                <span>اكتمال البيانات {Math.round(row.result.coverage*100)}% · إصدار القواعد {row.result.policy_version}</span></div>
              <div className="fg-domain-bars">{domains.map(d=><div key={d}><span>{labels[d]}</span><meter min={0} max={100} value={row.result?.scores[d]??0} aria-label={labels[d]}/><b>{row.result?.scores[d]??"—"}</b></div>)}</div>
              {!!row.result.missing.length&&<p className="fg-note">بيانات معتمدة مطلوبة: {row.result.missing.map(d=>labels[d]).join("، ")}</p>}
              <p className="fg-muted">لقطة محفوظة بتاريخ {new Date(row.result.evaluated_at).toLocaleString("ar-DZ")} · اعتماد التقييم لا يشغّل معدات ميدانية.</p>
              <Review row={row} resource="evaluations"/>
            </>}
            {tab==="observations"&&<><p className="fg-value">{row.value} <small>{row.unit}</small></p><p className="fg-muted">{row.metric} · {row.source} · المشروع #{row.project_id}</p><Review row={row} resource="observations"/></>}
            {tab==="lots"&&<>
              <p>{row.code} · {row.quantity} {row.unit} · {labels[row.sector||""]}</p>
              <ol className="fg-stages">{stages.map((stage,i)=><li key={stage} className={i<=stages.indexOf(row.stage||"")?"done":""}>{labels[stage]}</li>)}</ol>
              {row.stage!=="closed"&&<form className="fg-inline-form" onSubmit={submit(f=>["/lots/"+row.id+"/transition",{stage:stages[stages.indexOf(row.stage||"")+1],note:s(f,"note")}])}>
                <TextField label="مرجع أو ملاحظة المرحلة" name="note" minLength={3} maxLength={2000}/>
                <button className="fg-button" disabled={actionsDisabled||(row.stage==="quality_review"&&!reviewer)}>نقل إلى {labels[stages[stages.indexOf(row.stage||"")+1]]}</button>
              </form>}
              <details><summary>سجل التتبّع</summary><ol>{row.trace?.map((t,i)=><li key={i}>{labels[t.stage]} · {t.note} · {new Date(t.at).toLocaleString("ar-DZ")} · #{t.user_id}</li>)}</ol></details>
            </>}
            {tab==="listings"&&<><p>{labels[row.kind||""]} · {row.quantity} {row.unit} · {row.wilaya}</p><p className="fg-muted">{row.product_code} · {labels[row.sector||""]}</p>
              {row.status==="active"&&<button className="fg-link" disabled={actionsDisabled} onClick={()=>void run("/listings/"+row.id+"/close")}>إغلاق السجل</button>}</>}
            {tab==="matches"&&<><p>العرض #{row.offer_id} ← الطلب #{row.demand_id}</p><p className="fg-value">{row.quantity} {row.unit} <small>كمية مقترحة · التوافق {row.score}/100</small></p>
              <p className="fg-muted">بديل للمراجعة داخل المؤسسة؛ لا يحجز مخزونًا ولا ينشئ عقدًا.</p></>}
            {tab==="policies"&&<><p>الإصدار {row.version} · قواعد خاصة بالمؤسسة</p>
              <button className="fg-link" onClick={()=>setExpanded(expanded===row.id?null:row.id)}>عرض الحدود والأوزان</button>
              {expanded===row.id&&<div className="fg-table-wrap"><table><thead><tr><th>المجال</th><th>المؤشر / الوحدة</th><th>النطاق</th><th>الوزن</th><th>صلاحية بالساعات</th></tr></thead>
                <tbody>{Object.entries(row.rules||{}).map(([d,r])=><tr key={d}><td>{labels[d]}</td><td>{r.metric} / {r.unit}</td><td>{r.lower} – {r.upper} ({r.direction})</td><td>{r.weight}</td><td>{r.max_age_hours}</td></tr>)}</tbody></table></div>}
              {canAdmin&&!row.active&&<button className="fg-button" disabled={actionsDisabled} onClick={()=>void run("/policies/"+row.id+"/activate")}>تفعيل هذا الإصدار</button>}</>}
            {tab==="jobs"&&<p className="fg-muted">المحاولات: {row.attempts} {row.error?" · "+row.error:""} · {row.project_id?"المشروع #"+row.project_id:"المؤسسة"}</p>}
            {tab==="privacy"&&<><p>{row.note}</p>{row.response&&<p className="fg-note">{row.response}</p>}{canAdmin&&row.status==="received"&&<form onSubmit={submit(f=>["/privacy/"+row.id+"/resolve",{response:s(f,"response")}])}>
              <TextField label="الرد بعد معالجة الطلب والتحقق من الهوية" name="response" minLength={10} maxLength={3000}/><button className="fg-button" disabled={actionsDisabled}>تسجيل الرد</button></form>}</>}
          </article>)}</div>}
        {(current?.pages??1)>1&&<div className="fg-pagination"><button disabled={page===1} onClick={()=>setPage(p=>p-1)}>السابق</button><span>{page} / {current?.pages}</span><button disabled={page===(current?.pages??1)} onClick={()=>setPage(p=>p+1)}>التالي</button></div>}
      </section>
      <aside className="fg-panel fg-compose">
        <div className="fg-section-heading"><h2>{tab==="jobs"?"كيف يعمل التشغيل؟":"إجراء جديد"}</h2><Plus size={18}/></div>
        {tab==="evaluations"&&<form onSubmit={submit(f=>["/projects/"+s(f,"project_id")+"/evaluate",undefined])}>
          <p className="fg-note">يجمع التقييم أحدث قياس معتمد لكل مجال وفق الوحدة والصلاحية المحددتين. لا تُحتسب نتيجة شاملة عند نقص البيانات.</p><ProjectField/>
          <button className="fg-button" disabled={actionsDisabled||!projects.length}><Activity size={16}/>تقييم الآن</button></form>}
        {tab==="observations"&&<form onSubmit={submit(f=>["/observations",{project_id:n(f,"project_id"),domain:s(f,"domain"),metric:s(f,"metric"),value:s(f,"value"),unit:s(f,"unit"),source:s(f,"source"),measured_at:new Date(s(f,"measured_at")).toISOString()}])}>
          <ProjectField/><SelectField label="المجال" name="domain" values={domains}/><TextField label="رمز المؤشر المطابق للقواعد" name="metric" minLength={2} maxLength={80}/><TextField label="القيمة" name="value" type="number" step="0.00001"/>
          <TextField label="الوحدة المطابقة للقواعد" name="unit" maxLength={30}/><TextField label="مرجع القياس / الدليل" name="source" minLength={3} maxLength={500}/>
          <TextField label="وقت القياس المحلي" name="measured_at" type="datetime-local"/><button className="fg-button" disabled={actionsDisabled||!projects.length}>إرسال للمراجعة</button></form>}
        {tab==="lots"&&<form onSubmit={submit(f=>["/lots",{project_id:n(f,"project_id"),code:s(f,"code"),product:s(f,"product"),sector:s(f,"sector"),quantity:s(f,"quantity"),unit:s(f,"unit")}])}>
          <ProjectField/><TextField label="رمز الدفعة الفريد" name="code" minLength={2} maxLength={80}/><TextField label="المنتج" name="product" minLength={2} maxLength={150}/>
          <SelectField label="القطاع" name="sector" values={["agriculture","livestock","aquaculture","processing","logistics","equipment","services"]}/>
          <TextField label="الكمية" name="quantity" type="number" min={0.0001} step="0.0001"/><SelectField label="الوحدة" name="unit" values={units}/>
          <button className="fg-button" disabled={actionsDisabled||!projects.length}>إضافة دفعة إنتاج</button></form>}
        {tab==="listings"&&<form onSubmit={submit(f=>["/listings",{kind:s(f,"kind"),sector:s(f,"sector"),title:s(f,"title"),product_code:s(f,"product_code"),quantity:s(f,"quantity"),unit:s(f,"unit"),wilaya:s(f,"wilaya")}])}>
          <SelectField label="نوع السجل" name="kind" values={["offer","demand"]}/><TextField label="العنوان" name="title" minLength={3} maxLength={200}/>
          <SelectField label="القطاع" name="sector" values={["agriculture","livestock","aquaculture","processing","logistics","equipment","services"]}/>
          <TextField label="رمز منتج موحّد (مثال: dates-deglet)" name="product_code" minLength={2} maxLength={80}/>
          <TextField label="الكمية" name="quantity" type="number" min={0.0001} step="0.0001"/><SelectField label="الوحدة" name="unit" values={units}/>
          <TextField label="رمز الولاية" name="wilaya" minLength={2} maxLength={80}/><button className="fg-button" disabled={actionsDisabled}>حفظ السجل</button></form>}
        {tab==="matches"&&<><p className="fg-note">المطابقة تعرض حتى 20 بديلًا لكل طلب، وتتطلب تطابق رمز المنتج والقطاع والوحدة. تعطى الأولوية لنفس الولاية. الاقتراحات بدائل وليست تخصيصًا نهائيًا للكميات.</p><button className="fg-button" disabled={actionsDisabled} onClick={()=>void run("/match")}>تحديث المطابقة</button></>}
        {tab==="policies"&&(canAdmin?<form onSubmit={submit(f=>["/policies",{name:s(f,"name"),rules}])}>
          <p className="fg-note">القيم التالية مثال تحريري وليست معايير علمية أو قانونية. عدّلها بناء على مؤشرات ومراجع مناسبة لمؤسستك. مجموع الأوزان يجب أن يساوي 1.</p>
          <TextField label="اسم الإصدار ومرجعه" name="name" minLength={3} maxLength={150}/>
          {domains.map(d=><fieldset key={d} className="fg-rule"><legend>{labels[d]}</legend>
            {(["metric","unit","lower","upper","weight","max_age_hours"] as const).map(k=><Field key={k} label={({metric:"رمز المؤشر",unit:"الوحدة",lower:"الحد الأدنى",upper:"الحد الأعلى",weight:"الوزن",max_age_hours:"الصلاحية / ساعة"})[k]}>
              <input className={inputClass} required type={k==="unit"||k==="metric"?"text":"number"} step={k==="max_age_hours"?"1":"any"} value={rules[d][k]}
                onChange={e=>setRules(prev=>({...prev,[d]:{...prev[d],[k]:k==="unit"||k==="metric"?e.target.value:Number(e.target.value)}}))}/></Field>)}
            <Field label="اتجاه الأداء الأفضل"><select className={inputClass} value={rules[d].direction} onChange={e=>setRules(prev=>({...prev,[d]:{...prev[d],direction:e.target.value}}))}><option value="higher">الأعلى أفضل</option><option value="lower">الأقل أفضل</option></select></Field>
          </fieldset>)}
          <label className="fg-checkbox"><input type="checkbox" checked={policyChecked} onChange={e=>setPolicyChecked(e.target.checked)}/>راجعت ملاءمة الحدود والأوزان للمؤشرات المختارة.</label>
          <button className="fg-button" disabled={actionsDisabled||!policyChecked}>حفظ إصدار مستقل</button></form>:<p>تُدار قواعد المؤسسة بواسطة المسؤول.</p>)}
        {tab==="jobs"&&<><p>تضاف مهمة عند اعتماد قياس أو إضافة عرض أو طلب، وتُحفظ حالتها في قاعدة البيانات.</p><p className="fg-note">تحتاج المهام المعلّقة إلى تشغيل خدمة المعالجة على الخادم. يمكنك تنفيذ التقييم والمطابقة يدويًا من الواجهة أيضًا.</p><Link to="/app/audit" className="fg-link">سجل التدقيق <ArrowUpLeft size={15}/></Link></>}
        {tab==="privacy"&&<form onSubmit={submit(f=>["/privacy",{kind:s(f,"kind"),note:s(f,"note")}])}>
          <SelectField label="نوع الطلب" name="kind" values={["access","rectification","erasure","objection","restriction"]}/>
          <Field label="وصف الطلب"><textarea className={inputClass} name="note" required minLength={3} maxLength={3000}/></Field>
          <p className="fg-muted">تتم المعالجة بعد التحقق من الهوية والالتزامات ذات الصلة. تسجيل الطلب لا يعني حذف البيانات تلقائيًا.</p><button className="fg-button" disabled={actionsDisabled}>تسجيل الطلب</button><Link to="/privacy" className="fg-link">سياسة الخصوصية</Link></form>}
      </aside>
    </div>
  </div>;
}
