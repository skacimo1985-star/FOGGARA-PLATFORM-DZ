export interface User {
  id: number;
  org_id: number;
  email: string;
  full_name: string;
  role: "member" | "reviewer" | "admin";
  locale: string;
}

export interface Organization {
  id: number;
  code: string;
  name_ar: string;
  name_fr: string;
  name_en: string;
  is_demo: boolean;
}

export interface Site {
  id: number;
  name: string;
  wilaya: string;
  commune: string | null;
  lat: number | null;
  lon: number | null;
  is_demo: boolean;
}

export interface WaterResource {
  id: number;
  site_id: number;
  type: string;
  name: string;
  status: string;
  is_demo: boolean;
}

export interface Asset {
  id: number;
  resource_id: number;
  kind: string;
  name: string;
  status: string;
  is_demo: boolean;
}

export interface Project {
  id: number;
  org_id: number;
  title: string;
  description: string | null;
  domain: string;
  status: "draft" | "active" | "suspended" | "closed";
  site_id: number | null;
  resource_id: number | null;
  asset_id: number | null;
  is_demo: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface Measurement {
  id: number;
  project_id: number;
  parcel_id: number | null;
  resource_id: number | null;
  parameter: string;
  value: number;
  unit: string;
  measured_at: string;
  source: string;
  method: string;
  source_type: "manual" | "instrument" | "imported";
  import_batch_ref: string | null;
  instrument_id: number | null;
  asset_id: number | null;
  quality_status: "pending" | "validated" | "rejected";
  verification_status: string;
  is_demo: boolean;
  submitted_by: number;
  created_at: string;
}

export interface Evidence {
  id: number;
  project_id: number;
  measurement_id: number | null;
  title: string;
  doc_type: string;
  license: string;
  uri: string | null;
  content_note: string | null;
  status: "submitted" | "under_review" | "verified" | "rejected";
  resolution: "accepted" | "rejected" | "request_clarification" | null;
  clarification_note: string | null;
  is_demo: boolean;
  submitted_by: number;
  created_at: string;
}

export interface Review {
  id: number;
  target_type: "measurement" | "evidence";
  target_id: number;
  reviewer_id: number;
  decision: "accepted" | "rejected" | "request_clarification";
  note: string;
  reason: string;
  created_at: string;
}

export interface Indicator {
  id: number;
  code: string;
  name_ar: string;
  name_fr: string;
  name_en: string;
  formula: string;
  unit: string;
  source: string;
  valid_from: string | null;
  valid_to: string | null;
}

export interface IndicatorValue {
  indicator_code: string;
  value: number | null;
  unit: string;
  window_from: string;
  window_to: string;
  n_measurements: number;
  sufficient: boolean;
  measurement_ids: number[];
  name_ar: string | null;
  name_fr: string | null;
  name_en: string | null;
  formula: string | null;
  source: string | null;
  valid_from: string | null;
  valid_to: string | null;
  message: string | null;
  params: Record<string, unknown> | null;
}

export interface Recommendation {
  id: number;
  project_id: number;
  indicator_code: string;
  basis: string;
  evidence_ids: number[];
  text_ar: string;
  text_fr: string;
  text_en: string;
  status: "proposed" | "accepted" | "rejected";
  created_at: string;
}

export interface Action {
  id: number;
  project_id: number;
  decision_id: number | null;
  title: string;
  assignee: string | null;
  status: "open" | "in_progress" | "done";
  result_note: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface AuditEntry {
  id: number;
  user_id: number | null;
  project_id: number | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  meta: Record<string, unknown>;
  created_at: string;
}

export interface HumanDecision {
  id: number;
  project_id: number;
  recommendation_id: number | null;
  action_id: number | null;
  decision: "approve" | "reject" | "defer";
  reason: string;
  evidence_ids: number[];
  decided_by: number;
  created_at: string;
}

export interface Instrument {
  id: number;
  type: string;
  serial_number: string;
  site_id: number | null;
  asset_id: number | null;
  status: "active" | "maintenance" | "out_of_service";
  is_demo: boolean;
  created_at: string;
}

export interface MetrologyStatus {
  instrument_id: number;
  has_valid_calibration: boolean;
  has_active_certificate: boolean;
}

export interface Calibration {
  id: number;
  instrument_id: number;
  calibrated_on: string;
  authority: string;
  result: "pass" | "fail";
  next_due: string;
  certificate_id: number | null;
  created_at: string;
}

export interface Certificate {
  id: number;
  instrument_id: number | null;
  number: string;
  issuer: string;
  status: "draft" | "active" | "expired" | "revoked";
  valid_from: string;
  valid_to: string;
  uri: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface Inspection {
  id: number;
  instrument_id: number | null;
  asset_id: number | null;
  inspected_on: string;
  inspector: string;
  result: "pass" | "fail" | "conditional";
  notes: string | null;
  is_demo: boolean;
  created_at: string;
}

export interface Service {
  id: number;
  type: string;
  name_ar: string;
  name_fr: string;
  name_en: string;
  description: string | null;
  provider: string;
  domain: string | null;
  is_demo: boolean;
}

export interface ServiceRequest {
  id: number;
  service_id: number;
  project_id: number | null;
  site_id: number | null;
  requesting_entity: string | null;
  status: "submitted" | "triaged" | "assigned" | "in_progress" | "completed" | "cancelled";
  notes: string | null;
  is_demo: boolean;
  created_by: number;
  created_at: string;
  updated_at: string;
}

export interface ExploreSection<T = Record<string, unknown>> {
  status: "available" | "planned";
  items?: T[];
  required_data?: string[];
}

export interface ExploreDomain {
  domain: string;
  resources: ExploreSection;
  assets: ExploreSection;
  indicators: ExploreSection;
  risks: ExploreSection;
  services: ExploreSection;
  projects: ExploreSection;
  terminology: ExploreSection;
}

export interface GisSite {
  site: { id: number; name: string; wilaya: string; commune: string | null; lat: number; lon: number; is_demo: boolean };
  projects: { id: number; title: string; domain: string; status: string }[];
  resources: { id: number; type: string; name: string; status: string }[];
  assets: { id: number; kind: string; name: string; status: string }[];
  service_requests: { id: number; service_id: number; status: string }[];
}

export interface WilayaMeta { code: string; ar: string; fr: string; en: string }

export interface PlannedStatus {
  status: string;
  model: string[];
  warnings: string[];
  capabilities?: Record<string, "available" | "not_implemented" | "not_configured" | string>;
}

// ---- Water Domain (Contract §4) ----
export interface Well {
  id: number;
  site_id: number;
  name: string;
  depth_m: number | null;
  status: string;
  is_demo: boolean;
}

export interface Reservoir {
  id: number;
  site_id: number;
  name: string;
  capacity_m3: number;
  min_level_m: number | null;
  status: string;
  is_demo: boolean;
}

export interface Pump {
  id: number;
  site_id: number;
  name: string;
  well_id: number | null;
  reservoir_id: number | null;
  rated_power_kw: number | null;
  rated_flow_l_s: number | null;
  status: string;
  is_demo: boolean;
}

export interface Vfd {
  id: number;
  pump_id: number;
  model: string;
  max_frequency_hz: number | null;
  status: string;
  is_demo: boolean;
}

export interface IrrigationZone {
  id: number;
  site_id: number;
  name: string;
  area_ha: number;
  soil_type: string | null;
  crop_hint: string | null;
  is_demo: boolean;
}

export interface Valve {
  id: number;
  site_id: number;
  zone_id: number | null;
  name: string;
  diameter_mm: number | null;
  normally_open: boolean;
  status: string;
  is_demo: boolean;
}

export interface WaterAllocation {
  id: number;
  zone_id: number;
  well_id: number | null;
  reservoir_id: number | null;
  volume_m3: number;
  period_start: string;
  period_end: string;
  status: "proposed" | "approved" | "executed" | "cancelled";
  created_by: number;
  decided_by: number | null;
  decided_at: string | null;
  is_demo: boolean;
}

// ---- Phase 2: General Decision Engine ----
export type DecisionDomain = "water" | "energy" | "food" | "ecosystem" | "health" | "cross_domain";
export type DecisionStatus = "PROPOSED" | "REVIEW_REQUIRED" | "APPROVED" |
  "EXECUTION_AUTHORIZED" | "EXECUTED" | "VERIFIED" | "CANCELLED";
export type DecisionLevel = "low" | "medium" | "high" | "critical";

export interface GovDecision {
  id: number;
  org_id: number;
  domain: DecisionDomain;
  decision_type: string;
  title: string;
  description: string | null;
  status: DecisionStatus;
  priority: DecisionLevel;
  risk_level: DecisionLevel;
  subject_type: string | null;
  subject_id: number | null;
  source_type: string | null;
  source_id: string | null;
  proposed_by: number;
  reviewed_by: number | null;
  approved_by: number | null;
  authorized_by: number | null;
  executed_by: number | null;
  verified_by: number | null;
  proposed_at: string;
  reviewed_at: string | null;
  approved_at: string | null;
  authorized_at: string | null;
  executed_at: string | null;
  verified_at: string | null;
  cancelled_at: string | null;
  valid_from: string | null;
  valid_until: string | null;
  reason: string | null;
  expected_result: string | null;
  actual_result: string | null;
  meta: Record<string, unknown>;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface DecisionTransitionRecord {
  id: number;
  decision_id: number;
  from_status: string;
  to_status: string;
  actor_id: number;
  actor_role: string;
  reason: string | null;
  comment: string | null;
  created_at: string;
}

export interface DecisionEvidence {
  id: number;
  decision_id: number;
  evidence_type: string;
  source_type: string | null;
  source_id: string | null;
  value: number | null;
  unit: string | null;
  observed_at: string | null;
  quality: string | null;
  created_at: string;
}

export interface DecisionExecution {
  id: number;
  decision_id: number;
  execution_type: string;
  execution_reference: string | null;
  requested_at: string;
  completed_at: string | null;
  executor_id: number | null;
  result: string | null;
  result_code: string | null;
  success: boolean | null;
  failure_reason: string | null;
}

export interface DecisionVerification {
  id: number;
  decision_id: number;
  verified_by: number;
  verification_status: "PASSED" | "FAILED" | "PARTIAL" | "INCONCLUSIVE";
  expected_result: string | null;
  observed_result: string | null;
  verification_method: string | null;
  notes: string | null;
  verified_at: string;
}

// ---- Phase 3: Telemetry + Simulator ----
export type TelemetryQuality = "VALID" | "INVALID" | "SUSPECT" | "MISSING";
export type SimScenario = "NORMAL" | "HIGH_DEMAND" | "LOW_WATER" |
  "PRESSURE_ANOMALY" | "SENSOR_FAILURE" | "ENERGY_ANOMALY";

export interface Device {
  id: number;
  org_id: number;
  name: string;
  device_type: string;
  status: string;
  subject_type: string | null;
  subject_id: number | null;
  protocol: string;
  is_simulated: boolean;
  is_demo: boolean;
  created_at: string;
}

export interface Sensor {
  id: number;
  org_id: number;
  device_id: number;
  subject_type: string | null;
  subject_id: number | null;
  name: string;
  sensor_type: string;
  metric: string;
  unit: string;
  min_value: number | null;
  max_value: number | null;
  status: string;
  is_simulated: boolean;
  is_demo: boolean;
}

export interface TelemetryReading {
  id: number;
  org_id: number;
  device_id: number;
  sensor_id: number;
  subject_type: string | null;
  subject_id: number | null;
  metric: string;
  value: number | null;
  unit: string;
  quality: TelemetryQuality;
  observed_at: string;
  source: string;
  simulation_run_id: number | null;
  is_demo: boolean;
}

export interface TelemetryAggregate {
  sensor_id: number;
  metric: string;
  unit: string;
  latest: number | null;
  min: number | null;
  max: number | null;
  avg: number | null;
  sum: number | null;
  count: number;
}

export interface SimulationRun {
  id: number;
  org_id: number;
  device_id: number;
  scenario: SimScenario;
  seed: number;
  steps: number;
  step_seconds: number;
  start_time: string;
  end_time: string | null;
  status: "CREATED" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";
  generated_count: number;
  created_by: number;
  is_demo: boolean;
  created_at: string;
}

export interface TelemetryRule {
  id: number;
  org_id: number;
  name: string;
  domain: string;
  metric: string;
  operator: "GT" | "GTE" | "LT" | "LTE" | "EQ" | "NEQ";
  threshold: number;
  unit: string;
  severity: string;
  decision_type: string;
  enabled: boolean;
  is_demo: boolean;
  created_at: string;
}

export interface SimulationResult {
  run: SimulationRun;
  generated: number;
  proposals: GovDecision[];
}
