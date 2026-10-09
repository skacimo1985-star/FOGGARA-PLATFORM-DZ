import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const read=path=>readFileSync(new URL(path,import.meta.url),"utf8");

test("FOGGARA's GIS has a real PDF export action on field area, not fabricated server data",()=>{
  const page=read("../src/pages/PublicGis.tsx");
  assert.ok(page.includes('import {FieldPdfReport,printFoggaraFieldReport,type FieldPdfEvidence}'));
  assert.ok(page.includes('onClick={()=>printFoggaraFieldReport(fieldName.trim()||null,savedFieldId)}'));
  assert.ok(page.includes('disabled={!area||!bbox}'));
  assert.ok(page.includes('result?{'));
  assert.ok(page.includes('metrics:activeMetrics??null'));
  assert.ok(page.includes('result.evidence.verified===true'));
  assert.ok(page.includes('<FieldPdfReport'));
  assert.ok(page.includes('geometry={area} bbox={bbox}'));
  assert.ok(page.includes('estimatedAreaHa={polygonAreaHectares(area)}'));
  assert.ok(page.includes('fieldId={savedFieldId}'));
  assert.ok(page.includes('period={{start,end}} evidence={pdfEvidence}'));
  assert.ok(!page.includes('sample_ndvi_pdf'));
});

test("FOGGARA PDF report documents source and explicitly differentiates uncomputed from real analysis",()=>{
  const pdf=read("../src/components/FieldPdfReport.tsx");
  assert.ok(pdf.includes('evidence?.status==="READY"&&stat&&typeof stat.mean==="number"'));
  assert.ok(pdf.includes('{evidence?t.notReady:t.notRun}'));
  assert.ok(pdf.includes('fieldId===null?t.temporary:t.saved'));
  assert.ok(pdf.includes('evidence.geometry_mask_applied?t.applied:t.notApplied'));
  assert.ok(pdf.includes('estimatedAreaHa'));
  assert.ok(pdf.includes('evidence.scene?.id'));
  assert.ok(pdf.includes('evidence.scene?.datetime'));
  assert.ok(pdf.includes('Sentinel-2 L2A'));
  assert.ok(pdf.includes('Rasterio'));
  assert.ok(pdf.includes('not verified'));
  assert.ok(pdf.includes('reportRef'));
});

test("private GIS exports the same protected report only for an explicit area",()=>{
  const page=read("../src/pages/Gis.tsx");
  assert.ok(page.includes('import {FieldPdfReport,printFoggaraFieldReport,type FieldPdfEvidence}'));
  assert.ok(page.includes('selectedParcelRecord?.boundary_geojson ?? draftPolygon'));
  assert.ok(page.includes('(manualAnalysisBbox ? bboxPolygon(manualAnalysisBbox) : null)'));
  assert.ok(page.includes('reportBbox.every((value,i)=>Math.abs(value-fieldIntelligenceResult.bbox_wgs84[i])<0.00001)'));
  assert.ok(page.includes('fieldIntelligenceResult.period.start===sceneStart'));
  assert.ok(page.includes('fieldIntelligenceResult.period.end===sceneEnd'));
  assert.ok(page.includes('fieldIntelligenceResult.geometry_mask_applied===true'));
  assert.ok(page.includes('disabled={!reportGeometry||!reportBbox}'));
  assert.ok(page.includes('fieldId={selectedParcelId}'));
  assert.ok(page.includes('<FieldPdfReport lang={lang}'));
  const css=read("../src/components/field-pdf-report.css");
  assert.ok(css.includes('.fg-gis-workspace > :not(.fg-field-pdf-sheet){display:none!important}'));
});

test("print/export to PDF uses local native print with searchable RTL, not a remote vendor",()=>{
  const pdf=read("../src/components/FieldPdfReport.tsx");
  const css=read("../src/components/field-pdf-report.css");
  assert.ok(pdf.includes('window.print()'));
  assert.ok(pdf.includes('window.addEventListener("afterprint",restore)'));
  assert.ok(pdf.includes('document.title="FOGGARA-DZ-Field-Report-"'));
  assert.ok(!pdf.includes('fetch('));
  assert.ok(!pdf.includes('localStorage'));
  assert.ok(css.includes('@page{size:A4 portrait;margin:12mm}'));
  assert.ok(css.includes('@media print'));
  assert.ok(css.includes('.fg-field-pdf-sheet,.fg-field-pdf-sheet *{visibility:visible!important}'));
  assert.ok(css.includes('-webkit-print-color-adjust:exact'));
  for(const lang of ['ar:','fr:','en:'])assert.ok(pdf.includes(lang));
});

test("PDF TypeScript and GIS TSX both transpile without syntax diagnostics",()=>{
  for(const filename of ["../src/components/FieldPdfReport.tsx","../src/pages/PublicGis.tsx","../src/pages/Gis.tsx"]){
    const source=read(filename);
    const output=ts.transpileModule(source,{fileName:filename,compilerOptions:{
      target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX,
    },reportDiagnostics:true});
    assert.deepEqual((output.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error)
      .map(x=>ts.flattenDiagnosticMessageText(x.messageText," ")),[],filename);
  }
});
