import {useEffect,useState} from "react";
import {Link} from "react-router";
import {useTranslation} from "react-i18next";
import {ArrowUpRight,CheckCircle2,CloudSun,Droplets,FlaskConical,Globe2,HeartPulse,Leaf,MapPinned,Radio,Satellite,ShieldCheck,Sprout,Zap} from "lucide-react";
import {useAuth} from "@/context/useAuth";
import {api} from "@/lib/api";
import {WILAYAS} from "@/lib/wilayas";
import "./farm-landing.css";

type Locale="ar"|"fr"|"en";
type Counts={sites:number;projects:number;parcels:number;observations:number};

const contentByLocale={
  ar:{
    nav:["من نحن","خدماتنا","كيف تعمل فقارة","العرض","المعرض"],
    label:"SIREP OASES NEXUS WEFEH · الجزائر",
    kicker:"من تراث الواحات إلى ذكاء الموارد",
    hero:"فقارة: البيانات والميدان في خدمة القرار",
    lead:"منصة جزائرية تربط المياه والطاقة والغذاء والنظام البيئي والصحة. خرائط وتحاليل وأدلة واضحة تساعد المنتجين والمؤسسات على اتخاذ قرارات قابلة للتتبع.",
    discover:"استكشف الخدمات",visitor:"دخول الزائر",work:"دخول مساحة العمل",
    domains:["المياه","الطاقة","الغذاء","البيئة","الصحة"],
    aboutKicker:"من نحن",aboutTitle:"هندسة ميدانية، حلول رقمية، وموارد مستدامة",
    aboutBody:"تجمع EURL SIREP OASES NEXUS WEFEH خدمات الهندسة والقياس والمعايرة والتفتيش والطاقة والزراعة مع بنية رقمية للتتبع والتحليل والقرار. فقارة هي المنصة الجامعة لهذه الأنشطة.",
    aboutLink:"تعرف على المؤسسة",heritageCaption:"الفقارة: توزيع الماء بدقة وعدالة",
    servicesKicker:"حلول مترابطة",servicesTitle:"خدمات تعمل معًا، لا بطاقات عرض فارغة",
    servicesIntro:"كل خدمة تقود إلى مسار فعلي داخل المنصة أو إلى صفحة تشرح متطلبات البيانات والتشغيل.",
    services:[
      ["المياه والري","الآبار والمضخات والقياسات واحتياجات الري وجودة المياه.","/agriculture-services"],
      ["الزراعة والاستشعار عن بعد","القطع الزراعية وصور Sentinel-2 ومؤشرات الغطاء النباتي والطقس.","/app/agriculture"],
      ["الأدلة ومحرك القرار","مصدر البيانات والتحقق والقواعد والسيناريوهات والاعتماد البشري.","/app/studio"]
    ],
    processKicker:"سير العمل",processTitle:"من المورد إلى قرار موثّق",
    process:["حدد الموقع والقطعة","اجمع بيانات موثوقة","شغّل التحاليل","راجع الأدلة","اتخذ القرار وتابع الأثر"],
    toolsTitle:"أدوات المنصة",toolsIntro:"انتقل مباشرة إلى الوحدة المناسبة. الوحدات المقيّدة تفتح بعد الدخول إلى مساحة العمل.",
    tools:[
      ["الخريطة والقطع","/app/gis"],["الطقس والتحليل الزراعي","/app/agriculture"],["المياه والتربة","/agriculture-services"],["الأجهزة والحساسات","/app/telemetry"],["غرف البيانات","/app/vde"],["وضع المعرض","/expo"]
    ],
    presentationTitle:"عرض فقارة بصيغة تفاعلية",presentationBody:"شاهد رحلة الفقارة من المصدر والقصرية والساقية إلى التوأم الرقمي والبيانات والأدلة.",
    presentationBtn:"فتح العرض",canvaBtn:"مصدر العرض على Canva",
    stats:["ولايات","مجالات مترابطة","مشاريع ديمو محفوظة","قطع ديمو محفوظة"],
    expoKicker:"AGRITECH EXPO ANNABA 2026",expoTitle:"شاهد الخدمات وتواصل معنا",
    expoBody:"استكشف مسار المعرض، سجل ملاحظتك، وتعرّف على حلول المياه والزراعة والطاقة.",
    expoBtn:"فتح وضع المعرض",contactBtn:"اتصل بالمؤسسة",
    disclaimer:"إحصاءات الديمو توضيحية ولا تمثل قياسات ميدانية معتمدة. التحاليل تتطلب بيانات صحيحة ومراجعة بشرية.",
    foot:"المنصة الجزائرية المتكاملة لإدارة الموارد والإنتاج المستدام",
    legal:["الخصوصية","الشروط","الحقوق والمصادر"]
  },
  fr:{
    nav:["À propos","Services","Méthode","Présentation","Expo"],
    label:"SIREP OASES NEXUS WEFEH · ALGÉRIE",
    kicker:"De l'héritage des oasis à l'intelligence des ressources",
    hero:"FOGGARA : relier le terrain, les données et la décision",
    lead:"Plateforme algérienne reliant eau, énergie, alimentation, écosystème et santé. Cartographie, analyses et preuves traçables au service des producteurs et institutions.",
    discover:"Explorer les services",visitor:"Accès visiteur",work:"Espace de travail",
    domains:["EAU","ÉNERGIE","ALIMENTATION","ÉCOSYSTÈME","SANTÉ"],
    aboutKicker:"À propos",aboutTitle:"Ingénierie de terrain, services numériques, ressources durables",
    aboutBody:"EURL SIREP OASES NEXUS WEFEH relie ingénierie, mesure, étalonnage, inspection, énergie et agriculture à une infrastructure numérique d'analyse et de décision. FOGGARA est le noyau de cette approche.",
    aboutLink:"Découvrir l'entreprise",heritageCaption:"La foggara : mesurer et répartir l'eau",
    servicesKicker:"Une chaîne connectée",servicesTitle:"Des services reliés à des parcours concrets",
    servicesIntro:"Chaque service mène à un module opérationnel ou à ses exigences de données et d'exploitation.",
    services:[
      ["Eau & irrigation","Forages, pompage, mesures, qualité de l'eau et besoins d'irrigation.","/agriculture-services"],
      ["Agriculture & satellite","Parcelles, Sentinel-2, indices de végétation et météo agricole.","/app/agriculture"],
      ["Preuves & décision","Provenance, validation, règles, scénarios et revue humaine.","/app/studio"]
    ],
    processKicker:"Le parcours",processTitle:"De la ressource à la décision traçable",
    process:["Localiser la parcelle","Collecter les données","Analyser","Vérifier les preuves","Décider et suivre"],
    toolsTitle:"Outils de la plateforme",toolsIntro:"Accès direct aux modules. Certains nécessitent une session dans l'espace de travail.",
    tools:[
      ["Cartographie et parcelles","/app/gis"],["Météo et analyse agricole","/app/agriculture"],["Eau et sols","/agriculture-services"],["Capteurs et télémétrie","/app/telemetry"],["Data rooms","/app/vde"],["Mode Expo","/expo"]
    ],
    presentationTitle:"Une présentation interactive de FOGGARA",presentationBody:"De la source, kasria et seguia jusqu'au jumeau numérique, aux données et aux preuves.",
    presentationBtn:"Voir la présentation",canvaBtn:"Design d'origine sur Canva",
    stats:["WILAYAS","DOMAINES","PROJETS DÉMO","PARCELLES DÉMO"],
    expoKicker:"AGRITECH EXPO ANNABA 2026",expoTitle:"Découvrir nos services et échanger",
    expoBody:"Explorez l'Expo, donnez votre avis et découvrez les services eau, agriculture et énergie.",
    expoBtn:"Ouvrir l'Expo",contactBtn:"Nous contacter",
    disclaimer:"Les données de démonstration ne sont pas des mesures de terrain vérifiées. Les analyses nécessitent des données réelles et une revue humaine.",
    foot:"Plateforme algérienne intégrée pour les ressources et la production durable",
    legal:["Confidentialité","Conditions","Droits et sources"]
  },
  en:{
    nav:["About","Services","How it works","Presentation","Expo"],
    label:"SIREP OASES NEXUS WEFEH · ALGERIA",
    kicker:"Oasis heritage meets resource intelligence",
    hero:"FOGGARA: field data for better decisions",
    lead:"An Algerian platform bringing together water, energy, food, ecosystems and health. Maps, analytics and traceable evidence for producers and institutions.",
    discover:"Explore services",visitor:"Visitor access",work:"Open workspace",
    domains:["WATER","ENERGY","FOOD","ECOSYSTEM","HEALTH"],
    aboutKicker:"About us",aboutTitle:"Field engineering, digital services, sustainable resources",
    aboutBody:"EURL SIREP OASES NEXUS WEFEH connects engineering, measurement, calibration, inspection, energy and agriculture with an integrated digital platform for analysis and decision support.",
    aboutLink:"About the company",heritageCaption:"Foggara heritage: precise water sharing",
    servicesKicker:"Connected capabilities",servicesTitle:"Services connected to real workflows",
    servicesIntro:"Every service leads to an operational module or explains its data and operational requirements.",
    services:[
      ["Water & irrigation","Wells, pumps, measurements, water quality and irrigation demand.","/agriculture-services"],
      ["Agriculture & satellite","Parcels, Sentinel-2, vegetation indices and agricultural weather.","/app/agriculture"],
      ["Evidence & decisions","Provenance, validation, constraints, scenarios and human review.","/app/studio"]
    ],
    processKicker:"The workflow",processTitle:"From resource to traceable decision",
    process:["Locate the parcel","Collect real data","Run analysis","Review evidence","Decide and monitor"],
    toolsTitle:"Platform tools",toolsIntro:"Open the relevant module. Protected modules require workspace access.",
    tools:[
      ["GIS and parcels","/app/gis"],["Weather & farm analytics","/app/agriculture"],["Water and soil","/agriculture-services"],["Sensors and telemetry","/app/telemetry"],["Data rooms","/app/vde"],["Expo experience","/expo"]
    ],
    presentationTitle:"FOGGARA interactive presentation",presentationBody:"Follow the foggara from water source to digital twin, data, evidence and decisions.",
    presentationBtn:"Open presentation",canvaBtn:"Original design on Canva",
    stats:["WILAYAS","DOMAINS","DEMO PROJECTS","DEMO PARCELS"],
    expoKicker:"AGRITECH EXPO ANNABA 2026",expoTitle:"Explore the services and get in touch",
    expoBody:"Visit our Expo experience, leave feedback and discover water, agriculture and energy services.",
    expoBtn:"Open Expo",contactBtn:"Contact SIREP",
    disclaimer:"Demo records are illustrative, not verified field readings. Analysis needs valid inputs and human review.",
    foot:"Algerian integrated platform for resources and sustainable production",
    legal:["Privacy","Terms","Rights and sources"]
  }
};

