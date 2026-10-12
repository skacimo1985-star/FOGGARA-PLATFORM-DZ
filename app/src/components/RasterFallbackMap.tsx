import {useCallback,useEffect,useRef,useState} from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type {NationalMapProps} from "./NationalMap";
import {boundsOfPolygon,rectanglePolygon,type FoggaraPolygon} from "@/lib/foggara-aoi";
import {polygonAreaHectares} from "@/lib/geojson-area";
import "./raster-fallback-map.css";

type Point=[number,number];
type Mode="none"|"polygon"|"rectangle";
const ALGERIA:L.LatLngBoundsExpression=[[18.4,-8.8],[37.5,12.2]];
const copy={
  ar:{title:"الخريطة الجغرافية",fallback:"خريطة ثنائية الأبعاد",draw:"رسم حدود",rectangle:"تحديد مستطيل",finish:"اعتماد الحدود",cancel:"إلغاء الرسم",fit:"تركيز على القطعة",reset:"الجزائر",hint:"اضغط على الخريطة لتحديد رؤوس المضلع ثم اعتمد الحدود.",boxHint:"اضغط على زاويتين لتحديد المستطيل.",area:"مساحة تقديرية",invalid:"اختر حدودًا صالحة داخل الجزائر.",loading:"جارٍ تحميل الخريطة…",failed:"تعذر تحميل خلفية الخريطة؛ يمكنك متابعة رسم الحدود والقياس.",result:"طبقة التحليل",opacity:"شفافية المؤشر"},
  fr:{title:"Carte géographique",fallback:"Carte 2D",draw:"Dessiner",rectangle:"Rectangle",finish:"Valider",cancel:"Annuler",fit:"Cadrer la parcelle",reset:"Algérie",hint:"Cliquez sur les sommets puis validez la limite.",boxHint:"Cliquez sur deux coins opposés.",area:"Surface estimée",invalid:"Choisissez une limite valide en Algérie.",loading:"Chargement de la carte…",failed:"Fond indisponible ; le dessin et les mesures restent utilisables.",result:"Couche d'analyse",opacity:"Opacité de l'indice"},
  en:{title:"Geographic map",fallback:"2D map",draw:"Draw boundary",rectangle:"Rectangle",finish:"Use boundary",cancel:"Cancel drawing",fit:"Fit field",reset:"Algeria",hint:"Click each vertex, then confirm the boundary.",boxHint:"Click two opposite corners.",area:"Estimated area",invalid:"Select a valid boundary inside Algeria.",loading:"Loading map…",failed:"Basemap unavailable; boundaries and measurements remain usable.",result:"Analysis layer",opacity:"Index opacity"},
};

