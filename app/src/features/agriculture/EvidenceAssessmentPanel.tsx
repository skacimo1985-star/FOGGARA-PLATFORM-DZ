import { AlertTriangle, Database, ExternalLink, FileCheck2, Sigma } from "lucide-react";

type Lang = "ar" | "fr" | "en";

export type AssessmentFinding = {
  metric: string;
  level: string;
  message: string;
  restriction?: string;
  classification?: string;
  basis?: string;
  reference?: string;
  computed_meq_l?: number;
};

export type AssessmentReference = {
  code: string;
  title: string;
  url: string;
};

export type DerivedMetric = {
  value: number;
  unit: string;
  evidence_status: string;
  basis?: string[];
  formula?: string;
};

export type MeasurementSource = {
  measurement_id: number;
  parameter: string;
  metric?: string;
  source: string;
  method?: string | null;
  measured_at?: string;
  unit?: string;
};

export type RecordedSource = {
  metric: string;
  value: number;
  unit: string;
  source_type: string;
  source_ref: string;
  observed_at: string;
  evidence_status: string;
};

export type EvidenceAssessment = {
  evidence_status: string;
  decision_status: string;
  coverage: string[];
  inputs?: Record<string, number>;
  methods?: Record<string, string>;
  findings: AssessmentFinding[];
  actions: string[];
  limitations: string[];
  references?: AssessmentReference[];
  derived_metrics?: Record<string, DerivedMetric>;
  measurement_ids?: number[];
  measurement_sources?: MeasurementSource[];
  resource_id?: number | null;
};

type Props = {
  title: string;
  assessment: EvidenceAssessment;
  provenance: string;
  recordedSources?: RecordedSource[];
  lang: Lang;
};

const fallbackUnits: Record<string, string> = {
  ph: "pH",
  ec: "dS/m",
  tds: "mg/L",
  sodium: "mg/L",
  calcium: "mg/L",
  magnesium: "mg/L",
  chloride: "mg/L",
  bicarbonate: "mg/L",
  temperature: "°C",
  turbidity: "NTU",
  dissolved_oxygen: "mg/L",
  nitrogen: "mg/kg",
  phosphorus: "mg/kg",
  potassium: "mg/kg",
  soc: "%",
  organic_matter: "%",
  moisture: "%",
  sar: "index",
};

const copy = {
  ar: {
    evidence: "حالة الدليل", decision: "حالة القرار", provenance: "المنشأ",
    inputs: "المدخلات المستخدمة", sources: "مصادر القياس", findings: "النتائج",
    derived: "مؤشرات محسوبة", actions: "الإجراءات المقترحة", limitations: "القيود",
    references: "المراجع", noEvidence: "لا توجد أدلة كافية لإجراء هذا التحليل.",
    source: "المصدر", method: "الطريقة", measured: "تاريخ القياس",
    recorded: "سجل زراعي", verified: "قياس موثق", formula: "المعادلة",
  },
  fr: {
    evidence: "État de preuve", decision: "État de décision", provenance: "Provenance",
    inputs: "Entrées utilisées", sources: "Sources de mesure", findings: "Constats",
    derived: "Indicateurs calculés", actions: "Actions proposées", limitations: "Limites",
    references: "Références", noEvidence: "Preuves insuffisantes pour exécuter cette analyse.",
    source: "Source", method: "Méthode", measured: "Date de mesure",
    recorded: "Observation agricole", verified: "Mesure vérifiée", formula: "Formule",
  },
  en: {
    evidence: "Evidence state", decision: "Decision state", provenance: "Provenance",
    inputs: "Inputs used", sources: "Measurement sources", findings: "Findings",
    derived: "Computed metrics", actions: "Proposed actions", limitations: "Limitations",
    references: "References", noEvidence: "Insufficient evidence to run this analysis.",
    source: "Source", method: "Method", measured: "Measured",
    recorded: "Agriculture observation", verified: "Verified measurement", formula: "Formula",
  },
} as const;

