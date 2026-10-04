import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Pause, Play, RotateCcw } from 'lucide-react';
import { NEXUS_DOMAINS } from '@/lib/nexus-domains';
import './wefeh-network.css';

const positions = [[19,34],[81,34],[81,72],[50,84],[19,72]];
export function NexusKasria({active:controlled,onSelect,counts}:{active?:string;onSelect?:(key:string)=>void;counts?:Record<string,number>}){
  const {t}=useTranslation();
  const [localActive,setLocalActive]=useState('all');
  const active=controlled??localActive;
  const select=onSelect??setLocalActive;
  const [playing,setPlaying]=useState(true);
  return <figure className={`wefeh-network ${playing?'is-playing':''}`} aria-label={t('automation.networkTitle')}>
    <div className="wefeh-network-heading"><span dir="ltr">FOGGARA / NEXUS</span><strong>{t('automation.networkTitle')}</strong></div>
    <div className="wefeh-stage">
      <svg className="wefeh-links" viewBox="0 0 100 100" aria-hidden="true">
        <path className="wefeh-source-link" d="M50 16 V50"/>
        {positions.map(([x,y],i)=><path key={i} className={`wefeh-link ${active==='all'||active===NEXUS_DOMAINS[i].key?'is-active':''}`} d={`M50 50 Q${x} 50 ${x} ${y}`} style={{stroke:NEXUS_DOMAINS[i].color}}/>)}
        <path className="wefeh-ring" d="M19 34 Q50 8 81 34 Q100 51 81 72 Q67 94 50 89 Q33 94 19 72 Q0 51 19 34"/>
      </svg>
      <div className="wefeh-source"><Database size={14}/><span>{t('automation.source')}</span></div>
      <div className="wefeh-core"><img src="/sirep-brand.svg" alt="SIREP OASES NEXUS WEFEH DZ"/><strong dir="ltr">FOGGARA</strong><small>{t('automation.core')}</small></div>
      {NEXUS_DOMAINS.map(({key,icon:Icon,color},i)=><button type="button" key={key} className={`wefeh-node ${active===key?'selected':''}`} style={{left:`${positions[i][0]}%`,top:`${positions[i][1]}%`,'--domain-color':color} as CSSProperties} onClick={()=>select(active===key?'all':key)} aria-pressed={active===key}>
        <span className="wefeh-node-icon"><Icon size={22}/></span><span>{t(`landing.${key}`)}</span>{counts&&<small>{counts[key]??0} · {t('automation.reviewedProjects')}</small>}
      </button>)}
    </div>
    <figcaption className="wefeh-caption"><p>{counts?t('automation.networkDataNotice'):t('automation.networkNotice')}</p><div><button type="button" onClick={()=>setPlaying(!playing)} aria-label={t(playing?'cinematic.pause':'cinematic.play')}>{playing?<Pause size={14}/>:<Play size={14}/>}<span>{t(playing?'cinematic.pause':'cinematic.play')}</span></button><button type="button" onClick={()=>select('all')}><RotateCcw size={14}/>{t('os.all')}</button></div></figcaption>
  </figure>;
}