export default function RasterFallbackMap(props:NationalMapProps){
  const lang=props.locale==="fr"?"fr":props.locale==="en"?"en":"ar";
  const text=copy[lang];
  const host=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<L.Map|null>(null);
  const boundaryLayer=useRef<L.LayerGroup|null>(null);
  const drawingLayer=useRef<L.LayerGroup|null>(null);
  const modeRef=useRef<Mode>("none");
  const pointsRef=useRef<Point[]>([]);
  const callbacks=useRef(props);
  const [ready,setReady]=useState(false);
  const [mode,setMode]=useState<Mode>("none");
  const [points,setPoints]=useState<Point[]>([]);
  const [invalid,setInvalid]=useState(false);
  const [tileError,setTileError]=useState(false);
  const [opacity,setOpacity]=useState(0.8);
  const [showResult,setShowResult]=useState(true);
  useEffect(()=>{callbacks.current=props;});
  const startDrawing=useCallback((next:Mode)=>{
    modeRef.current=next;pointsRef.current=[];
    setMode(next);setPoints([]);setInvalid(false);drawingLayer.current?.clearLayers();
  },[]);
  const accept=useCallback((poly:FoggaraPolygon)=>{
    if(!boundsOfPolygon(poly)||polygonAreaHectares(poly)<=0){setInvalid(true);return;}
    if(callbacks.current.onDrawParcelBoundary)callbacks.current.onDrawParcelBoundary(poly);
    else callbacks.current.onAnalysisSelectionChange?.(boundsOfPolygon(poly));
    startDrawing("none");
  },[startDrawing]);
  useEffect(()=>{
    if(!host.current)return;
    const map=L.map(host.current,{zoomControl:true,doubleClickZoom:false,maxZoom:19});
    mapRef.current=map;
    map.fitBounds(ALGERIA);
    const tiles=L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    tiles.on("tileerror",()=>setTileError(true));
    tiles.on("tileload",()=>setTileError(false));
    boundaryLayer.current=L.layerGroup().addTo(map);
    drawingLayer.current=L.layerGroup().addTo(map);
    L.control.scale({imperial:false}).addTo(map);
    map.on("click",(event:L.LeafletMouseEvent)=>{
      if(modeRef.current==="none")return;
      const point:Point=[event.latlng.lng,event.latlng.lat];
      if(point[0]<-8.8||point[0]>12.2||point[1]<18.4||point[1]>37.5){setInvalid(true);return;}
      const next=[...pointsRef.current,point];
      if(next.length>512){setInvalid(true);return;}
      pointsRef.current=next;setPoints(next);
      drawingLayer.current?.clearLayers();
      L.polyline(next.map(([lon,lat])=>[lat,lon]),{color:"#a76b16",weight:3}).addTo(drawingLayer.current!);
      next.forEach(([lon,lat])=>L.circleMarker([lat,lon],{radius:4,color:"#a76b16"}).addTo(drawingLayer.current!));
      if(modeRef.current==="rectangle"&&next.length===2){
        const [[a,b],[c,d]]=next;
        accept(rectanglePolygon([Math.min(a,c),Math.min(b,d),Math.max(a,c),Math.max(b,d)]));
      }
    });
    map.on("moveend",()=>{
      const b=map.getBounds();
      callbacks.current.onViewportChange?.([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]);
    });
    const observer=new ResizeObserver(()=>map.invalidateSize());
    observer.observe(host.current);
    map.whenReady(()=>setReady(true));
    return()=>{observer.disconnect();map.remove();mapRef.current=null;};
  },[accept]);
  useEffect(()=>{
    const layer=boundaryLayer.current;if(!ready||!layer)return;
    layer.clearLayers();
    for(const field of props.parcelBoundaries??[]){
      const feature=L.geoJSON(field as GeoJSON.Feature,{style:{color:field.properties.selected?"#b47b24":"#236f5b",weight:3,fillOpacity:0.08}});
      const label=document.createElement("span");label.textContent=field.properties.name;
      feature.bindTooltip(label);
      feature.on("click",()=>{if(modeRef.current==="none")callbacks.current.onSelectParcel?.(field.id);});
      feature.addTo(layer);
    }
    if(props.draftParcelBoundary)L.geoJSON(props.draftParcelBoundary,{style:{color:"#b47b24",weight:3,fillOpacity:0.12}}).addTo(layer);
    for(const entry of props.sites){
      const site=entry.site;
      if(typeof site.lat!=="number"||typeof site.lon!=="number")continue;
      const marker=L.circleMarker([site.lat,site.lon],{radius:5,color:"#236f5b"});
      marker.on("click",()=>{if(modeRef.current==="none")callbacks.current.onSelectSite?.(site.id);});
      marker.addTo(layer);
    }
  },[ready,props.parcelBoundaries,props.draftParcelBoundary,props.sites]);
  useEffect(()=>{
    const b=props.analysisSelectionBbox;
    if(ready&&b)mapRef.current?.fitBounds([[b[1],b[0]],[b[3],b[2]]],{padding:[35,35],maxZoom:17});
  },[ready,props.analysisSelectionBbox]);
  useEffect(()=>{
    const map=mapRef.current;const image=props.analysisOverlay;
    if(!ready||!map||!image||!showResult)return;
    const [w,s,e,n]=image.bbox;
    const layer=L.imageOverlay(image.url,[[s,w],[n,e]],{opacity,interactive:false}).addTo(map);
    return()=>{layer.remove();};
  },[ready,props.analysisOverlay,opacity,showResult]);
  const draft: FoggaraPolygon|null=points.length>=3?{type:"Polygon",coordinates:[[...points,points[0]]]}:null;
  return <section className="fg-national-map fg-raster-fallback" aria-label={text.title} dir={lang==="ar"?"rtl":"ltr"}>
    <div className="fg-raster-tools" role="group" aria-label={text.title}>
      <span>{text.fallback}</span>
      <button type="button" aria-pressed={mode==="polygon"} onClick={()=>startDrawing("polygon")}>{text.draw}</button>
      <button type="button" aria-pressed={mode==="rectangle"} onClick={()=>startDrawing("rectangle")}>{text.rectangle}</button>
      {mode!=="none"?<><button type="button" disabled={!draft} onClick={()=>{if(draft)accept(draft);}}>{text.finish}</button><button type="button" onClick={()=>startDrawing("none")}>{text.cancel}</button></>:null}
      <button type="button" disabled={!props.analysisSelectionBbox} onClick={()=>{const b=props.analysisSelectionBbox;if(b)mapRef.current?.fitBounds([[b[1],b[0]],[b[3],b[2]]],{maxZoom:17,padding:[35,35]});}}>{text.fit}</button>
      <button type="button" onClick={()=>mapRef.current?.fitBounds(ALGERIA)}>{text.reset}</button>
    </div>
    <div className="fg-national-map-canvas"><div className="fg-raster-host" ref={host} aria-label={text.title}/></div>
    <div className="fg-raster-status" aria-live="polite">
      {!ready?text.loading:invalid?text.invalid:mode==="polygon"?text.hint:mode==="rectangle"?text.boxHint:tileError?text.failed:null}
      {draft?<span>{text.area}: {polygonAreaHectares(draft).toFixed(3)} ha</span>:null}
      {props.analysisOverlay?<><label><input type="checkbox" checked={showResult} onChange={e=>setShowResult(e.target.checked)}/>{text.result} · {props.analysisOverlay.index.toUpperCase()}</label><label>{text.opacity}<input type="range" min="0.1" max="1" step="0.1" value={opacity} onChange={e=>setOpacity(Number(e.target.value))}/></label></>:null}
    </div>
  </section>;
}
