/** Transparent bounded utility model for an unsaved, user-authored exploration.
 * This is not the production feasible-only min-max ranking algorithm. */
export type MatrixAxis = {key:string; weight:number; value:string; lower:string; upper:string; direction:'maximize'|'minimize'; hard:boolean};
export type MatrixResult = {status:'incomplete'|'blocked'|'ready'; score:number|null; totalWeight:number; axes:{key:string; utility:number|null; violation:boolean}[]};
export function evaluatePresentationMatrix(axes:MatrixAxis[]):MatrixResult {
 const totalWeight=axes.reduce((s,a)=>s+a.weight,0);
 let incomplete=axes.length===0||!Number.isFinite(totalWeight)||totalWeight<=0;
 const rows=axes.map(a=>{
  const values=[a.value,a.lower,a.upper];
  if(values.some(x=>x.trim()==='')||!Number.isFinite(a.weight)||a.weight<0||a.weight>100||!['maximize','minimize'].includes(a.direction)) {incomplete=true;return {key:a.key,utility:null,violation:false};}
  const [value,lower,upper]=values.map(Number);
  if(![value,lower,upper].every(x=>Number.isFinite(x)&&Math.abs(x)<=1e15)||upper<=lower){incomplete=true;return {key:a.key,utility:null,violation:false};}
  const fraction=Math.max(0,Math.min(1,(value-lower)/(upper-lower)));
  return {key:a.key,utility:a.direction==='maximize'?fraction:1-fraction,violation:a.hard&&(value<lower||value>upper)};
 });
 const blocked=rows.some(r=>r.violation);
 return {status:incomplete?'incomplete':blocked?'blocked':'ready',score:incomplete||blocked?null:rows.reduce((s,r,i)=>s+r.utility!*axes[i].weight/totalWeight,0)*100,totalWeight,axes:rows};
}
