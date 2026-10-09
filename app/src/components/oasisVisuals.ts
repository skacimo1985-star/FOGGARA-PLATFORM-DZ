/**
 * Optional, curated FOGGARA oasis illustrations.
 * Place user-supplied .webp files in app/src/assets/oasis-gallery/.
 * Vite discovers only files that actually exist; missing assets never cause 404s.
 * These are AI-assisted illustrations, not verified field survey photographs.
 */
export type OasisVisualLocale = "ar" | "fr" | "en";
export type OasisVisualCategory = "foggara" | "oasis" | "sahara";
export type OasisVisual = {
  id: string;
  category: OasisVisualCategory;
  alt: Record<OasisVisualLocale, string>;
};
export const oasisVisuals: readonly OasisVisual[] = [
  {id:"kasria-earth-channels",category:"foggara",alt:{ar:"قنوات طينية لتوزيع المياه",fr:"Canaux en terre de distribution de l'eau",en:"Earthen water distribution channels"}},
  {id:"palm-oasis-kasria",category:"foggara",alt:{ar:"مجارٍ مائية بين النخيل",fr:"Canaux d'eau dans la palmeraie",en:"Water channels among date palms"}},
  {id:"kasria-water-distribution",category:"foggara",alt:{ar:"القصرية وتقسيم جريان المياه",fr:"Kasria et répartition du débit",en:"Kasria water-flow distribution"}},
  {id:"oasis-irrigation-stream",category:"foggara",alt:{ar:"مجرى ري في بستان نخيل",fr:"Canal d'irrigation dans l'oasis",en:"Irrigation stream in a palm grove"}},
  {id:"traditional-kasria-outlets",category:"foggara",alt:{ar:"فتحات القصرية التقليدية",fr:"Sorties d'une kasria traditionnelle",en:"Traditional kasria outlets"}},
  {id:"rock-kasria-detail",category:"foggara",alt:{ar:"تفصيل لقنوات تقسيم المياه في الصخر",fr:"Canaux de partage de l'eau dans la roche",en:"Rock-cut water distribution channels"}},
  {id:"palm-kasria-alternate",category:"foggara",alt:{ar:"القصرية تحت أشجار النخيل",fr:"Kasria sous les palmiers",en:"Kasria under palm trees"}},
  {id:"oasis-palms-blue-sky",category:"oasis",alt:{ar:"واحة ونخيل تحت السماء الصافية",fr:"Oasis et palmiers sous le ciel bleu",en:"Oasis palms under a blue sky"}},
  {id:"oasis-palm-reflection",category:"oasis",alt:{ar:"انعكاس النخيل على مياه الواحة",fr:"Reflets des palmiers dans l'eau",en:"Palm reflections in oasis water"}},
  {id:"sunset-over-oasis",category:"oasis",alt:{ar:"غروب الشمس فوق واحة النخيل",fr:"Coucher de soleil sur l'oasis",en:"Sunset over a palm oasis"}},
  {id:"oasis-rock-pool",category:"oasis",alt:{ar:"بركة ماء بين الصخور الصحراوية",fr:"Bassin naturel entre les roches",en:"Water pool among desert rocks"}},
  {id:"sahara-desert-rocks",category:"sahara",alt:{ar:"جبال وكثبان الصحراء الجزائرية",fr:"Roches et dunes sahariennes",en:"Saharan rocks and dunes"}},
  {id:"sahara-cultural-scene",category:"sahara",alt:{ar:"مشهد ثقافي من الصحراء",fr:"Scène culturelle saharienne",en:"Saharan cultural scene"}}
] as const;

const discovered = import.meta.glob("../assets/oasis-gallery/*.webp", {
  eager: true,
  query: "?url",
  import: "default"
}) as Record<string, string>;

export const getOasisPhoto = (id: string): string | null =>
  discovered[`../assets/oasis-gallery/${id}.webp`] ?? null;

export const availableOasisPhotos = oasisVisuals.flatMap(photo => {
  const src = getOasisPhoto(photo.id);
  return src ? [{ ...photo, src }] : [];
});
