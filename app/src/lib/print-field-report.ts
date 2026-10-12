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