const domainIcons=[Droplets,Zap,Sprout,Leaf,HeartPulse];
const serviceIcons=[Droplets,Satellite,ShieldCheck];
const stepIcons=[MapPinned,Radio,CloudSun,FlaskConical,CheckCircle2];

export default function FarmLanding(){
  const {i18n}=useTranslation();
  const {user}=useAuth();
  const locale:Locale=i18n.language==="fr"?"fr":i18n.language==="en"?"en":"ar";
  const copy=contentByLocale[locale];
  const [counts,setCounts]=useState<Counts|null>(null);
  useEffect(()=>{
    let cancelled=false;
    api.get<{counts:Counts}>("/expo/demo-data")
      .then(data=>{if(!cancelled&&data.counts)setCounts(data.counts);})
      .catch(()=>{if(!cancelled)setCounts(null);});
    return()=>{cancelled=true;};
  },[]);
  const figures=[
    String(WILAYAS.length),
    "5",
    counts?counts.projects.toLocaleString():"—",
    counts?counts.parcels.toLocaleString():"—"
  ];
  return <div className="fml-page" dir={locale==="ar"?"rtl":"ltr"} lang={locale}>
    <nav className="fml-jumpbar" aria-label="FOGGARA sections">
      <span className="fml-jumpbar-label"><Globe2 size={16}/>{copy.label}</span>
      <div>
        {["about","services","process","presentation","expo"].map((id,i)=><a href={"#"+id} key={id}>{copy.nav[i]}</a>)}
      </div>
    </nav>
    <section className="fml-hero" aria-labelledby="fml-hero-title">
      <div className="fml-hero-image" role="img" aria-label="Algerian oasis, palms and traditional irrigation waterway"/>
      <div className="fml-hero-shade"/>
      <div className="fml-wrap fml-hero-content">
        <p className="fml-overline">{copy.kicker}</p>
        <p className="fml-mark" dir="ltr">SIREP OASES <span>·</span> NEXUS WEFEH</p>
        <h1 id="fml-hero-title">FOGGARA-DZ</h1>
        <h2>{copy.hero}</h2>
        <p className="fml-hero-lead">{copy.lead}</p>
        <div className="fml-buttons">
          <a className="fml-btn fml-btn-accent" href="#services">{copy.discover}<ArrowUpRight size={17}/></a>
          <Link className="fml-btn fml-btn-outline" to={user?"/app":"/login"}>{user?copy.work:copy.visitor}<ArrowUpRight size={17}/></Link>
        </div>
      </div>
      <div className="fml-hero-caption" dir="ltr">WATER · ENERGY · FOOD · ECOSYSTEM · HEALTH</div>
    </section>
    <section className="fml-domains fml-wrap" aria-label="WEFEH">
      {copy.domains.map((domain,i)=>{
        const Icon=domainIcons[i];
        return <div className="fml-domain" key={domain}><Icon size={23}/><span>{domain}</span></div>;
      })}
    </section>
    <section className="fml-wrap fml-about" id="about">
      <div className="fml-about-media">
        <img src="/images/foggara-heritage-poster.webp" loading="lazy" alt={copy.heritageCaption}/>
        <div>{copy.heritageCaption}</div>
      </div>
      <div className="fml-about-text">
        <p className="fml-eyebrow">{copy.aboutKicker}</p>
        <h2>{copy.aboutTitle}</h2>
        <p>{copy.aboutBody}</p>
        <Link to="/about" className="fml-text-link">{copy.aboutLink}<ArrowUpRight size={17}/></Link>
        <div className="fml-figures">
          {figures.map((figure,i)=><div key={copy.stats[i]}><strong>{figure}</strong><span>{copy.stats[i]}</span></div>)}
        </div>
      </div>
    </section>
    <section className="fml-service-area" id="services">
      <div className="fml-wrap">
        <header className="fml-section-heading"><p className="fml-eyebrow">{copy.servicesKicker}</p><h2>{copy.servicesTitle}</h2><p>{copy.servicesIntro}</p></header>
        <div className="fml-service-grid">
          {copy.services.map(([title,body,to],i)=>{
            const Icon=serviceIcons[i];
            return <article className={"fml-service-card fml-service-"+(i+1)} key={title}>
              <div className="fml-service-art"><Icon size={47} strokeWidth={1.65}/><span dir="ltr">0{i+1}</span></div>
              <div className="fml-service-content"><h3>{title}</h3><p>{body}</p><Link to={to}>{copy.discover}<ArrowUpRight size={17}/></Link></div>
            </article>;
          })}
        </div>
      </div>
    </section>
    <section className="fml-wrap fml-process" id="process">
      <div className="fml-process-intro">
        <p className="fml-eyebrow">{copy.processKicker}</p>
        <h2>{copy.processTitle}</h2>
      </div>
      <ol className="fml-process-steps">{copy.process.map((title,i)=>{
        const Icon=stepIcons[i];
        return <li key={title}><div className="fml-step-icon"><Icon size={23}/></div><small dir="ltr">0{i+1}</small><strong>{title}</strong></li>;
      })}</ol>
      <div className="fml-tool-directory">
        <div><h3>{copy.toolsTitle}</h3><p>{copy.toolsIntro}</p></div>
        <div className="fml-tool-links">{copy.tools.map(([label,to])=><Link key={to+label} to={to}><span>{label}</span><ArrowUpRight size={16}/></Link>)}</div>
      </div>
    </section>
    <section className="fml-presentation" id="presentation">
      <div className="fml-presentation-image"><img src="/images/foggara-sprite.webp" loading="lazy" alt={copy.heritageCaption}/></div>
      <div className="fml-presentation-copy">
        <p className="fml-eyebrow">FOGGARA · DIGITAL TWIN</p>
        <h2>{copy.presentationTitle}</h2>
        <p>{copy.presentationBody}</p>
        <Link className="fml-btn fml-btn-accent" to="/presentation">{copy.presentationBtn}<ArrowUpRight size={17}/></Link>
        <a className="fml-canva-link" target="_blank" rel="noopener noreferrer" href="https://www.canva.com/design/DAHXhRSdmV4/ATD6KuOpMPyI5uk8Lq9N-A/edit?ui=e30">{copy.canvaBtn}<ArrowUpRight size={15}/></a>
      </div>
    </section>
    <section className="fml-wrap fml-expo" id="expo">
      <div><p className="fml-eyebrow">{copy.expoKicker}</p><h2>{copy.expoTitle}</h2><p>{copy.expoBody}</p></div>
      <div className="fml-expo-actions">
        <Link className="fml-btn fml-btn-accent" to="/expo">{copy.expoBtn}<ArrowUpRight size={17}/></Link>
        <Link className="fml-btn fml-btn-outline" to="/contact">{copy.contactBtn}<ArrowUpRight size={17}/></Link>
      </div>
    </section>
    <footer className="fml-footer">
      <div className="fml-wrap"><div><strong dir="ltr">FOGGARA-DZ · SIREP OASES NEXUS WEFEH</strong><p>{copy.foot}</p><small>{copy.disclaimer}</small></div>
        <nav aria-label="Legal"><Link to="/privacy">{copy.legal[0]}</Link><Link to="/terms">{copy.legal[1]}</Link><Link to="/rights">{copy.legal[2]}</Link></nav>
      </div>
    </footer>
  </div>;
}
