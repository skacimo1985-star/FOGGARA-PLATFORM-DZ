import { useEffect, useMemo, useRef, useState } from "react";
import { Check, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "react-i18next";

type Point = [number, number];
type Boundary = { type: "Polygon"; coordinates: Point[][] };
type Parcel = {
  id: number;
  name: string;
  lat?: number | null;
  lon?: number | null;
  boundary_geojson?: Boundary | null;
};

type GeoJsonSource = { setData: (data: unknown) => void };
type MapEvent = { lngLat?: { lng: number; lat: number } };
type MapInstance = {
  addControl: (control: unknown, position?: string) => void;
  addSource: (id: string, source: Record<string, unknown>) => void;
  addLayer: (layer: Record<string, unknown>) => void;
  getSource: (id: string) => unknown;
  on: (event: string, handler: (event: MapEvent) => void) => void;
  fitBounds: (bounds: [Point, Point], options?: Record<string, unknown>) => void;
  remove: () => void;
};
type MapLibreModule = {
  Map: new (options: Record<string, unknown>) => MapInstance;
  NavigationControl: new (options?: Record<string, unknown>) => unknown;
  setWorkerUrl?: (url: string) => void;
};

const MAPLIBRE_MODULE_URL = "/vendor/maplibre-gl.mjs";
const MAPLIBRE_WORKER_URL = "/vendor/maplibre-gl-worker.mjs";
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const ALGERIA_CENTER: Point = [2.6, 28.2];

function asSource(value: unknown): GeoJsonSource | null {
  if (value && typeof value === "object" && "setData" in value &&
      typeof (value as {setData?:unknown}).setData === "function") return value as GeoJsonSource;
  return null;
}

function pointsFromBoundary(boundary?: Boundary | null): Point[] {
  const ring = boundary?.type === "Polygon" ? boundary.coordinates?.[0] : undefined;
  if (!Array.isArray(ring) || ring.length < 4) return [];
  return ring.slice(0, -1).filter((p): p is Point =>
    Array.isArray(p) && p.length >= 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1]))
  ).map(p => [Number(p[0]), Number(p[1])]);
}

function collection(points: Point[]) {
  const features: Record<string, unknown>[] = points.map((p, i) => ({
    type: "Feature", id: `v-${i}`, properties: {kind:"vertex",order:i+1},
    geometry: {type:"Point",coordinates:p},
  }));
  if (points.length >= 2) features.push({
    type:"Feature",properties:{kind:"edge"},
    geometry:{type:"LineString",coordinates:points},
  });
  if (points.length >= 3) features.push({
    type:"Feature",properties:{kind:"polygon"},
    geometry:{type:"Polygon",coordinates:[[...points,points[0]]]},
  });
  return {type:"FeatureCollection",features};
}

function bounds(points: Point[]): [Point,Point] | null {
  if (!points.length) return null;
  const lons=points.map(p=>p[0]), lats=points.map(p=>p[1]);
  return [[Math.min(...lons),Math.min(...lats)],[Math.max(...lons),Math.max(...lats)]];
}