const codeLabels: Record<string, Record<Lang, string>> = {
  VERIFIED_PARCEL_SOIL_MEASUREMENTS_REQUIRED: {
    ar: "يلزم تسجيل قياسات تربة مرتبطة بالقطعة والتحقق منها.",
    fr: "Des mesures de sol liées à la parcelle et vérifiées sont requises.",
    en: "Verified soil measurements linked to the parcel are required.",
  },
  PROJECT_WATER_RESOURCE_REQUIRED: {
    ar: "اختر مشروعًا مرتبطًا بمورد مائي لإجراء تحليل مياه الري.",
    fr: "Sélectionnez un projet lié à une ressource en eau pour l’analyse d’irrigation.",
    en: "Select a project linked to a water resource for irrigation-water analysis.",
  },
  VERIFIED_WATER_MEASUREMENTS_REQUIRED: {
    ar: "يلزم وجود قياسات مياه متحقق منها للمورد المرتبط بالمشروع.",
    fr: "Des mesures d’eau vérifiées sont requises pour la ressource du projet.",
    en: "Verified water measurements are required for the project water resource.",
  },
  HUMAN_REVIEW_REQUIRED: {
    ar: "تتطلب النتيجة مراجعة بشرية مختصة قبل اتخاذ إجراء.",
    fr: "Une revue humaine spécialisée est requise avant toute action.",
    en: "Specialist human review is required before action.",
  },
  SCREENING_NOT_LAB_CERTIFICATE: {
    ar: "هذا فحص تحليلي وليس شهادة مخبرية.",
    fr: "Ce dépistage analytique ne constitue pas un certificat de laboratoire.",
    en: "This analytical screening is not a laboratory certificate.",
  },
  SCREENING_NOT_POTABILITY_OR_LAB_CERTIFICATE: {
    ar: "هذا التحليل ليس شهادة صلاحية للشرب ولا شهادة مخبرية.",
    fr: "Cette analyse n’est ni un certificat de potabilité ni un certificat de laboratoire.",
    en: "This analysis is neither a potability nor a laboratory certificate.",
  },
  CROP_SPECIFIC_THRESHOLDS_NOT_APPLIED: {
    ar: "لم تُطبق حدود خاصة بالمحصول.",
    fr: "Les seuils spécifiques à la culture ne sont pas appliqués.",
    en: "Crop-specific thresholds are not applied.",
  },
  NPK_THRESHOLDS_REQUIRE_CROP_AND_EXTRACTION_METHOD: {
    ar: "تفسير N/P/K يحتاج نوع المحصول وطريقة الاستخلاص المخبرية.",
    fr: "L’interprétation N/P/K exige la culture et la méthode d’extraction.",
    en: "N/P/K interpretation requires crop context and extraction method.",
  },
  SOIL_EC_METHOD_REQUIRED_FOR_USDA_ECE_CLASSIFICATION: {
    ar: "يلزم تحديد طريقة EC لتطبيق تصنيف ECe بصورة صحيحة.",
    fr: "La méthode EC doit être identifiée pour appliquer correctement la classe ECe.",
    en: "The EC method must be identified before applying an ECe classification.",
  },
};

function humanize(value: string, lang: Lang) {
  return codeLabels[value]?.[lang] ?? value.replaceAll("_", " ").toLowerCase();
}

function formatDate(value: string | undefined, lang: Lang) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-DZ" : lang, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Algiers",
  }).format(date);
}

function formatNumber(value: number, lang: Lang) {
  return new Intl.NumberFormat(lang === "ar" ? "ar-DZ" : lang, {
    maximumFractionDigits: 4,
  }).format(value);
}

function findingTone(level: string) {
  if (level === "ok" || level === "none") return "ok";
  if (level === "attention" || level === "severe") return "attention";
  return "watch";
}

