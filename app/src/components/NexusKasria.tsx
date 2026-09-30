import { useTranslation } from 'react-i18next';
import {Network} from 'lucide-react';
import {NEXUS_DOMAINS} from '@/lib/nexus-domains';
export function NexusKasria({active='all',onSelect}:{active?:string;onSelect?:(key:string)=>void}) {
  const {t}=useTranslation();
  return <div className="kasria-network">
    <svg className="kasria-streams" viewBox="0 0 500 420" aria-hidden="true">
      <defs><radialGradient id="kasria-glow"><stop stopColor="#bfded3" stopOpacity=".6"/><stop offset="1" stopColor="#bfded3" stopOpacity="0"/></radialGradient></defs>
      <circle cx="250" cy="204" r="150" fill="url(#kasria-glow)"/><ellipse cx="250" cy="205" rx="178" ry="140" fill="none" stroke="#d5dfd8" strokeDasharray="3 8"/>
      {NEXUS_DOMAINS.map(d=><g key={d.key}><path d={`M250 204 Q${d.x*5} 204 ${d.x*5} ${d.y*4.2}`} fill="none" stroke={d.color} strokeWidth={active===d.key?4:2} opacity={active==='all'||active===d.key?.7:.2}/><path className="kasria-flow" d={`M250 204 Q${d.x*5} 204 ${d.x*5} ${d.y*4.2}`} fill="none" stroke={d.color} strokeWidth="3" strokeDasharray="4 34" opacity={active==='all'||active===d.key?.8:.15}/></g>)}
      <ellipse cx="250" cy="215" rx="70" ry="33" fill="#d8cab2"/><ellipse cx="250" cy="202" rx="70" ry="33" fill="#eee6d5" stroke="#c4b99c"/><ellipse cx="250" cy="200" rx="56" ry="25" fill="#238c81"/><ellipse cx="250" cy="200" rx="38" ry="16" fill="#68b5a3" opacity=".6"/>
    </svg>
    <div className="kasria-core"><Network size={17}/><strong>{t('os.kasria')}</strong><span>{t('os.kasriaSub')}</span></div>
    {NEXUS_DOMAINS.map(({key,icon:Icon,color,x,y})=><button type="button" key={key} className={`kasria-node ${active===key?'selected':''}`} style={{left:`${x}%`,top:`${y}%`,borderColor:active===key?color:undefined}} onClick={()=>onSelect?.(active===key?'all':key)} aria-pressed={active===key}><Icon size={19} style={{color}}/><span>{t(`landing.${key}`)}</span></button>)}
    <span className="kasria-index" dir="ltr">WEFEH / NEXUS CORE</span>
  </div>;
}
