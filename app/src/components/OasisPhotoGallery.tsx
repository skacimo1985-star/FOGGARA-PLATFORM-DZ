import {useState} from "react";
import {availableOasisPhotos, type OasisVisualCategory, type OasisVisualLocale} from "./oasisVisuals";
import "./oasis-photo-gallery.css";

type Filter = "all" | OasisVisualCategory;
const text = {
  ar:{all:"الكل",foggara:"الفقارة والقصرية",oasis:"الواحات",sahara:"الصحراء",note:"صور توضيحية مولدة أو معدلة بالذكاء الاصطناعي، وليست توثيقًا ميدانيًا موثقًا.",open:"عرض الصورة"},
  fr:{all:"Toutes",foggara:"Foggara et kasria",oasis:"Oasis",sahara:"Sahara",note:"Illustrations générées ou retouchées par IA ; il ne s'agit pas de photographies de terrain vérifiées.",open:"Voir l'image"},
  en:{all:"All",foggara:"Foggara & kasria",oasis:"Oases",sahara:"Sahara",note:"AI-generated or AI-edited illustrations; not verified field photographs.",open:"Open image"}
} as const;

const fallback = [
  {id:"oasis-hero",category:"oasis" as const,src:"/images/oasis-hero.webp",alt:{ar:"واحة صحراوية",fr:"Oasis saharienne",en:"Saharan oasis"}},
  {id:"foggara-heritage-poster",category:"foggara" as const,src:"/images/foggara-heritage-poster.webp",alt:{ar:"رسم توضيحي لنظام الفقارة",fr:"Illustration du système de foggara",en:"Foggara system illustration"}},
  {id:"foggara-sprite",category:"foggara" as const,src:"/images/foggara-sprite.webp",alt:{ar:"تفاصيل مكونات الفقارة",fr:"Détails du système de foggara",en:"Foggara system details"}}
];

export function OasisPhotoGallery({lang}:{lang:OasisVisualLocale}) {
  const [filter,setFilter]=useState<Filter>("all");
  const content=text[lang];
  const photos=availableOasisPhotos.length ? availableOasisPhotos : fallback;
  const visible=filter==="all" ? photos : photos.filter(photo=>photo.category===filter);
  const filterOptions:Filter[]=["all","foggara","oasis","sahara"];

  return <div className="oasis-gallery-content">
    <div className="oasis-gallery-filters" role="group" aria-label={content.all}>
      {filterOptions.map(option=><button key={option} type="button"
        aria-pressed={filter===option}
        className={filter===option?"active":""}
        onClick={()=>setFilter(option)}>{content[option]}</button>)}
    </div>
    <div className="oasis-gallery-grid">
      {visible.map(photo=><figure key={photo.id} className={"oasis-gallery-card oasis-gallery-"+photo.category}>
        <a href={photo.src} target="_blank" rel="noopener noreferrer" aria-label={content.open+": "+photo.alt[lang]}>
          <img src={photo.src} alt={photo.alt[lang]} loading="lazy" decoding="async"/>
        </a>
        <figcaption>{photo.alt[lang]}</figcaption>
      </figure>)}
    </div>
    {visible.length===0&&<p className="oasis-gallery-empty">{content.note}</p>}
    <p className="oasis-gallery-disclaimer">{content.note}</p>
  </div>;
}