export default function EvidenceAssessmentPanel({
  title,
  assessment,
  provenance,
  recordedSources = [],
  lang,
}: Props) {
  const labels = copy[lang];
  const verifiedSources = assessment.measurement_sources ?? [];
  const inputs = Object.entries(assessment.inputs ?? {});
  const derived = Object.entries(assessment.derived_metrics ?? {});
  const hasEvidence = assessment.coverage.length > 0;

  const unitFor = (metric: string) => {
    const source = verifiedSources.find((row) => row.metric === metric || row.parameter === metric);
    const recorded = recordedSources.find((row) => row.metric === metric);
    return source?.unit ?? recorded?.unit ?? fallbackUnits[metric] ?? "";
  };

  return (
    <article className="fg-assessment-panel">
      <header className="fg-assessment-head">
        <div>
          <p className="fg-eyebrow">FOGGARA / EVIDENCE ANALYSIS</p>
          <h3>{title}</h3>
        </div>
        <div className="fg-assessment-status">
          <span>{labels.evidence}<b>{assessment.evidence_status}</b></span>
          <span>{labels.decision}<b>{assessment.decision_status}</b></span>
        </div>
      </header>

      <div className="fg-assessment-provenance">
        <FileCheck2 size={16} />
        <strong>{labels.provenance}</strong>
        <span>{provenance}</span>
        {assessment.resource_id ? <code>RESOURCE #{assessment.resource_id}</code> : null}
      </div>

      {!hasEvidence ? (
        <div className="fg-assessment-empty">
          <AlertTriangle size={22} />
          <strong>{labels.noEvidence}</strong>
          {assessment.limitations.map((item) => <p key={item}>{humanize(item, lang)}</p>)}
        </div>
      ) : (
        <>
          <section className="fg-assessment-section">
            <h4><Database size={15} />{labels.inputs}</h4>
            <div className="fg-assessment-inputs">
              {inputs.map(([metric, value]) => (
                <div key={metric}>
                  <small>{metric.replaceAll("_", " ")}</small>
                  <strong dir="ltr">{formatNumber(value, lang)} {unitFor(metric)}</strong>
                  {assessment.methods?.[metric] ? <span>{assessment.methods[metric]}</span> : null}
                </div>
              ))}
            </div>
          </section>

          {(verifiedSources.length > 0 || recordedSources.length > 0) ? (
            <section className="fg-assessment-section">
              <h4><FileCheck2 size={15} />{labels.sources}</h4>
              <div className="fg-assessment-sources">
                {verifiedSources.map((row) => (
                  <div key={row.measurement_id}>
                    <span className="fg-evidence-chip verified">{labels.verified} · #{row.measurement_id}</span>
                    <strong>{row.metric ?? row.parameter}</strong>
                    <dl>
                      <div><dt>{labels.source}</dt><dd>{row.source}</dd></div>
                      <div><dt>{labels.method}</dt><dd>{row.method || "—"}</dd></div>
                      <div><dt>{labels.measured}</dt><dd>{formatDate(row.measured_at, lang)}</dd></div>
                    </dl>
                  </div>
                ))}
                {recordedSources.map((row) => (
                  <div key={`${row.metric}-${row.source_ref}`}>
                    <span className={`fg-evidence-chip ${row.evidence_status === "VERIFIED" ? "verified" : "recorded"}`}>
                      {labels.recorded} · {row.evidence_status}
                    </span>
                    <strong>{row.metric}</strong>
                    <dl>
                      <div><dt>{labels.source}</dt><dd>{row.source_type} · {row.source_ref}</dd></div>
                      <div><dt>{labels.measured}</dt><dd>{formatDate(row.observed_at, lang)}</dd></div>
                    </dl>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {derived.length > 0 ? (
            <section className="fg-assessment-section">
              <h4><Sigma size={15} />{labels.derived}</h4>
              <div className="fg-assessment-derived">
                {derived.map(([metric, row]) => (
                  <div key={metric}>
                    <span>{metric.toUpperCase()} · {row.evidence_status}</span>
                    <strong dir="ltr">{formatNumber(row.value, lang)} {row.unit}</strong>
                    {row.formula ? <code>{labels.formula}: {row.formula}</code> : null}
                    {row.basis?.length ? <small>{row.basis.join(" + ")}</small> : null}
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {assessment.findings.length > 0 ? (
            <section className="fg-assessment-section">
              <h4>{labels.findings}</h4>
              <div className="fg-assessment-findings">
                {assessment.findings.map((finding, index) => (
                  <div className={`fg-assessment-finding ${findingTone(finding.level)}`} key={`${finding.metric}-${index}`}>
                    <span>{finding.metric}</span>
                    <strong>{humanize(finding.classification || finding.restriction || finding.message, lang)}</strong>
                    <small>{[finding.basis, finding.reference].filter(Boolean).join(" · ")}</small>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {assessment.actions.length > 0 ? (
            <section className="fg-assessment-section">
              <h4>{labels.actions}</h4>
              <ol className="fg-assessment-actions">
                {assessment.actions.map((action) => <li key={action}>{action}</li>)}
              </ol>
            </section>
          ) : null}

          {assessment.limitations.length > 0 ? (
            <section className="fg-assessment-section fg-assessment-limitations">
              <h4><AlertTriangle size={15} />{labels.limitations}</h4>
              <ul>{assessment.limitations.map((item) => <li key={item}>{humanize(item, lang)}</li>)}</ul>
            </section>
          ) : null}

          {assessment.references?.length ? (
            <section className="fg-assessment-section">
              <h4>{labels.references}</h4>
              <div className="fg-assessment-references">
                {assessment.references.map((reference) => (
                  <a href={reference.url} target="_blank" rel="noreferrer" key={reference.code}>
                    <span>{reference.code}</span>
                    <strong>{reference.title}</strong>
                    <ExternalLink size={14} />
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </article>
  );
}
