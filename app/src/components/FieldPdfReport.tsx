import type {FoggaraPolygon} from "@/lib/foggara-aoi";
import "./field-pdf-report.css";

export type FieldReportIndex="ndvi"|"ndmi";
export type FieldPdfEvidence={
  index:FieldReportIndex;
  status:"READY"|"NO_USABLE_SCENE";
  scene:{id:string;datetime:string|null;cloud_cover_pct:number|null;provider:string|null}|null;
  geometry_mask_applied:boolean;
  metrics:{
    statistics?:{min:number|null;max:number|null;mean:number|null;median:number|null};
    pixels?:{total:number;valid:number;valid_fraction:number};
  }|null;
  verified:boolean;
}|null;

export type FieldPdfReportProps={
  lang:"ar"|"fr"|"en";
  geometry:FoggaraPolygon;
  bbox:[number,number,number,number];
  estimatedAreaHa:number;
  fieldName:string|null;
  crop:string|null;
  fieldId:number|null;
  period:{start:string;end:string};
  evidence:FieldPdfEvidence;
  createdAt:string;
};

const strings={
  ar:{
    document:"تقرير تحديد القطعة والتحليل الفضائي",subtitle:"المنصة الجزائرية المتكاملة لإدارة الموارد والإنتاج المستدام",
    confidentiality:"وثيقة مصدرها منصة FOGGARA-DZ",reportId:"مرجع التقرير",generated:"تاريخ الإصدار",
    field:"القطعة الزراعية",fieldName:"اسم القطعة",crop:"المحصول",id:"رقم القطعة في قاعدة البيانات",unsaved:"منطقة مؤقتة غير محفوظة",
    unknown:"غير محدد",area:"المساحة التقديرية",coordinates:"الإحداثيات الجغرافية WGS84",
    period:"فترة البحث",from:"من",to:"إلى",geometry:"رسم تخطيطي لحدود المنطقة",
    notMap:"الرسم يعرض الحدود الهندسية فقط وليس خريطة مساحية معتمدة.",
    titleAnalysis:"نتائج التحليل الفضائي",indicator:"المؤشر",mean:"المتوسط",range:"أدنى / أعلى",pixels:"البكسلات الصالحة",
    coverage:"تغطية البكسلات",acquisition:"تاريخ تصوير القمر",scene:"معرّف المشهد",cloud:"نسبة الغطاء السحابي للمشهد",
    provider:"مصدر البيانات",mask:"قناع حدود القطعة",applied:"مطبق",notApplied:"لم يثبت تطبيقه",
    evidence:"تصنيف الدليل",computed:"محسوب آليًا - غير مُتحقق ميدانيًا",
    notReady:"لا توجد نتيجة تحليل قابلة للاعتماد لهذه المنطقة والفترة.",notRun:"لم يُطلب تحليل لهذه القطعة بعد.",
    notes:"المنهجية والقيود",note1:"بيانات القمر الصناعي من Sentinel-2 L2A، وتُعالج المؤشرات الطيفية في خادم فقارة باستخدام Rasterio.",
    note2:"NDVI مؤشر طيفي للنشاط النباتي، وNDMI مؤشر تقريبي لمحتوى الماء في الغطاء النباتي؛ لا يمثلان تحليلًا مخبريًا للتربة أو قياسًا مباشرًا لريّ الحقل.",
    note3:"المساحة مشتقة من الهندسة الجغرافية المرسومة؛ ليست رفعًا مساحيًا ولا توثيقًا قانونيًا للملكية.",
    note4:"النتائج غير المصنفة VERIFIED لا ينبغي تقديمها بوصفها قياسات ميدانية مؤكدة.",
    footer:"FOGGARA-DZ · EURL SIREP OASES NEXUS WEFEH · الجزائر",status:"حالة التسجيل",saved:"محفوظة في قاعدة المؤسسة",temporary:"غير محفوظة",
  },
  fr:{
    document:"Rapport de parcelle et de télédétection",subtitle:"Plateforme algérienne intégrée de gestion durable des ressources",
    confidentiality:"Document émis par la plateforme FOGGARA-DZ",reportId:"Référence du rapport",generated:"Émis le",
    field:"Parcelle",fieldName:"Nom de la parcelle",crop:"Culture",id:"Identifiant en base",unsaved:"Zone temporaire non enregistrée",
    unknown:"Non renseigné",area:"Superficie estimée",coordinates:"Coordonnées WGS84",
    period:"Période de recherche",from:"Du",to:"Au",geometry:"Schéma du périmètre",
    notMap:"Schéma des limites, non un plan cadastral certifié.",
    titleAnalysis:"Résultats de télédétection",indicator:"Indice",mean:"Moyenne",range:"Min. / Max.",pixels:"Pixels valides",
    coverage:"Couverture valide",acquisition:"Date d'acquisition",scene:"ID de la scène",cloud:"Nébulosité de la scène",
    provider:"Fournisseur",mask:"Masque du polygone",applied:"Appliqué",notApplied:"Non confirmé",
    evidence:"Statut de preuve",computed:"Calculé - non vérifié sur le terrain",
    notReady:"Aucun résultat spectral utilisable pour cette zone et cette période.",notRun:"Aucune analyse encore demandée.",
    notes:"Méthode et limites",note1:"Images Sentinel-2 L2A, indices calculés dans le backend FOGGARA par Rasterio.",
    note2:"NDVI représente la vigueur spectrale de la végétation ; NDMI, un indicateur indirect de l'eau de la canopée, et non une analyse de sol.",
    note3:"Superficie calculée à partir des limites dessinées, sans valeur de relevé cadastral ni titre de propriété.",
    note4:"Les résultats non classés VERIFIED ne sont pas des mesures certifiées de terrain.",
    footer:"FOGGARA-DZ · EURL SIREP OASES NEXUS WEFEH · Algérie",status:"Statut d'enregistrement",saved:"Enregistrée dans l'organisation",temporary:"Non enregistrée",
  },
  en:{
    document:"Field boundary & satellite analysis report",subtitle:"Algerian Integrated Platform for Sustainable Resource Management",
    confidentiality:"Issued by the FOGGARA-DZ platform",reportId:"Report reference",generated:"Issued",
    field:"Agricultural field",fieldName:"Field name",crop:"Crop",id:"Database parcel ID",unsaved:"Unsaved temporary area",
    unknown:"Not specified",area:"Estimated area",coordinates:"WGS84 bounds",
    period:"Search period",from:"From",to:"To",geometry:"Field boundary diagram",
    notMap:"Illustration of geometry only. Not a certified cadastral survey.",
    titleAnalysis:"Satellite analysis findings",indicator:"Index",mean:"Mean",range:"Min / Max",pixels:"Valid pixels",
    coverage:"Valid pixel coverage",acquisition:"Acquired",scene:"Scene ID",cloud:"Scene cloud cover",
    provider:"Data provider",mask:"Polygon mask",applied:"Applied",notApplied:"Not confirmed",
    evidence:"Evidence status",computed:"Computed - not ground verified",
    notReady:"No usable spectral calculation was returned for this area and period.",notRun:"No analysis has been requested for this field yet.",
    notes:"Methodology and limitations",note1:"Sentinel-2 L2A acquisitions; indices computed on FOGGARA backend using Rasterio.",
    note2:"NDVI describes spectral vegetation greenness and NDMI canopy-water conditions; they are not certified soil chemistry or field irrigation measurements.",
    note3:"Area is estimated from the drawn polygon, not a cadastral survey or legal property record.",
    note4:"Evidence not classed as VERIFIED must not be presented as confirmed on-site measurements.",
    footer:"FOGGARA-DZ · EURL SIREP OASES NEXUS WEFEH · Algeria",status:"Storage status",saved:"Saved to organization database",temporary:"Not saved",
  }
} as const;