export default function ParcelBoundaryEditor({parcel,onSaved}:{parcel:Parcel;onSaved:()=>void|Promise<void>}) {
  const {i18n}=useTranslation();
  const lang=i18n.language==="fr"?"fr":i18n.language==="en"?"en":"ar";
  const text=lang==="fr"?{
    title:"Limites réelles de la parcelle",note:"Cliquez sur la carte pour dessiner le contour extérieur. Minimum 3 sommets. Le serveur rejette les polygones auto-croisés.",
    undo:"Annuler",reset:"Recommencer",save:"Enregistrer les limites",remove:"Supprimer les limites",saved:"Limites enregistrées",removed:"Limites supprimées",error:"Impossible d'enregistrer cette géométrie.",vertices:"sommets",
  }:lang==="en"?{
    title:"Real parcel boundary",note:"Click the map to draw the exterior ring. Minimum 3 vertices. The server rejects self-intersecting polygons.",
    undo:"Undo",reset:"Reset",save:"Save boundary",remove:"Remove boundary",saved:"Boundary saved",removed:"Boundary removed",error:"Could not save this geometry.",vertices:"vertices",
  }:{
    title:"حدود القطعة الحقيقية",note:"اضغط على الخريطة لرسم الحد الخارجي. يلزم 3 رؤوس على الأقل، والخادم يرفض المضلع المتقاطع ذاتيًا.",
    undo:"تراجع",reset:"إعادة الرسم",save:"حفظ الحدود",remove:"حذف الحدود",saved:"تم حفظ الحدود",removed:"تم حذف الحدود",error:"تعذر حفظ هذه الهندسة.",vertices:"رؤوس",
  };
  const initial=useMemo(()=>pointsFromBoundary(parcel.boundary_geojson),[parcel.id,parcel.boundary_geojson]);
  const [points,setPoints]=useState<Point[]>(initial);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");
  const host=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<MapInstance|null>(null);
  const pointsRef=useRef<Point[]>(points);
  pointsRef.current=points;

  useEffect(()=>{setPoints(initial);setMessage("");setError("");},[initial]);

  useEffect(()=>{
    let cancelled=false; let map:MapInstance|null=null;
    const boot=async()=>{
      try{
        const mod=await import(/* @vite-ignore */ MAPLIBRE_MODULE_URL) as unknown as MapLibreModule;
        if(cancelled||!host.current)return;
        mod.setWorkerUrl?.(MAPLIBRE_WORKER_URL);
        const center:Point=parcel.lon!=null&&parcel.lat!=null?[Number(parcel.lon),Number(parcel.lat)]:ALGERIA_CENTER;
        map=new mod.Map({container:host.current,style:STYLE_URL,center,zoom:parcel.lon!=null?14:4.1,minZoom:2,maxZoom:19,attributionControl:true,maplibreLogo:false});
        mapRef.current=map;
        map.addControl(new mod.NavigationControl({showCompass:true}),"top-left");
        map.on("load",()=>{
          if(!map||cancelled)return;
          map.addSource("parcel-boundary-draw",{type:"geojson",data:collection(pointsRef.current)});
          map.addLayer({id:"parcel-boundary-fill",type:"fill",source:"parcel-boundary-draw",filter:["==",["geometry-type"],"Polygon"],paint:{"fill-color":"#178568","fill-opacity":0.2}});
          map.addLayer({id:"parcel-boundary-line",type:"line",source:"parcel-boundary-draw",filter:["in",["geometry-type"],["literal",["LineString","Polygon"]]],paint:{"line-color":"#0f6f56","line-width":3}});
          map.addLayer({id:"parcel-boundary-vertices",type:"circle",source:"parcel-boundary-draw",filter:["==",["geometry-type"],"Point"],paint:{"circle-radius":5,"circle-color":"#f0b75d","circle-stroke-color":"#ffffff","circle-stroke-width":2}});
          const b=bounds(pointsRef.current); if(b) map.fitBounds(b,{padding:55,maxZoom:17,duration:0});
        });
        map.on("click",(event)=>{
          if(!event.lngLat||pointsRef.current.length>=500)return;
          const p:Point=[Number(event.lngLat.lng.toFixed(8)),Number(event.lngLat.lat.toFixed(8))];
          setPoints(current=>[...current,p]);
        });
      }catch{if(!cancelled)setError(text.error);}
    };
    void boot();
    return()=>{cancelled=true;map?.remove();mapRef.current=null;};
  },[parcel.id]);

  useEffect(()=>{
    const source=asSource(mapRef.current?.getSource("parcel-boundary-draw"));
    source?.setData(collection(points));
  },[points]);

  async function save(){
    if(points.length<3||busy)return;
    setBusy(true);setError("");setMessage("");
    try{
      const boundary:Boundary={type:"Polygon",coordinates:[[...points,points[0]]]};
      await api.patch(`/agriculture/parcels/${parcel.id}`,{boundary_geojson:boundary});
      setMessage(text.saved);await onSaved();
    }catch{setError(text.error);}finally{setBusy(false);}
  }
  async function remove(){
    if(busy)return;setBusy(true);setError("");setMessage("");
    try{await api.patch(`/agriculture/parcels/${parcel.id}`,{boundary_geojson:null});setPoints([]);setMessage(text.removed);await onSaved();}
    catch{setError(text.error);}finally{setBusy(false);}
  }

  return <div className="fg-form">
    <div className="fg-panel-title"><h3>{text.title}</h3><span className="fg-badge">{points.length} {text.vertices}</span></div>
    <p className="fg-footnote">{text.note}</p>
    <div ref={host} className="fg-maplibre-host" style={{height:320,borderRadius:14,overflow:"hidden"}} role="application" aria-label={text.title}/>
    <div className="fg-actions">
      <button type="button" className="fg-secondary" disabled={!points.length||busy} onClick={()=>setPoints(p=>p.slice(0,-1))}><Undo2 size={16}/>{text.undo}</button>
      <button type="button" className="fg-secondary" disabled={!points.length||busy} onClick={()=>setPoints([])}><RotateCcw size={16}/>{text.reset}</button>
      <button type="button" className="fg-primary" disabled={points.length<3||busy} onClick={()=>void save()}><Check size={16}/>{text.save}</button>
      {parcel.boundary_geojson&&<button type="button" className="fg-secondary" disabled={busy} onClick={()=>void remove()}><Trash2 size={16}/>{text.remove}</button>}
    </div>
    {message&&<p role="status" className="fg-footnote">{message}</p>}
    {error&&<p role="alert" className="fg-error">{error}</p>}
  </div>;
}
