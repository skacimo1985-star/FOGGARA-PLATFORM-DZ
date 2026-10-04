import {useCallback,useEffect,useRef,useState} from 'react';
import {useTranslation} from 'react-i18next';
import {Pause,Play,RotateCcw} from 'lucide-react';
import {NEXUS_DOMAINS} from '@/lib/nexus-domains';
import './cinematic.css';
type Scene={active:string;playing:boolean;speed:number};
type Point={x:number;y:number};
const core={x:250,y:203};
function point(end:Point,t:number){return{x:(1-t)*(1-t)*core.x+2*(1-t)*t*end.x+t*t*end.x,y:(1-t)*(1-t)*core.y+2*(1-t)*t*core.y+t*t*end.y};}
function oval(c:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,fill:string|CanvasGradient){c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=fill;c.fill();}
function paint(c:CanvasRenderingContext2D,time:number,active:string){
 const sky=c.createLinearGradient(0,0,0,420);sky.addColorStop(0,'#e9f0e9');sky.addColorStop(.5,'#f6f3e8');sky.addColorStop(1,'#d4d3b9');c.fillStyle=sky;c.fillRect(0,0,500,420);
 const sunlight=c.createRadialGradient(343,57,4,343,57,210);sunlight.addColorStop(0,'#fffae9d0');sunlight.addColorStop(1,'#fff6dd00');c.fillStyle=sunlight;c.fillRect(0,0,500,420);
 // Procedural terrain is symbolic geometry, never a field map or measurements.
 for(let i=0;i<20;i++){c.beginPath();for(let x=-10;x<520;x+=10){const y=80+i*17+Math.sin(x*.013+i*.4)*13+Math.cos(x*.024-i*.31)*5;if(x===-10)c.moveTo(x,y);else c.lineTo(x,y);}c.strokeStyle=i%3===0?'#75866f18':'#b1b29d18';c.lineWidth=i%3===0?1.2:.65;c.stroke();}
 oval(c,250,242,184,108,'#617a5520');oval(c,250,232,173,106,'#d8d2b7');oval(c,250,225,173,106,'#e9e2cd');
 const land=c.createRadialGradient(238,159,15,260,222,185);land.addColorStop(0,'#f6f1df');land.addColorStop(1,'#c1c7a6');oval(c,250,220,169,104,land);
 c.beginPath();c.ellipse(250,215,160,108,0,0,Math.PI*2);c.strokeStyle='#536c532e';c.lineWidth=1;c.stroke();
 // Returning pulses represent monitoring, evidence and renewed decisions.
 for(let n=0;n<18;n++){const a=time*.19+n*Math.PI*2/18,x=250+Math.cos(a)*160,y=215+Math.sin(a)*108;const glow=c.createRadialGradient(x,y,0,x,y,5);glow.addColorStop(0,'#d9efd2d0');glow.addColorStop(1,'#d9efd200');c.fillStyle=glow;c.fillRect(x-5,y-5,10,10);}
 NEXUS_DOMAINS.forEach((d,i)=>{const end={x:d.x*5,y:d.y*4.2};c.globalAlpha=active==='all'||active===d.key?1:.35;
 oval(c,end.x,end.y+7,28,14,'#43543b28');oval(c,end.x,end.y,29,13,'#ede9d7');
 c.beginPath();c.moveTo(250,213);c.quadraticCurveTo(end.x,213,end.x,end.y+6);c.strokeStyle='#8d8b7159';c.lineWidth=18;c.lineCap='round';c.stroke();
 c.beginPath();c.moveTo(250,203);c.quadraticCurveTo(end.x,203,end.x,end.y);c.strokeStyle='#f5eed7';c.lineWidth=16;c.stroke();c.strokeStyle='#6c8e7e';c.lineWidth=11;c.stroke();c.strokeStyle='#1d7372';c.lineWidth=8;c.stroke();
 for(let j=0;j<23;j++){const t=(time*(.075+i*.005)+j/23)%1,p=point(end,t);oval(c,p.x,p.y,2.8,1.2+Math.sin(time*2.1+j)*.45,'#b1e4d37a');if(j%5===0){const g=c.createRadialGradient(p.x,p.y,0,p.x,p.y,7);g.addColorStop(0,'#d5fff470');g.addColorStop(1,'#d5fff400');c.fillStyle=g;c.fillRect(p.x-7,p.y-7,14,14);}}
 oval(c,end.x,end.y,19,8,d.color+'40');c.globalAlpha=1;});
 oval(c,250,225,72,33,'#55694d30');oval(c,250,216,65,30,'#958975');const wall=c.createLinearGradient(180,205,320,225);wall.addColorStop(0,'#ae9c7b');wall.addColorStop(.45,'#d1bea0');wall.addColorStop(1,'#a79373');c.fillStyle=wall;c.fillRect(185,202,130,12);oval(c,250,201,65,30,'#eee4c9');oval(c,250,201,56,23,'#405b51');
 const water=c.createLinearGradient(200,185,280,218);water.addColorStop(0,'#7fc8b0');water.addColorStop(.6,'#25857c');water.addColorStop(1,'#15595a');oval(c,250,202,54,21,water);
 c.save();c.beginPath();c.ellipse(250,202,54,21,0,0,Math.PI*2);c.clip();for(let j=0;j<8;j++){const phase=(time*.14+j/8)%1;c.beginPath();c.ellipse(249,199,phase*62,phase*25,0,0,Math.PI*2);c.strokeStyle=`rgba(214,255,234,${(1-phase)*.45})`;c.lineWidth=.7;c.stroke();}c.restore();
 const shine=c.createLinearGradient(120+Math.sin(time*.1)*30,0,390,420);shine.addColorStop(0,'#fff7da00');shine.addColorStop(.5,'#fff9e51c');shine.addColorStop(1,'#fff7da00');c.fillStyle=shine;c.fillRect(0,0,500,420);
}
function CinematicCanvas({state,onUnavailable}:{state:Scene;onUnavailable:()=>void}){
 const ref=useRef<HTMLCanvasElement>(null),current=useRef(state);
 useEffect(()=>{current.current=state;},[state]);
 useEffect(()=>{const canvas=ref.current,c=canvas?.getContext('2d',{alpha:false});if(!canvas||!c){onUnavailable();return;}
 const motion=matchMedia('(prefers-reduced-motion: reduce)'),connection=(navigator as Navigator&{connection?:{saveData?:boolean}}).connection,lowPower=!!connection?.saveData||(navigator.hardwareConcurrency||4)<=4;
 let visible=true,frame=0,last=0,time=0,dirty=true,width=0,height=0,previousActive='';
 const resize=()=>{const ratio=Math.min(devicePixelRatio||1,lowPower?1:1.5);const nextWidth=Math.max(1,Math.round(canvas.clientWidth*ratio)),nextHeight=Math.max(1,Math.round(canvas.clientHeight*ratio));if(width!==nextWidth||height!==nextHeight){width=nextWidth;height=nextHeight;canvas.width=width;canvas.height=height;dirty=true;}};
 const observer=new ResizeObserver(resize);observer.observe(canvas);resize();const intersection=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;dirty=true;});intersection.observe(canvas);
 const render=(now:number)=>{const delta=last?Math.min((now-last)/1000,.1):0;last=now;const moving=visible&&!document.hidden&&current.current.playing&&!motion.matches;if(moving)time+=delta*current.current.speed;if(previousActive!==current.current.active){dirty=true;previousActive=current.current.active;}if(dirty||moving){c.setTransform(width/500,0,0,height/420,0,0);paint(c,time,current.current.active);dirty=false;}};
 const timer=window.setInterval(()=>{if(frame===0){frame=requestAnimationFrame(now=>{frame=0;render(now);});}},lowPower?50:33);const invalidate=()=>{dirty=true;};motion.addEventListener('change',invalidate);document.addEventListener('visibilitychange',invalidate);render(performance.now());
 return()=>{clearInterval(timer);cancelAnimationFrame(frame);observer.disconnect();intersection.disconnect();motion.removeEventListener('change',invalidate);document.removeEventListener('visibilitychange',invalidate);};
 },[onUnavailable]);
 return <canvas ref={ref} className="cinematic-canvas" aria-hidden="true"/>;
}
export function NexusKasria({active='all',onSelect}:{active?:string;onSelect?:(key:string)=>void}){
 const {t}=useTranslation();const [playing,setPlaying]=useState(true),[speed,setSpeed]=useState(1),[unavailable,setUnavailable]=useState(false);const onUnavailable=useCallback(()=>setUnavailable(true),[]);
 return <div className="cinematic-kasria"><div className="kasria-network cinematic-stage"><CinematicCanvas state={{active,playing,speed}} onUnavailable={onUnavailable}/><div className="cinematic-heading"><span>FOGGARA / WEFEH</span><strong>{t('os.kasria')}</strong></div>{unavailable&&<p className="cinematic-fallback">{t('cinematic.unavailable')}</p>}{NEXUS_DOMAINS.map(({key,icon:Icon,color,x,y})=><button type="button" key={key} className={`kasria-node cinematic-node ${active===key?'selected':''}`} style={{left:`${x}%`,top:`${y}%`,borderColor:active===key?color:undefined}} onClick={()=>onSelect?.(active===key?'all':key)} aria-pressed={active===key}><Icon size={17} style={{color}}/><span>{t(`landing.${key}`)}</span></button>)}<div className="cinematic-core-label"><span>{t('os.kasriaSub')}</span></div></div><div className="cinematic-toolbar"><button type="button" onClick={()=>setPlaying(!playing)} aria-label={t(playing?'cinematic.pause':'cinematic.play')}>{playing?<Pause size={14}/>:<Play size={14}/>}<span>{t(playing?'cinematic.pause':'cinematic.play')}</span></button><label><span>{t('cinematic.speed')}</span><select value={speed} onChange={e=>setSpeed(Number(e.target.value))}><option value="0.5">0.5×</option><option value="1">1×</option><option value="1.5">1.5×</option></select></label><button type="button" className="cinematic-reset" onClick={()=>onSelect?.('all')} aria-label={t('os.all')}><RotateCcw size={14}/></button></div><p className="cinematic-loop">{t('cinematic.loop')}</p><p className="cinematic-motion-notice">{t('cinematic.reducedMotion')}</p></div>;
}