const num=(v:number|null|undefined,decimals=3)=>
  typeof v==="number"&&Number.isFinite(v)?v.toFixed(decimals):"—";

function polygonPoints(geometry:FoggaraPolygon,bbox:[number,number,number,number]):string{
  const ring=geometry.coordinates[0]??[];
  const [west,south,east,north]=bbox;
  const dx=east-west,dy=north-south;
  if(dx<=0||dy<=0)return "";
  const factor=Math.min(310/dx,180/dy);
  const offsetX=(340-dx*factor)/2,offsetY=(210-dy*factor)/2;
  return ring.filter(x=>x.length===2&&x.every(Number.isFinite))
    .map(([x,y])=>[offsetX+(x-west)*factor,offsetY+(north-y)*factor].map(n=>n.toFixed(2)).join(","))
    .join(" ");
}

export function FieldPdfReport({lang,geometry,bbox,estimatedAreaHa,fieldName,crop,fieldId,period,evidence,createdAt}:FieldPdfReportProps){
  const t=strings[lang];
  const direction=lang==="ar"?"rtl":"ltr";
  const stat=evidence?.status==="READY"?evidence.metrics?.statistics:null;
  const pix=evidence?.status==="READY"?evidence.metrics?.pixels:null;
  const reportRef="FG-"+createdAt.replace(/[^0-9]/g,"").slice(0,14)+(fieldId!==null?"-P"+fieldId:"-AOI");
  return <article className="fg-field-pdf-sheet" id="foggara-field-pdf-report" lang={lang} dir={direction}
      aria-label={t.document}>
    <header className="fg-pdf-header">
      <div className="fg-pdf-logo"><span>FOGGARA</span><strong>DZ</strong><small>WATER · ENERGY · FOOD · ECOSYSTEM · HEALTH</small></div>
      <div><h1>{t.document}</h1><p>{t.subtitle}</p></div>
    </header>
    <div className="fg-pdf-meta">
      <span>{t.confidentiality}</span>
      <span>{t.reportId}: <b dir="ltr">{reportRef}</b></span>
      <span>{t.generated}: <b dir="ltr">{createdAt.slice(0,10)}</b></span>
    </div>
    <section className="fg-pdf-section">
      <h2><span>01</span>{t.field}</h2>
      <div className="fg-pdf-tiles">
        <div><label>{t.fieldName}</label><strong>{fieldName||t.unsaved}</strong></div>
        <div><label>{t.crop}</label><strong>{crop||t.unknown}</strong></div>
        <div><label>{t.area}</label><strong dir="ltr">{num(estimatedAreaHa,3)} ha</strong></div>
        <div><label>{t.status}</label><strong>{fieldId===null?t.temporary:t.saved}</strong></div>
      </div>
      {fieldId!==null?<p className="fg-pdf-small">{t.id}: <b dir="ltr">{fieldId}</b></p>:null}
      <div className="fg-pdf-geo">
        <div className="fg-pdf-geometry">
          <p>{t.geometry}</p>
          <svg viewBox="0 0 340 210" role="img" aria-label={t.geometry}>
            <rect x="1" y="1" width="338" height="208" rx="8" fill="#f1f7f2" stroke="#dce8df"/>
            <path d="M 30 30 V 181 M 90 30 V 181 M 150 30 V 181 M 210 30 V 181 M 270 30 V 181 M 320 30 V 181 M 20 50 H 320 M 20 100 H 320 M 20 150 H 320" stroke="#d4e3d7" strokeWidth=".7"/>
            <polygon points={polygonPoints(geometry,bbox)} fill="#75b49155" stroke="#16784c" strokeWidth="2.3" vectorEffect="non-scaling-stroke"/>
            <text x="15" y="194" fontSize="10" fill="#516f5b">WGS84 / EPSG:4326</text>
          </svg>
          <small>{t.notMap}</small>
        </div>
        <div className="fg-pdf-extent">
          <h3>{t.coordinates}</h3>
          <div dir="ltr"><span>West</span><b>{num(bbox[0],6)}</b></div>
          <div dir="ltr"><span>South</span><b>{num(bbox[1],6)}</b></div>
          <div dir="ltr"><span>East</span><b>{num(bbox[2],6)}</b></div>
          <div dir="ltr"><span>North</span><b>{num(bbox[3],6)}</b></div>
          <h3>{t.period}</h3>
          <div><span>{t.from}</span><b dir="ltr">{period.start}</b></div>
          <div><span>{t.to}</span><b dir="ltr">{period.end}</b></div>
        </div>
      </div>
    </section>
    <section className="fg-pdf-section fg-pdf-analysis">
      <h2><span>02</span>{t.titleAnalysis}</h2>
      {evidence?.status==="READY"&&stat&&typeof stat.mean==="number"?
        <>
          <div className="fg-pdf-result-hero">
            <div><label>{t.indicator}</label><strong dir="ltr">{evidence.index.toUpperCase()}</strong></div>
            <div><label>{t.mean}</label><strong dir="ltr">{num(stat.mean,3)}</strong></div>
            <div><label>{t.evidence}</label><strong>{t.computed}</strong></div>
          </div>
          <div className="fg-pdf-table">
            <div><span>{t.range}</span><strong dir="ltr">{num(stat.min)} / {num(stat.max)}</strong></div>
            <div><span>{t.pixels}</span><strong dir="ltr">{pix?.valid??"—"}</strong></div>
            <div><span>{t.coverage}</span><strong dir="ltr">{typeof pix?.valid_fraction==="number"?num(pix.valid_fraction*100,1)+"%":"—"}</strong></div>
            <div><span>{t.acquisition}</span><strong dir="ltr">{evidence.scene?.datetime?.slice(0,10)||"—"}</strong></div>
            <div><span>{t.scene}</span><strong dir="ltr" className="fg-pdf-break">{evidence.scene?.id||"—"}</strong></div>
            <div><span>{t.cloud}</span><strong dir="ltr">{num(evidence.scene?.cloud_cover_pct,1)}%</strong></div>
            <div><span>{t.provider}</span><strong>{evidence.scene?.provider||"Element 84 / Copernicus"}</strong></div>
            <div><span>{t.mask}</span><strong>{evidence.geometry_mask_applied?t.applied:t.notApplied}</strong></div>
          </div>
        </>:
        <div className="fg-pdf-no-data">{evidence?t.notReady:t.notRun}</div>}
    </section>
    <section className="fg-pdf-section fg-pdf-notes">
      <h2><span>03</span>{t.notes}</h2>
      <ul><li>{t.note1}</li><li>{t.note2}</li><li>{t.note3}</li><li>{t.note4}</li></ul>
    </section>
    <footer className="fg-pdf-footer"><strong>{t.footer}</strong><span>FOGGARA-DZ / EVIDENCE: OBSERVED · COMPUTED · UNVERIFIED</span></footer>
  </article>;
}

// This browser print helper intentionally lives with its report component.
// eslint-disable-next-line react-refresh/only-export-components
export function printFoggaraFieldReport(fieldName:string|null,fieldId:number|null){
  // A browser-native PDF keeps Arabic/French text selectable and preserves
  // fonts without shipping a heavyweight canvas-based PDF generator.
  const original=document.title;
  const safeName=(fieldName??"field").normalize("NFKC").replace(/[^\p{L}\p{N}_-]+/gu,"-").slice(0,50);
  document.title="FOGGARA-DZ-Field-Report-"+(fieldId??"AOI")+"-"+safeName;
  const restore=()=>{document.title=original;window.removeEventListener("afterprint",restore);};
  window.addEventListener("afterprint",restore);
  window.print(); // User chooses "Save as PDF" in the native print dialog.
}
