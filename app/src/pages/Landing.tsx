import { Link } from "react-router";
import { ArrowUpLeft, Droplets, Zap, Wheat, Leaf, HeartPulse, Wrench, Layers3, Radio, ArrowDown } from "lucide-react";
import { useAuth } from "@/context/useAuth";
import "./operations.css";
const domains = [
  {name:"المياه",key:"water",Icon:Droplets},{name:"الطاقة",key:"energy",Icon:Zap},
  {name:"الغذاء",key:"food",Icon:Wheat},{name:"النظام البيئي",key:"ecosystem",Icon:Leaf},
  {name:"الصحة",key:"health",Icon:HeartPulse}
];
export default function Landing() {
  const {user}=useAuth();
  return <div className="fg-public" dir="rtl" lang="ar">
    <nav className="fg-public-nav" aria-label="تصفح فقارة"><Link to="/about">رؤيتنا</Link><a href="#ecosystem">منظومة WEFEH</a><a href="#solutions">الحلول والخدمات</a><Link to="/contact">الشراكات والتواصل</Link>
      <Link to={user?"/app/operations":"/login"} style={{marginInlineStart:"auto",fontWeight:700}}>مساحة العمل ↗</Link></nav>
    <section className="fg-hero" aria-labelledby="foggara-title">
      <img className="fg-hero-photo" src="https://upload.wikimedia.org/wikipedia/commons/2/22/Foggara_in_Timimoun.jpg"
        width={2402} height={1601} alt="قنوات فقارة تقليدية في تيميمون، الجزائر" fetchPriority="high" referrerPolicy="no-referrer"/>
      <p className="fg-eyebrow">ROOTED IN ALGERIA. CONNECTED BY PURPOSE.</p>
      <h1 id="foggara-title">من عمق الأرض،<br/>نصلُ <em>إلى المستقبل.</em></h1>
      <p className="fg-hero-copy">موارد مترابطة. معرفة تتحوّل إلى قرار. فقارة تجمع المياه والطاقة والغذاء والبيئة والصحة، لتصل المنظومة الإنتاجية من الميدان إلى القيمة.</p>
      <div className="fg-hero-actions"><Link className="fg-button" to={user?"/app/operations":"/login"}>الدخول إلى المنصة <ArrowUpLeft size={18}/></Link><a className="fg-button fg-secondary" href="#ecosystem">اكتشف فقارة <ArrowDown size={16}/></a></div>
      <div className="fg-hero-caption"><span>FOGGARA · WEFEH NEXUS PLATFORM<br/>LAGHOUAT, ALGERIA · 03</span>
        <span>إرث التدبير المشترك، برؤية رقمية.<br/><Link to="/rights">صورة تيميمون: Bernard Gagnon · CC BY 4.0</Link></span></div>
    </section>
    <nav className="fg-pillars" aria-label="المجالات الخمسة">{domains.map(({name,key,Icon})=><Link key={key} to={"/app/explore/"+key}><Icon size={21}/><span>{name}</span></Link>)}</nav>
    <section className="fg-editorial" id="ecosystem"><div><p className="fg-eyebrow">01 / A CONNECTED ECOSYSTEM</p><h2>خمسة مجالات.<br/>منظومة واحدة للحياة والإنتاج.</h2></div><div><p>استمدّت فقارة اسمها من معرفة جزائرية عريقة في تنظيم المورد وتقاسمه. واليوم، نترجم هذا المعنى إلى بنية رقمية تربط الموارد والبيانات والتجهيزات والمنتجين والمورّدين والخبراء والمؤسسات.</p><p>من الواحة والمزرعة إلى التحويل والخدمات واللوجستيك، تُبنى القرارات على قياسات قابلة للمراجعة، وأدلة واضحة، ومسؤوليات محددة.</p><Link className="fg-link" to="/about">تعرف على المشروع والجهة الناشرة <ArrowUpLeft size={16}/></Link></div></section>
    <section id="solutions"><p className="fg-eyebrow">02 / FROM KNOWLEDGE TO THE FIELD</p><h2 className="fg-section-title">الخبرة، والبرمجيات، والميدان.</h2>
      <div className="fg-services-grid">
        {[{n:"01",Icon:Wrench,title:"خدمات هندسية",body:"تنظيم طلبات الخدمات والمترولوجيا والمعايرة ومراجع الأدلة، وربط الاحتياج بالخبرة المناسبة.",to:"/app/services"},
          {n:"02",Icon:Layers3,title:"منظومة إنتاج مترابطة",body:"مشاريع ودفعات إنتاج ومصفوفات WEFEH، مع اقتراحات العرض والطلب وسجل مراجعة واضح.",to:"/app/operations"},
          {n:"03",Icon:Radio,title:"متابعة الميدان",body:"إدارة الأجهزة والقراءات والمحاكاة، والتمييز بين البيانات التجريبية والربط الميداني الفعلي.",to:"/app/telemetry"}
        ].map(({n,Icon,title,body,to})=><article className="fg-service" key={n}><span>FOGGARA / {n}</span><Icon size={29}/><h3>{title}</h3><p>{body}</p><Link to={to} className="fg-link">فتح مساحة العمل <ArrowUpLeft size={14}/></Link></article>)}
      </div>
    </section>
    <section className="fg-feature"><div><p className="fg-eyebrow">03 / ACCOUNTABLE INTELLIGENCE</p><h2>بيانات تعرف مصدرها.<br/>قرارات تعرف مسؤولها.</h2><p>تقيّم المصفوفات البيانات المعتمدة وتكشف النقص وتقترح مسارات المراجعة. وتبقى القرارات والاعتمادات قابلة للتتبّع، مع فصل الإدخال عن المراجعة.</p><Link to={user?"/app/operations":"/login"} className="fg-button">استكشف مساحة العمليات <ArrowUpLeft size={17}/></Link></div>
      <div className="fg-flow">{["مشروع وقياسات ومراجع","مراجعة واعتماد جودة البيانات","تحليل WEFEH ومطابقة الفرص","قرار بشري ومتابعة وتدقيق"].map((text,i)=><div key={text}><b>0{i+1}</b><span>{text}</span></div>)}</div>
    </section>
    <section className="fg-editorial"><div><p className="fg-eyebrow">04 / BUILD WITH US</p><h2>قيمة محلية.<br/>آفاق مشتركة.</h2></div><div><p>للمزارع والواحات والتعاونيات ومؤسسات التحويل واللوجستيك والمورّدين والخبراء والشركاء: نبدأ من احتياجاتكم الميدانية، ونبني دورة عمل يمكن قياسها ومتابعتها.</p><Link to="/contact" className="fg-button">تواصل مع فريق فقارة <ArrowUpLeft size={17}/></Link><p className="fg-muted">السجلات الموسومة DEMO بيانات توضيحية. الوحدات التجريبية لا تمثل ربطًا وطنيًا حيًا أو شهادات اعتماد.</p></div></section>
  </div>;
}
