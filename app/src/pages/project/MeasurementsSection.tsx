import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { FileDown, FileSpreadsheet, Upload } from "lucide-react";
import { api } from "@/lib/api";
import type { Instrument, Measurement } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorText, DemoBadge } from "@/components/common";
import { ProvenanceBadge } from "@/components/ProvenanceBadge";

// Keep this catalog aligned with backend/app/services/indicators.py.
// Backend remains the authority and rejects unsupported units/ranges.
const PARAM_UNITS: Record<string, string[]> = {
  flow_rate: ["L/s", "m3/h"],
  water_level: ["m"],
  ph: ["pH"],
  ec: ["dS/m"],
  tds: ["mg/L"],
  salinity: ["ppt", "g/L"],
  sar: ["index"],
  sodium: ["mg/L"],
  calcium: ["mg/L"],
  magnesium: ["mg/L"],
  chloride: ["mg/L"],
  bicarbonate: ["mg/L"],
  temperature: ["°C", "C"],
  turbidity: ["NTU"],
  pressure: ["bar", "kPa"],
  dissolved_oxygen: ["mg/L"],
  rainfall: ["mm"],
  electrical_power: ["kW"],
  voltage: ["V"],
  current: ["A"],
  energy: ["kWh"],
  humidity: ["%RH"],
  soil_moisture: ["%"],
  soil_temperature: ["°C", "C"],
  soil_nitrogen: ["mg/kg"],
  soil_phosphorus: ["mg/kg"],
  soil_potassium: ["mg/kg"],
  soil_soc: ["%"],
  soil_organic_matter: ["%"],
  soil_ec: ["dS/m"],
  air_temperature: ["°C", "C"],
  wind_speed: ["m/s"],
  solar_radiation: ["W/m2"],
  reference_et: ["mm/day"],
};

const SOURCE_TYPES = ["manual", "instrument", "imported"] as const;
const REQUIRED_HEADERS = ["parameter", "value", "unit", "measured_at", "source", "method"] as const;
const OPTIONAL_HEADERS = ["resource_id", "instrument_id", "asset_id"] as const;
const ALL_HEADERS = [...REQUIRED_HEADERS, ...OPTIONAL_HEADERS];

type CsvRecord = Record<string, string>;
type ImportRow = {
  parameter: string;
  value: number;
  unit: string;
  measured_at: string;
  source: string;
  method: string;
  resource_id: number | null;
  instrument_id: number | null;
  asset_id: number | null;
};
type ImportResult = {
  project_id: number;
  batch_reference: string;
  received: number;
  created_count: number;
  skipped_duplicates: number;
};

const qVariant = (s: string) => (s === "validated" ? "default" : s === "rejected" ? "destructive" : "outline") as "default" | "destructive" | "outline";
const vVariant = (s: string) => (s === "verified" ? "default" : s === "rejected" ? "destructive" : "outline") as "default" | "destructive" | "outline";

function parseCsv(text: string): CsvRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (quoted) throw new Error("CSV_UNCLOSED_QUOTE");
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const nonEmpty = rows.filter(values => values.some(value => value.trim() !== ""));
  if (nonEmpty.length < 2) throw new Error("CSV_EMPTY");
  const headers = nonEmpty[0].map(value => value.trim().toLowerCase());
  if (new Set(headers).size !== headers.length) throw new Error("CSV_DUPLICATE_HEADERS");
  for (const required of REQUIRED_HEADERS) if (!headers.includes(required)) throw new Error(`CSV_MISSING_${required}`);
  return nonEmpty.slice(1).map(values => Object.fromEntries(headers.map((header, index) => [header, (values[index] ?? "").trim()])));
}

function optionalId(raw: string | undefined) {
  if (!raw?.trim()) return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error("CSV_INVALID_ID");
  return value;
}

