import {useEffect,useRef,useState,type ReactNode} from 'react';
import {Link,NavLink,useLocation,useNavigate} from 'react-router';
import {useTranslation} from 'react-i18next';
import {Globe,LogOut,Workflow,Compass,FolderKanban,Wrench,Gauge,BarChart3,Map,Radio,Building2,ClipboardCheck,ScrollText,Gavel,Activity,FlaskConical,Menu,X,Network,ShieldCheck,Layers,SlidersHorizontal,Droplets,Sprout,MessageSquareText,ChartNoAxesCombined, type LucideIcon} from 'lucide-react';
import {useAuth} from '@/context/useAuth';
import {setLocale,type Locale} from '@/lib/i18n';
import {WILAYAS} from '@/lib/wilayas';
import {ThemeControl} from '@/components/ThemeControl';
import {WorkspaceSearch} from '@/components/WorkspaceSearch';

function AlgeriaClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const fmt = new Intl.DateTimeFormat("fr-DZ", {
    timeZone: "Africa/Algiers", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  return <span className="tabular-nums">{fmt.format(now)}</span>;
}

type Item={to:string;key:string;icon:LucideIcon;end?:boolean};
type NavGroup={label:{ar:string;fr:string;en:string};items:Item[]};

const primaryGroups:NavGroup[]=[
 {label:{ar:'ابدأ العمل',fr:'Commencer',en:'Start'},items:[
   {to:'/app',key:'os.workspace',icon:Network,end:true},
   {to:'/app/gis',key:'nav.gis',icon:Map},
   {to:'/app/analysis',key:'nav.analytics',icon:ChartNoAxesCombined},
   {to:'/app/projects',key:'nav.projects',icon:FolderKanban},
   {to:'/app/resources',key:'nexus.title',icon:Layers},
 ]},
 {label:{ar:'الخدمات الميدانية',fr:'Opérations terrain',en:'Field operations'},items:[
   {to:'/app/agriculture',key:'nav.agriculture',icon:Sprout},
   {to:'/app/water',key:'nav.water',icon:Droplets},
   {to:'/app/iot',key:'nav.iot',icon:Radio},
   {to:'/app/metrology',key:'nav.metrology',icon:Gauge},
   {to:'/app/services',key:'nav.services',icon:Wrench},
 ]},
 {label:{ar:'القرار والمتابعة',fr:'Décision & suivi',en:'Decision & follow-up'},items:[
   {to:'/app/studio',key:'os.studio',icon:SlidersHorizontal},
   {to:'/app/decisions',key:'nav.decisions',icon:Gavel},
   {to:'/app/automation',key:'automation.title',icon:Workflow},
 ]},
];

const advancedGroup:NavGroup={label:{ar:'أدوات متقدمة',fr:'Outils avancés',en:'Advanced tools'},items:[
 {to:'/app/nexus',key:'nav.nexus',icon:Network},
 {to:'/app/explore',key:'nav.explore',icon:Compass},
 {to:'/app/operations',key:'nav.operations',icon:Activity},
 {to:'/app/analytics',key:'nav.analytics',icon:BarChart3},
 {to:'/app/simulator',key:'nav.simulator',icon:FlaskConical},
 {to:'/app/telemetry',key:'nav.telemetry',icon:Activity},
 {to:'/app/opportunities',key:'opportunities.title',icon:Compass},
 {to:'/app/vde',key:'nav.vde',icon:ShieldCheck},
 {to:'/app/account',key:'nav.account',icon:Building2},
 {to:'/app/org',key:'nav.org',icon:Building2},
 {to:'/app/audit',key:'nav.audit',icon:ScrollText},
]};

const allGroups=[...primaryGroups,advancedGroup];
function Brand(){return <Link to="/" className="os-brand"><img className="os-brand-symbol" src="/sirep-brand.svg" alt="SIREP OASES NEXUS WEFEH DZ"/><span><strong dir="ltr">FOGGARA<span className="os-brand-dz"> / DZ</span></strong><small dir="ltr">SIREP · NEXUS WEFEH</small></span></Link>;}
export function Layout({children}:{children:ReactNode}){const {t,i18n}=useTranslation();const {user,logout}=useAuth();const location=useLocation();const navigate=useNavigate();const [open,setOpen]=useState(false);const [wilaya,setWilaya]=useState(()=>localStorage.getItem('wilaya')||'');const locale=(i18n.language||'ar') as Locale;const mainRef=useRef<HTMLElement>(null);const workspace=!!user&&location.pathname.startsWith('/app');const active=allGroups.flatMap(g=>g.items).filter(item=>item.end?location.pathname===item.to:location.pathname.startsWith(item.to)).sort((a,b)=>b.to.length-a.to.length)[0];
 useEffect(()=>{window.scrollTo(0,0);mainRef.current?.focus({preventScroll:true});},[location.pathname]);
 const navLabel=(group:NavGroup)=>group.label[locale]??group.label.ar;
 const renderItems=(items:Item[])=>items.map(({to,key,icon:Icon,end})=><NavLink key={to} to={to} end={end} className={({isActive})=>`os-nav-item ${isActive?'active':''}`} onClick={()=>setOpen(false)}><Icon size={17}/><span>{t(key)}</span></NavLink>);
 const advancedActive=advancedGroup.items.some(item=>item.end?location.pathname===item.to:location.pathname.startsWith(item.to));
 const navigation=<nav aria-label={t('nav.mainNavigation')}>
   {primaryGroups.map(group=><div className="os-nav-group" key={group.label.en}><p>{navLabel(group)}</p>{renderItems(group.items)}</div>)}
   <details className="os-nav-group os-nav-advanced" open={advancedActive}>
     <summary>{navLabel(advancedGroup)}</summary>
     <div>{renderItems(advancedGroup.items)}</div>
   </details>
   {user&&(user.role==='admin'||user.role==='reviewer')&&<div className="os-nav-group"><p>{locale==='fr'?'Assurance':locale==='en'?'Assurance':'المراجعة والضمان'}</p><NavLink className="os-nav-item" to="/app/review" onClick={()=>setOpen(false)}><ClipboardCheck size={17}/>{t('nav.review')}</NavLink><NavLink className="os-nav-item" to="/app/expo-feedback" onClick={()=>setOpen(false)}><MessageSquareText size={17}/>{locale==='fr'?'Avis Expo':locale==='en'?'Expo feedback':'آراء المعرض'}</NavLink></div>}
 </nav>;
 return <div className={workspace?'os-shell':'os-public-shell'}><a href="#main-content" className="os-skip-link">{t('navigation.skip')}</a>{workspace&&<aside className="os-sidebar"><Brand/>{navigation}<div className="os-sidebar-footer"><span className="os-avatar">{user.full_name.slice(0,1)}</span><div><strong>{user.full_name}</strong><small>{user.email}</small></div></div></aside>}<div className="os-main-column"><header className="os-header">{workspace?<><button type="button" className="os-menu-toggle" aria-label={t(open?'common.closeMenu':'common.openMenu')} aria-expanded={open} aria-controls="os-mobile-navigation" onClick={()=>setOpen(!open)}>{open?<X size={22}/>:<Menu size={22}/>}</button><div className="os-breadcrumb"><span dir="ltr">FOGGARA</span><span>/</span><strong>{t(active?.key??'os.workspace')}</strong></div></>:<Brand/>}<div className="os-header-controls">{workspace&&<WorkspaceSearch key={location.pathname} destinations={allGroups.flatMap(group=>group.items)}/>}<ThemeControl/><label className="os-language-control"><Globe size={15}/><select aria-label="Language" value={locale} onChange={e=>setLocale(e.target.value as Locale)}><option value="ar">العربية</option><option value="fr">Français</option><option value="en">English</option></select></label>{workspace?<button className="os-icon-button" aria-label={t('nav.logout')} onClick={()=>{logout();navigate('/');}}><LogOut size={17}/></button>:<Link className="os-header-login" to={user?'/app':'/login'}>{t('os.open')}</Link>}</div></header>{workspace&&<div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-xs text-muted-foreground"><select className="max-w-48 rounded border border-border bg-background px-2 py-1" aria-label={t('topbar.selectWilaya')} value={location.pathname==='/app/gis'?(new URLSearchParams(location.search).get('wilaya')||''):wilaya} onChange={e=>{setWilaya(e.target.value);localStorage.setItem('wilaya',e.target.value);navigate('/app/gis'+(e.target.value?'?wilaya='+encodeURIComponent(e.target.value):''));}}><option value="">{t('topbar.selectWilaya')}</option>{WILAYAS.map(w=><option key={w.code} value={w.code}>{w.code} — {w[locale]}</option>)}</select><span title={t('topbar.algiersTime')}><AlgeriaClock/></span><span>{t('topbar.weatherUnavailable')}</span></div>}{workspace&&open&&<div id="os-mobile-navigation" className="os-mobile-nav">{navigation}</div>}<main ref={mainRef} id="main-content" tabIndex={-1} className={workspace?'os-main-content':'os-public-content'}>{children}</main></div></div>;
}
