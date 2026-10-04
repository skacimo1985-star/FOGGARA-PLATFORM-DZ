import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import { ErrorText } from '@/components/common';
import './operations.css';
interface Section{heading:string;body:string;}
export default function Legal(){const {pathname}=useLocation();const {t,i18n}=useTranslation();const page=pathname.slice(1);const [busy,setBusy]=useState(false);const [reference,setReference]=useState('');const [error,setError]=useState<unknown>(null);
async function contact(e:FormEvent<HTMLFormElement>){e.preventDefault();const form=e.currentTarget;const f=new FormData(form);setBusy(true);setError(null);setReference('');try{const result=await api.post<{reference:string}>('/operations/contact',{name:f.get('name'),email:f.get('email'),subject:f.get('subject'),message:f.get('message'),consent:f.get('consent')==='on',website:f.get('website')||''});setReference(result.reference);form.reset();}catch(err){setError(err);}finally{setBusy(false);}}
const sections=page==='contact'?[]:t(`legal.pages.${page}`,{returnObjects:true}) as Section[];
return <article className="fg-public fg-legal" dir={i18n.language==='ar'?'rtl':'ltr'} lang={i18n.language}><Link to="/" className="fg-link">{t('legal.back')}</Link><p className="fg-eyebrow">FOGGARA / SIREP OASES NEXUS WEFEH-DZ</p><h1>{t(`legal.titles.${page}`)}</h1><p className="text-xs text-muted-foreground">{t('legal.version')}</p>
{Array.isArray(sections)&&sections.map(s=><section key={s.heading}><h2>{s.heading}</h2><p>{s.body}</p></section>)}
{page==='privacy'&&<Link to="/app/operations" className="fg-link">{t('legal.rightsWorkspace')}</Link>}
{page==='contact'&&<><p>{t('legal.contactIntro')}</p><div className="fg-contact-grid"><section><h2>EURL SIREP OASES NEXUS WEFEH-DZ</h2><p>Laghouat · Algérie</p><p><a href="mailto:kacimo2000@gmail.com">kacimo2000@gmail.com</a></p></section><form className="fg-panel" onSubmit={e=>void contact(e)}>
{['name','email','subject'].map(k=><label key={k} className="fg-field"><span>{t(`legal.${k}`)}</span><input className="fg-input" name={k} type={k==='email'?'email':'text'} required minLength={k==='name'?2:3} maxLength={k==='name'?120:k==='email'?254:180}/></label>)}
<label className="fg-field"><span>{t('legal.message')}</span><textarea className="fg-input" name="message" required minLength={10} maxLength={5000}/></label><div hidden aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off"/></label></div><label className="fg-checkbox"><input name="consent" type="checkbox" required/><span>{t('legal.consent')} <Link to="/privacy">{t('legal.titles.privacy')}</Link></span></label><ErrorText error={error}/>{reference&&<p role="status">{t('legal.saved')} <strong dir="ltr">{reference}</strong></p>}<button className="fg-button" disabled={busy}>{busy?t('common.loading'):t('legal.send')}</button></form></div></>}
<nav className="flex flex-wrap gap-4 mt-8 border-t pt-5" aria-label={t('reference.title')}>{['privacy','terms','rights','contact'].filter(k=>k!==page).map(k=><Link key={k} to={'/'+k}>{t(`legal.titles.${k}`)}</Link>)}<Link to="/references">{t('reference.title')}</Link></nav></article>;}