function normalizeRows(records: CsvRecord[]): ImportRow[] {
  if (records.length > 500) throw new Error("CSV_TOO_MANY_ROWS");
  return records.map((record, index) => {
    const parameter = record.parameter?.trim();
    const value = Number(record.value);
    const unit = record.unit?.trim();
    const measuredAt = record.measured_at?.trim();
    if (!parameter || !(parameter in PARAM_UNITS)) throw new Error(`CSV_ROW_${index + 2}_PARAMETER`);
    if (!Number.isFinite(value)) throw new Error(`CSV_ROW_${index + 2}_VALUE`);
    if (!unit || !PARAM_UNITS[parameter].includes(unit)) throw new Error(`CSV_ROW_${index + 2}_UNIT`);
    if (!measuredAt || !/(Z|[+-]\d{2}:\d{2})$/.test(measuredAt) || Number.isNaN(Date.parse(measuredAt))) {
      throw new Error(`CSV_ROW_${index + 2}_TIMEZONE`);
    }
    if (new Date(measuredAt).getTime() > Date.now()) throw new Error(`CSV_ROW_${index + 2}_FUTURE`);
    if (!record.source?.trim() || !record.method?.trim()) throw new Error(`CSV_ROW_${index + 2}_SOURCE`);
    return {
      parameter,
      value,
      unit,
      measured_at: new Date(measuredAt).toISOString(),
      source: record.source.trim(),
      method: record.method.trim(),
      resource_id: optionalId(record.resource_id),
      instrument_id: optionalId(record.instrument_id),
      asset_id: optionalId(record.asset_id),
    };
  });
}

