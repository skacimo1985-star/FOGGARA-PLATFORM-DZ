import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { MapPin, Droplets, Wrench, Pencil, Save, X } from 'lucide-react';
import { api, type Paged } from '@/lib/api';
import type { Site, WaterResource, Asset } from '@/types';
import { WILAYAS } from '@/lib/wilayas';
import { ErrorText } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

type Tab = 'sites'|'resources'|'assets';
type Row = Site|WaterResource|Asset;
const types = {resources:['foggara','borehole','spring','well','dam'],assets:['gallery','mother_well','pump','channel','sensor']};
const states = {resources:['active','degraded','dry','abandoned'],assets:['operational','maintenance','out_of_service']};
export default function Registry(){
 const {t,i18n}=useTranslation(); const lang=(i18n.language||'ar') as 'ar'|'fr'|'en';
 const [tab,setTab]=useState<Tab>('sites'); const [editing,setEditing]=useState<Row|null>(null);
 const [data,setData]=useState<{sites:Site[];resources:WaterResource[];assets:Asset[]}>({sites:[],resources:[],assets:[]});
 const [totals,setTotals]=useState({sites:0,resources:0,assets:0}); const [error,setError]=useState<unknown>(null);const [busy,setBusy]=useState(false);const [status,setStatus]=useState(''); const [search,setSearch]=useState('');const [parent,setParent]=useState('');
 const reload=useCallback(async()=>{const [s,r,a]=await Promise.all([api.get<Paged<Site>>('/sites?page_size=500'),api.get<Paged<WaterResource>>('/resources?page_size=500'),api.get<Paged<Asset>>('/assets?page_size=500')]);setData({sites:s.items,resources:r.items,assets:a.items});setTotals({sites:s.total,resources:r.total,assets:a.total});},[]);
 useEffect(()=>{reload().catch(setError);},[reload]);
 function switchTab(next:Tab){setTab(next);setEditing(null);setParent('');setStatus('');}
 async function save(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget;const f=new FormData(form);setBusy(true);setError(null);setStatus('');
 const body:Record<string,unknown>={name:f.get('name')};
 if(tab==='sites'){body.wilaya=f.get('wilaya');body.commune=f.get('commune')||null;body.lat=f.get('lat')===''?null:Number(f.get('lat'));body.lon=f.get('lon')===''?null:Number(f.get('lon'));}
 else if(tab==='resources'){body.site_id=editing?('site_id' in editing?editing.site_id:0):Number(parent);body.type=f.get('type');body.status=f.get('status');}
 else {body.resource_id=editing?('resource_id' in editing?editing.resource_id:0):Number(parent);body.kind=f.get('kind');body.status=f.get('status');}
 try{if(editing)await api.patch(`/${tab}/${editing.id}`,body);else await api.post(`/${tab}`,body);form.reset();setEditing(null);setParent('');await reload();setStatus(t('registry.saved'));}catch(err){setError(err);}finally{setBusy(false);}}
 const rows:Row[]=data[tab];const filtered=rows.filter(r=>r.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 const selectClass='w-full rounded-md border bg-background px-3 py-2 text-sm';
 const value=(key:string)=>t(`registry.values.${key}`,key);
 return <div className="space-y-6"><div><p className="text-xs text-oasis-strong">FOGGARA / DATA REGISTRY</p><h1 className="t-section">{t('registry.title')}</h1><p className="mt-2 text-sm text-muted-foreground">{t('registry.subtitle')}</p></div>
 <div className="grid gap-3 sm:grid-cols-3">{(['sites','resources','assets'] as Tab[]).map((k,i)=>{const Icon=[MapPin,Droplets,Wrench][i];return <button key={k} className={`rounded-xl border p-4 text-start ${tab===k?'border-oasis bg-oasis/10':''}`} onClick={()=>switchTab(k)} aria-pressed={tab===k}><Icon size={20}/><p>{t(`registry.${k}`)}</p><strong className="text-2xl">{totals[k]}</strong></button>;})}</div>
 <div className="flex flex-wrap gap-3 text-sm"><Link className="underline" to="/app/projects">{t('nav.projects')}</Link><Link className="underline" to="/app/resources">{t('nexus.title')}</Link><Link className="underline" to="/app/gis">{t('nav.gis')}</Link><Link className="underline" to="/references">{t('reference.title')}</Link></div><ErrorText error={error}/><p role="status" className="text-sm text-oasis-strong">{status}</p>
 <Card><CardHeader><CardTitle>{t(editing?'registry.edit':'registry.create')} — {t(`registry.${tab}`)}</CardTitle></CardHeader><CardContent>
 <form key={`${tab}:${editing?.id||'new'}`} onSubmit={e=>void save(e)} className="grid gap-4 sm:grid-cols-2">
 <div className="space-y-1"><Label htmlFor="registry-name">{t('registry.name')}</Label><Input id="registry-name" name="name" defaultValue={editing?.name} required maxLength={255}/></div>
 {tab==='sites'?<><div className="space-y-1"><Label htmlFor="registry-wilaya">{t('registry.wilaya')}</Label><select className={selectClass} id="registry-wilaya" name="wilaya" defaultValue={editing&&'wilaya' in editing?editing.wilaya:''} required><option value="">{t('registry.choose')}</option>{WILAYAS.map(w=><option key={w.code} value={w.code}>{w.code} — {w[lang]}</option>)}</select></div><div className="space-y-1"><Label htmlFor="registry-commune">{t('registry.commune')}</Label><Input id="registry-commune" name="commune" defaultValue={editing&&'commune' in editing?editing.commune||'':''} maxLength={100}/></div>
 {['lat','lon'].map(k=><div className="space-y-1" key={k}><Label htmlFor={`registry-${k}`}>{t(`registry.${k}`)} (WGS84)</Label><Input id={`registry-${k}`} name={k} type="number" step="any" min={k==='lat'?-90:-180} max={k==='lat'?90:180} defaultValue={editing&&k in editing?(editing as unknown as Record<string,number|null>)[k]??'':''}/></div>)}<p className="text-xs text-muted-foreground sm:col-span-2">{t('registry.coordinatesNotice')}</p></>:<>
 <div className="space-y-1"><Label htmlFor="registry-parent">{t(tab==='resources'?'registry.site':'registry.resource')}</Label><select id="registry-parent" className={selectClass} value={editing?(tab==='resources'&&'site_id' in editing?String(editing.site_id):'resource_id' in editing?String(editing.resource_id):''):parent} onChange={e=>setParent(e.target.value)} disabled={!!editing} required><option value="">{t('registry.choose')}</option>{(tab==='resources'?data.sites:data.resources).map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
 <div className="space-y-1"><Label htmlFor="registry-type">{t('registry.type')}</Label><select id="registry-type" name={tab==='resources'?'type':'kind'} className={selectClass} defaultValue={editing?('type' in editing?editing.type:'kind' in editing?editing.kind:''):undefined}>{types[tab].map(k=><option key={k} value={k}>{value(k)}</option>)}</select></div>
 <div className="space-y-1"><Label htmlFor="registry-state">{t('registry.status')}</Label><select id="registry-state" name="status" className={selectClass} defaultValue={editing&&'status' in editing?editing.status:undefined}>{states[tab].map(k=><option key={k} value={k}>{value(k)}</option>)}</select></div>
 {!editing&&!(tab==='resources'?data.sites:data.resources).length&&<p className="text-sm sm:col-span-2">{t('registry.parentFirst')} <button type="button" className="underline" onClick={()=>switchTab(tab==='resources'?'sites':'resources')}>{t(tab==='resources'?'registry.sites':'registry.resources')}</button></p>}
 </>}
 <div className="flex gap-2 sm:col-span-2"><Button disabled={busy||(tab!=='sites'&&!editing&&!parent)}><Save size={16}/>{t('registry.save')}</Button>{editing&&<Button type="button" variant="outline" onClick={()=>{setEditing(null);setParent('');}}><X size={16}/>{t('registry.cancel')}</Button>}</div></form>
 </CardContent></Card>
 <section className="space-y-3"><Input aria-label={t('registry.search')} placeholder={t('registry.search')} value={search} onChange={e=>setSearch(e.target.value)}/>{totals[tab]>rows.length&&<p className="text-xs">{t('registry.limit',{count:rows.length,total:totals[tab]})}</p>}
 {!filtered.length&&<p className="rounded-xl border border-dashed p-5 text-muted-foreground">{t('registry.empty')}</p>}
 {filtered.map(row=><article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><h3 className="font-semibold">{row.name}</h3><p className="text-sm text-muted-foreground">#{row.id} {'wilaya' in row?(WILAYAS.find(w=>w.code===row.wilaya)?.[lang]||row.wilaya):'status' in row?value(row.status):''}{'lat' in row&&row.lat!=null&&row.lon!=null?` · ${row.lat}, ${row.lon}`:''}</p></div><Button variant="outline" onClick={()=>{setEditing(row);setStatus('');}}><Pencil size={15}/>{t('registry.edit')}</Button></article>)}</section>
 </div>;
}
