import { Link } from 'react-router';
import { ArrowUpRight, MapPinned, Satellite, Droplets, ShieldCheck, GitBranch, BrainCircuit, Users, Handshake } from 'lucide-react';
import './source-presentation.css';

/** Source: user-supplied Oases Nexus WEFEH — FOGGARA-DZ (8-slide PPTX, 2026-10-09).
 * Informational presentation: no fabricated satellite measurements or live service claims.
 */
const sections = [
  {n:'01', label:'DÉFINIR LE TERRAIN', ar:'تحديد المجال', desc:'رسم أو اختيار منطقة اهتمام وحساب الإحداثيات والمساحة والمحيط والسياق المكاني.', points:['AOI / PARCELLE','Coordonnées · Surface · Périmètre','Occupation du sol · Voisinage · Bassin'], Icon:MapPinned},
  {n:'02', label:'OBSERVER PAR SATELLITE', ar:'الرصد بالأقمار الصناعية', desc:'Sentinel-2 L2A لرصد تغير الغطاء النباتي والرطوبة والإجهاد عبر الزمن.', points:['Série temporelle','Comparer les dates','Documenter l’incertitude'], Icon:Satellite},
  {n:'03', label:'COMPRENDRE EAU, SOL ET CULTURES', ar:'فهم الماء والتربة والمحاصيل', desc:'ربط القياسات الميدانية والاستشعار عن بعد والنماذج دون ادعاء اليقين المطلق.', points:['Eau · disponibilité et qualité','Sol · texture, salinité, humidité','Cultures · vigueur, stress, phénologie'], Icon:Droplets},
  {n:'04', label:'PREUVE AVANT DÉCISION', ar:'الدليل قبل القرار', desc:'كل نتيجة مرتبطة بالمصدر والتاريخ والمنهج والثقة وحدود الاستخدام.', points:['Observé','Dérivé · calcul reproductible','Modélisé · incertitude explicite','Validé pour usage · revue humaine'], Icon:ShieldCheck},
  {n:'05', label:'DE L’ANALYSE À L’ARBITRAGE', ar:'من التحليل إلى المفاضلة', desc:'إظهار القيود والسيناريوهات والمفاضلات وآثارها، مع بقاء القرار تحت المسؤولية البشرية.', points:['Contraintes · eau, énergie, sol, santé','Scénarios · allocation, cultures, horizon','Décision · impact WEFEH, risque, justification'], Icon:GitBranch},
  {n:'06', label:'IA SOUVERAINE ET SERVICES', ar:'الذكاء الاصطناعي السيادي والخدمات', desc:'مساعدة محلية موثقة وقابلة للتحكم لدعم المحللين، لا لاستبدال الخبرة.', points:['Interfaces métier','Données souveraines','IA locale · RAG documentaire','Services géospatiaux · modèles WEFEH'], Icon:BrainCircuit},
  {n:'07', label:'UN ÉCOSYSTÈME NATIONAL', ar:'منظومة وطنية مترابطة', desc:'ربط الجهات بالمشاريع والمناطق والأدلة والموارد ضمن إطار مشترك.', points:['Institutions','Recherche','Agriculteurs','Entreprises · territoires'], Icon:Users},
  {n:'08', label:'DÉMO FOGGARA-DZ', ar:'اكتشف المنصة', desc:'من الميدان إلى الدليل، ومن الدليل إلى المفاضلة: عروض تجريبية وشراكات ومشاريع رائدة.', points:['Démonstrations','Pilotes','Partenariats','EURL SIREP OASES NEXUS WEFEH-DZ'], Icon:Handshake}
];
export default function SourcePresentation() {
 return <main className="source-deck" dir="rtl">
   <header className="source-deck-hero"><div className="source-deck-inner">
     <p className="source-eyebrow">EURL SIREP OASES NEXUS WEFEH-DZ · PRÉSENTATION</p>
     <h1>FOGGARA-DZ <span>من الأرض إلى الدليل والقرار</span></h1>
     <p>عرض المنصة وفق الملف الأصلي المقدم من المؤسسة: ثماني مراحل مترابطة، من تحديد القطعة إلى اتخاذ القرار المبني على الأدلة.</p>
     <div className="source-actions"><a href="#source-chapters">استكشف العرض ↓</a><Link to="/app/gis">مساحة العمل <ArrowUpRight size={16}/></Link></div>
   </div></header>
   <section id="source-chapters" className="source-deck-inner source-chapters" aria-label="مراحل عرض FOGGARA-DZ">
   {sections.map(({n,label,ar,desc,points,Icon})=><article className="source-chapter" key={n}>
     <div className="source-chapter-top"><span className="source-chapter-number">{n}</span><Icon size={32} strokeWidth={1.5}/></div>
     <p className="source-label">{label}</p><h2>{ar}</h2><p className="source-description">{desc}</p>
     <ul>{points.map(p=><li key={p}>{p}</li>)}</ul>
   </article>)}
   </section>
   <footer className="source-deck-footer">FOGGARA-DZ · WATER · ENERGY · FOOD · ECOSYSTEM · HEALTH <p>المحتوى يعرض رؤية المنصة ولا يمثل بيانات رصد ميداني مباشر.</p></footer>
 </main>;
}