function downloadTemplate() {
  const lines = [
    ALL_HEADERS.join(","),
    'ph,7.2,pH,2026-10-06T10:00:00Z,"LAB-001","ISO/lab method",,,',
    'soil_nitrogen,42,mg/kg,2026-10-06T10:05:00Z,"LAB-001","soil analysis",,,',
    'ec,1.4,dS/m,2026-10-06T10:10:00Z,"WATER-LAB-01","conductivity meter",,,',
  ];
  const url = URL.createObjectURL(new Blob([lines.join("\n")], {type:"text/csv;charset=utf-8"}));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "FOGGARA-measurements-template.csv";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function MeasurementsSection({ projectId, measurements, reload }: {
  projectId: number; measurements: Measurement[]; reload: () => void;
}) {
  const { t, i18n } = useTranslation();
  const language = i18n.language === "fr" ? "fr" : i18n.language === "en" ? "en" : "ar";
  const copy = language === "fr" ? {
    importTitle:"Importer des mesures CSV", importNote:"Jusqu’à 500 lignes. Les données restent PENDING / UNVERIFIED jusqu’à revue. Aucun import ne devient VERIFIED automatiquement.",
    choose:"Choisir CSV", template:"Télécharger le modèle", reference:"Référence du lot", preview:"Aperçu", rows:"lignes", submit:"Importer dans PostgreSQL",
    ready:"fichier prêt", imported:"mesures créées", skipped:"doublons ignorés",
    headers:"Colonnes obligatoires: parameter,value,unit,measured_at,source,method. Horodatage ISO avec Z ou décalage requis.",
    parseError:"CSV invalide. Vérifiez les en-têtes, unités, valeurs, fuseaux horaires et la limite de 500 lignes.",
  } : language === "en" ? {
    importTitle:"Import measurement CSV", importNote:"Up to 500 rows. Imported data remains PENDING / UNVERIFIED until review. Import never creates VERIFIED evidence.",
    choose:"Choose CSV", template:"Download template", reference:"Batch reference", preview:"Preview", rows:"rows", submit:"Import into PostgreSQL",
    ready:"file ready", imported:"measurements created", skipped:"duplicates skipped",
    headers:"Required columns: parameter,value,unit,measured_at,source,method. ISO timestamp with Z or offset is required.",
    parseError:"Invalid CSV. Check headers, units, values, timezone timestamps and the 500-row limit.",
  } : {
    importTitle:"استيراد القياسات من CSV", importNote:"حتى 500 سجل. تبقى البيانات PENDING / UNVERIFIED إلى أن تتم مراجعتها، ولا يحول الاستيراد أي قياس إلى VERIFIED تلقائيًا.",
    choose:"اختيار ملف CSV", template:"تنزيل القالب", reference:"مرجع الدفعة", preview:"معاينة", rows:"سجل", submit:"استيراد إلى PostgreSQL",
    ready:"الملف جاهز", imported:"قياسات أُنشئت", skipped:"تكرارات تم تجاهلها",
    headers:"الأعمدة المطلوبة: parameter,value,unit,measured_at,source,method. يجب أن يتضمن الوقت Z أو فرق التوقيت.",
    parseError:"ملف CSV غير صالح. تحقق من الأعمدة والوحدات والقيم والمنطقة الزمنية وحد 500 سجل.",
  };

  const [parameter, setParameter] = useState("flow_rate");
  const [sourceType, setSourceType] = useState<string>("manual");
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [batchReference, setBatchReference] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const parameterGroups = useMemo(() => ({
    water: ["flow_rate","water_level","ph","ec","tds","salinity","sar","sodium","calcium","magnesium","chloride","bicarbonate","temperature","turbidity","pressure","dissolved_oxygen"],
    soil: ["soil_moisture","soil_temperature","soil_nitrogen","soil_phosphorus","soil_potassium","soil_soc","soil_organic_matter","soil_ec"],
    climate: ["rainfall","humidity","air_temperature","wind_speed","solar_radiation","reference_et"],
    energy: ["electrical_power","voltage","current","energy"],
  }), []);

  useEffect(() => {
    api.get<Instrument[]>("/instruments").then(setInstruments).catch(() => setInstruments([]));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setError(null);
    const fd = new FormData(e.currentTarget); const instId = fd.get("instrument_id");
    try {
      await api.post("/measurements", {
        project_id: projectId, parameter, value: Number(fd.get("value")), unit: String(fd.get("unit")),
        measured_at: new Date(String(fd.get("measured_at"))).toISOString(),
        source: String(fd.get("source") || ""), method: String(fd.get("method") || ""),
        source_type: sourceType, instrument_id: instId ? Number(instId) : null,
      });
      (e.target as HTMLFormElement).reset(); reload();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  async function chooseCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; setError(null); setImportResult(null); setImportRows([]); setFileName("");
    if (!file) return;
    if (file.size > 1_500_000) { setError(new Error(copy.parseError)); event.target.value=""; return; }
    try {
      const records = parseCsv(await file.text());
      const rows = normalizeRows(records);
      setImportRows(rows); setFileName(file.name);
      if (!batchReference) setBatchReference(`CSV-${new Date().toISOString().replace(/[-:]/g,"").slice(0,15)}`);
    } catch { setError(new Error(copy.parseError)); }
    event.target.value="";
  }

  async function importBatch() {
    if (!importRows.length || !batchReference.trim() || busy) return;
    setBusy(true); setError(null); setImportResult(null);
    try {
      const result = await api.post<ImportResult>(`/projects/${projectId}/measurements/import`, {
        batch_reference: batchReference.trim(), rows: importRows,
      });
      setImportResult(result); setImportRows([]); setFileName(""); reload();
    } catch (err) { setError(err); } finally { setBusy(false); }
  }

  return <div className="space-y-4">
    <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-3">
      <div className="space-y-1">
        <Label htmlFor="m-param">{t("measurement.parameter")}</Label>
        <select id="m-param" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={parameter} onChange={e=>setParameter(e.target.value)}>
          {Object.entries(parameterGroups).map(([group, params])=><optgroup key={group} label={group.toUpperCase()}>{params.map(p=><option key={p} value={p}>{t(`measurement.params.${p}`,p)}</option>)}</optgroup>)}
        </select>
      </div>
      <div className="space-y-1"><Label htmlFor="m-value">{t("measurement.value")}</Label><Input id="m-value" name="value" type="number" step="any" required dir="ltr"/></div>
      <div className="space-y-1"><Label htmlFor="m-unit">{t("measurement.unit")}</Label><select id="m-unit" name="unit" className="w-full rounded-md border bg-background px-3 py-2 text-sm">{PARAM_UNITS[parameter].map(u=><option key={u} value={u}>{u}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="m-at">{t("measurement.measuredAt")}</Label><Input id="m-at" name="measured_at" type="datetime-local" required dir="ltr"/></div>
      <div className="space-y-1"><Label htmlFor="m-source">{t("measurement.source")}</Label><Input id="m-source" name="source" required maxLength={255}/></div>
      <div className="space-y-1"><Label htmlFor="m-method">{t("measurement.method")}</Label><Input id="m-method" name="method" required maxLength={255}/></div>
      <div className="space-y-1"><Label htmlFor="m-stype">{t("measurement.sourceType")}</Label><select id="m-stype" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={sourceType} onChange={e=>setSourceType(e.target.value)}>{SOURCE_TYPES.map(s=><option key={s} value={s}>{t(`measurement.sourceTypes.${s}`)}</option>)}</select></div>
      <div className="space-y-1"><Label htmlFor="m-inst">{t("measurement.instrument")}</Label><select id="m-inst" name="instrument_id" className="w-full rounded-md border bg-background px-3 py-2 text-sm"><option value="">{t("common.none")}</option>{instruments.map(i=><option key={i.id} value={i.id}>#{i.id} — {i.type} ({i.serial_number})</option>)}</select></div>
      <div className="sm:col-span-3"><ErrorText error={error}/></div>
      <div className="sm:col-span-3"><Button type="submit" disabled={busy}>{busy?t("common.loading"):t("measurement.submit")}</Button></div>
    </form>

    <section className="rounded-xl border bg-card p-4" aria-label={copy.importTitle}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 className="flex items-center gap-2 font-semibold"><FileSpreadsheet size={18}/>{copy.importTitle}</h3><p className="mt-1 max-w-3xl text-xs text-muted-foreground">{copy.importNote}</p></div>
        <Button type="button" variant="outline" onClick={downloadTemplate}><FileDown size={16}/>{copy.template}</Button>
      </div>
      <p className="mt-3 rounded-md border border-dashed p-2 text-xs text-muted-foreground">{copy.headers}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <label className="grid gap-1 text-sm"><span>{copy.choose}</span><Input type="file" accept=".csv,text/csv" onChange={e=>void chooseCsv(e)}/></label>
        <label className="grid gap-1 text-sm"><span>{copy.reference}</span><Input value={batchReference} onChange={e=>setBatchReference(e.target.value)} maxLength={120}/></label>
        <div className="flex items-end"><Button type="button" disabled={!importRows.length||!batchReference.trim()||busy} onClick={()=>void importBatch()}><Upload size={16}/>{copy.submit}</Button></div>
      </div>
      {fileName&&<p className="mt-2 text-xs"><strong>{fileName}</strong> · {importRows.length} {copy.rows} · {copy.ready}</p>}
      {importRows.length>0&&<div className="mt-3 overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>{copy.preview}</TableHead><TableHead>{t("measurement.parameter")}</TableHead><TableHead>{t("measurement.value")}</TableHead><TableHead>{t("measurement.measuredAt")}</TableHead><TableHead>{t("measurement.source")}</TableHead></TableRow></TableHeader><TableBody>{importRows.slice(0,8).map((row,index)=><TableRow key={index}><TableCell>#{index+1}</TableCell><TableCell>{row.parameter}</TableCell><TableCell dir="ltr">{row.value} {row.unit}</TableCell><TableCell dir="ltr">{row.measured_at}</TableCell><TableCell>{row.source}</TableCell></TableRow>)}</TableBody></Table></div>}
      {importResult&&<div className="mt-3 flex flex-wrap gap-2 text-sm" role="status"><Badge>{importResult.created_count} {copy.imported}</Badge><Badge variant="outline">{importResult.skipped_duplicates} {copy.skipped}</Badge><span className="text-muted-foreground">{importResult.batch_reference}</span></div>}
    </section>

    {measurements.length===0?<p className="text-sm text-muted-foreground">{t("measurement.empty")}</p>:<div className="overflow-x-auto rounded-md border"><Table><TableHeader><TableRow><TableHead>{t("measurement.parameter")}</TableHead><TableHead>{t("measurement.value")}</TableHead><TableHead>{t("measurement.measuredAt")}</TableHead><TableHead>{t("measurement.source")}</TableHead><TableHead>{t("measurement.sourceType")}</TableHead><TableHead>{t("measurement.quality")}</TableHead><TableHead>{t("measurement.verification")}</TableHead></TableRow></TableHeader><TableBody>{measurements.map(m=><TableRow key={m.id}><TableCell>{t(`measurement.params.${m.parameter}`,m.parameter)}<DemoBadge show={m.is_demo}/></TableCell><TableCell className="tabular-nums" dir="ltr">{m.value} {m.unit}</TableCell><TableCell className="tabular-nums" dir="ltr">{new Date(m.measured_at).toLocaleString()}</TableCell><TableCell>{m.source}</TableCell><TableCell><Badge variant="secondary">{t(`measurement.sourceTypes.${m.source_type}`,m.source_type)}</Badge></TableCell><TableCell><Badge variant={qVariant(m.quality_status)}>{t(`measurement.qualityStatuses.${m.quality_status}`,m.quality_status)}</Badge></TableCell><TableCell><span className="flex items-center gap-1"><Badge variant={vVariant(m.verification_status)}>{t(`measurement.verificationStatuses.${m.verification_status}`,m.verification_status)}</Badge><ProvenanceBadge kind={m.verification_status==="verified"?"VERIFIED":"OBSERVED"}/></span></TableCell></TableRow>)}</TableBody></Table></div>}
  </div>;
}
