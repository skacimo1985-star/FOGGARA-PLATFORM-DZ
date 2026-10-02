import {useEffect,useState,type FormEvent} from "react";
import {useNavigate} from "react-router";
import {api,type Paged} from "@/lib/api";
import {useAuth} from "@/context/useAuth";
import type {User} from "@/types";
import "./operations.css";
type Ticket={id:number;reference:string;name:string;email:string;subject:string;message:string;created_at:string};
export default function Account(){
  const {user,logout}=useAuth();const navigate=useNavigate();
  const [team,setTeam]=useState<User[]>([]);const [tickets,setTickets]=useState<Ticket[]>([]);
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");
  const [revision,setRevision]=useState(0);const [inbox,setInbox]=useState(false);
  const [page,setPage]=useState(1);const [pages,setPages]=useState(1);
  useEffect(()=>{
    if(user?.role!=="admin")return;
    let alive=true;setError("");
    (inbox?api.get<Paged<Ticket>>("/operations/contacts?page="+page):api.get<Paged<User>>("/operations/team?page="+page))
      .then(result=>{if(alive){if(inbox)setTickets(result.items as Ticket[]);else setTeam(result.items as User[]);setPages(result.pages);}})
      .catch((e:unknown)=>{if(alive)setError(e instanceof Error?e.message:"تعذر التحميل");});
    return()=>{alive=false;};
  },[user?.role,revision,inbox,page]);
  async function submit(e:FormEvent<HTMLFormElement>,kind:"team"|"password"){
    e.preventDefault();const form=e.currentTarget;const f=new FormData(form);
    setBusy(true);setError("");setNotice("");
    try{
      const body=kind==="team"?{email:f.get("email"),full_name:f.get("full_name"),password:f.get("password"),role:f.get("role")}:
        {current_password:f.get("current_password"),new_password:f.get("new_password")};
      await api.post("/operations/"+kind,body);
      if(kind==="password"){logout();navigate("/login");return;}
      form.reset();setNotice("تم إنشاء الحساب. تُسلّم بيانات الدخول عبر قناة آمنة؛ لم يُرسل بريد تلقائي.");setRevision(v=>v+1);
    }catch(e){setError(e instanceof Error?e.message:"تعذر الحفظ");}
    finally{setBusy(false);}
  }
  const field=(name:string,label:string,type="text",min=2)=><label className="fg-field"><span>{label}</span><input className="fg-input" name={name} type={type} required minLength={min} maxLength={type==="password"?128:150} autoComplete={type==="password"?"new-password":undefined}/></label>;
  return <div className="fg-console" dir="rtl" lang="ar">
    <div className="fg-console-heading"><div><p className="fg-eyebrow">FOGGARA / ACCOUNT</p><h1>الفريق والحساب</h1><p>{user?.full_name} · {user?.email}</p></div></div>
    {error&&<p className="fg-alert" role="alert">{error}</p>}{notice&&<p className="fg-success" role="status">{notice}</p>}
    <div className="fg-workspace"><section className="fg-panel">
      {user?.role==="admin"?<>
        <nav className="fg-tabs"><button aria-current={!inbox?"page":undefined} onClick={()=>{setInbox(false);setPage(1);}}>أعضاء المؤسسة</button><button aria-current={inbox?"page":undefined} onClick={()=>{setInbox(true);setPage(1);}}>رسائل المنصة</button></nav>
        {inbox?<><p className="fg-note">متاح فقط لمسؤول المؤسسة المعيّنة لاستقبال رسائل المنصة.</p>{tickets.map(t=><article className="fg-record" key={t.id}><p className="fg-record-id">{t.reference} · {new Date(t.created_at).toLocaleString("ar-DZ")}</p><h3>{t.subject}</h3><p>{t.message}</p><a className="fg-link" href={"mailto:"+t.email}>{t.name} · {t.email}</a></article>)}</>:
          team.map(m=><article className="fg-record" key={m.id}><h3>{m.full_name}</h3><p>{m.email} · {({admin:"مسؤول",reviewer:"مراجع",member:"عضو"})[m.role]}</p></article>)}
        {pages>1&&<div className="fg-pagination"><button disabled={page===1} onClick={()=>setPage(v=>v-1)}>السابق</button><span>{page} / {pages}</span><button disabled={page===pages} onClick={()=>setPage(v=>v+1)}>التالي</button></div>}
      </>:<p className="fg-note">يتولى مسؤول المؤسسة إنشاء الحسابات وتعيين المراجعين.</p>}
    </section><aside className="fg-panel">
      {user?.role==="admin"&&<form onSubmit={e=>void submit(e,"team")}><h2 className="fg-section-title" style={{fontSize:21,marginBottom:20}}>إضافة عضو</h2>
        {field("full_name","الاسم الكامل")}{field("email","البريد الإلكتروني","email",5)}{field("password","كلمة مرور أولية","password",12)}
        <label className="fg-field"><span>الدور</span><select className="fg-input" name="role"><option value="member">عضو</option><option value="reviewer">مراجع</option><option value="admin">مسؤول</option></select></label>
        <button className="fg-button" disabled={busy}>إنشاء الحساب</button><p className="fg-muted">حساب داخل مؤسستك. على المستخدم تغيير كلمة المرور الأولية بعد استلامها.</p></form>}
      <form onSubmit={e=>void submit(e,"password")}><h2 style={{fontSize:21,margin:"25px 0 20px",fontWeight:700}}>تغيير كلمة المرور</h2>
        {field("current_password","كلمة المرور الحالية","password",1)}{field("new_password","كلمة المرور الجديدة","password",12)}
        <p className="fg-note">يُبطل التغيير جميع رموز الدخول السابقة، ويعيدك إلى صفحة الدخول.</p><button className="fg-button" disabled={busy}>تحديث كلمة المرور</button></form>
    </aside></div>
  </div>;
}
