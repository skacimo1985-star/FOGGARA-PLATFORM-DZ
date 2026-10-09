/* FOGGARA-DZ own GIS handoff format. It stores only a user-drawn AOI in
   sessionStorage; it never stores login credentials or organization data. */
export type FoggaraPolygon={
  type:"Polygon";
  coordinates:[number,number][][];
};
export const FOGGARA_AOI_KEY="foggara_gis_aoi_v1";
export function boundsOfPolygon(value:unknown):[number,number,number,number]|null{
  if(!value||typeof value!=="object")return null;
  const x=value as Partial<FoggaraPolygon>;
  if(x.type!=="Polygon"||!Array.isArray(x.coordinates)||x.coordinates.length!==1)return null;
  const ring=x.coordinates[0];
  if(!Array.isArray(ring)||ring.length<4||ring.length>501)return null;
  if(!ring.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))return null;
  if(ring[0][0]!==ring[ring.length-1][0]||ring[0][1]!==ring[ring.length-1][1])return null;
  const xs=ring.map(x=>x[0]),ys=ring.map(x=>x[1]);
  const bounds:[number,number,number,number]=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
  if(bounds[0]<-8.8||bounds[2]>12.2||bounds[1]<18.4||bounds[3]>37.5
    ||bounds[0]>=bounds[2]||bounds[1]>=bounds[3])return null;
  return bounds;
}
export function rectanglePolygon(b:[number,number,number,number]):FoggaraPolygon{
  const [w,s,e,n]=b;
  return {type:"Polygon",coordinates:[[[w,s],[e,s],[e,n],[w,n],[w,s]]]};
}
export function saveFoggaraAoi(polygon:FoggaraPolygon):boolean{
  if(!boundsOfPolygon(polygon))return false;
  try{
    sessionStorage.setItem(FOGGARA_AOI_KEY,JSON.stringify(polygon));
    return true;
  }catch{return false;}
}
export function readFoggaraAoi():FoggaraPolygon|null{
  try{
    const raw=sessionStorage.getItem(FOGGARA_AOI_KEY);
    if(!raw)return null;
    const data:unknown=JSON.parse(raw);
    return boundsOfPolygon(data)?data as FoggaraPolygon:null;
  }catch{return null;}
}
export function clearFoggaraAoi(){
  try{sessionStorage.removeItem(FOGGARA_AOI_KEY);}catch{/* session storage unavailable */}
}
