/** Deterministic synthetic demonstration. Inputs do not leave the browser. */
export const DEMO_WATER = {
  balanced: [125,124,123,122,121,120,120],
  stress: [100,94,88,82,76,70,64],
} as const;
export function calculateDemo(areaHa:number, depthMm:number, efficiency:number, liftM:number, availableM3:number) {
  if (![areaHa,depthMm,efficiency,liftM,availableM3].every(Number.isFinite) ||
      areaHa<=0 || areaHa>100 || depthMm<=0 || depthMm>50 || efficiency<=0 || efficiency>1 ||
      liftM<0 || liftM>300 || availableM3<0) return null;
  const demandM3=areaHa*depthMm*10/efficiency;
  const energyKwh=1000*9.81*liftM*demandM3/(3_600_000*0.65);
  return {demandM3,energyKwh,balanceM3:availableM3-demandM3,blocked:demandM3>availableM3};
}
