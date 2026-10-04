from datetime import datetime
from typing import Generic, Literal, Optional, TypeVar

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- ترقيم الصفحات (غلاف موحد للقوائم) ----
T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int
    pages: int


# ---- Auth ----
class LoginIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=1, max_length=1024)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class UserOut(ORM):
    id: int
    org_id: int
    email: str
    full_name: str
    role: str
    locale: str


class TokenOut(BaseModel):
    token: str
    user: UserOut


# ---- Meta entities ----
class OrgOut(ORM):
    id: int
    code: str
    name_ar: str
    name_fr: str
    name_en: str
    is_demo: bool


class SiteIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    wilaya: str = Field(min_length=1, max_length=100)
    commune: Optional[str] = None
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lon: Optional[float] = Field(default=None, ge=-180, le=180)


class SiteOut(ORM):
    id: int
    name: str
    wilaya: str
    commune: Optional[str]
    lat: Optional[float]
    lon: Optional[float]
    is_demo: bool


class ResourceIn(BaseModel):
    site_id: int
    type: Literal["foggara", "borehole", "spring", "well", "dam"]
    name: str = Field(min_length=1, max_length=255)
    status: Literal["active", "degraded", "dry", "abandoned"] = "active"


class ResourceOut(ORM):
    id: int
    site_id: int
    type: str
    name: str
    status: str
    is_demo: bool


class AssetIn(BaseModel):
    resource_id: int
    kind: Literal["gallery", "mother_well", "pump", "channel", "sensor"]
    name: str = Field(min_length=1, max_length=255)
    status: Literal["operational", "maintenance", "out_of_service"] = "operational"


class AssetOut(ORM):
    id: int
    resource_id: int
    kind: str
    name: str
    status: str
    is_demo: bool


# ---- Projects ----
class ProjectIn(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    domain: Literal["water", "energy", "food", "ecosystem", "health"] = "water"
    site_id: Optional[int] = None
    resource_id: Optional[int] = None
    asset_id: Optional[int] = None


class ProjectUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[Literal["draft", "active", "suspended", "closed"]] = None
    site_id: Optional[int] = None
    resource_id: Optional[int] = None
    asset_id: Optional[int] = None


class ProjectOut(ORM):
    id: int
    org_id: int
    title: str
    description: Optional[str]
    domain: str
    status: str
    site_id: Optional[int]
    resource_id: Optional[int]
    asset_id: Optional[int]
    is_demo: bool
    created_by: int
    created_at: datetime
    updated_at: datetime


# ---- Measurements ----
MEASUREMENT_PARAMETERS = Literal[
    # water
    "flow_rate", "water_level", "ph", "temperature", "turbidity", "pressure",
    "dissolved_oxygen", "rainfall",
    # energy
    "electrical_power", "voltage",
    # food / ecosystem
    "humidity", "soil_moisture",
]


class MeasurementIn(BaseModel):
    project_id: int
    resource_id: Optional[int] = None
    parameter: MEASUREMENT_PARAMETERS
    value: float
    unit: str = Field(min_length=1, max_length=20)
    measured_at: datetime
    source: str = Field(min_length=1, max_length=255)
    method: str = Field(min_length=1, max_length=255)
    source_type: Literal["manual", "instrument", "imported"] = "manual"
    instrument_id: Optional[int] = None
    asset_id: Optional[int] = None


class MeasurementOut(ORM):
    id: int
    project_id: int
    resource_id: Optional[int]
    parameter: str
    value: float
    unit: str
    measured_at: datetime
    source: str
    method: str
    source_type: str
    instrument_id: Optional[int]
    asset_id: Optional[int]
    quality_status: str
    verification_status: str
    is_demo: bool
    submitted_by: int
    created_at: datetime


# ---- Evidence ----
class EvidenceIn(BaseModel):
    project_id: int
    measurement_id: Optional[int] = None
    title: str = Field(min_length=1, max_length=255)
    doc_type: Literal["report", "photo", "lab_result", "permit", "field_note"]
    license: str = Field(min_length=1, max_length=255)
    uri: Optional[str] = None
    content_note: Optional[str] = None


class EvidenceOut(ORM):
    id: int
    project_id: int
    measurement_id: Optional[int]
    title: str
    doc_type: str
    license: str
    uri: Optional[str]
    content_note: Optional[str]
    status: str
    resolution: Optional[str]
    clarification_note: Optional[str]
    is_demo: bool
    submitted_by: int
    created_at: datetime


# ---- Reviews ----
class ReviewIn(BaseModel):
    target_type: Literal["measurement", "evidence"]
    target_id: int
    decision: Literal["accepted", "rejected", "request_clarification"]
    note: str = Field(min_length=1)
    reason: str = Field(min_length=1)


class ReviewOut(ORM):
    id: int
    target_type: str
    target_id: int
    reviewer_id: int
    decision: str
    note: str
    reason: str
    created_at: datetime


# ---- Indicators ----
class IndicatorOut(ORM):
    id: int
    code: str
    name_ar: str
    name_fr: str
    name_en: str
    formula: str
    unit: str
    source: str
    valid_from: Optional[datetime]
    valid_to: Optional[datetime]


class IndicatorValueOut(BaseModel):
    """تحليلات شفافة: الصيغة والمصادر والنافذة وحدود الصلاحية مع القيمة."""
    indicator_code: str
    value: Optional[float]  # None = بيانات غير كافية
    unit: str
    window_from: datetime
    window_to: datetime
    n_measurements: int
    sufficient: bool
    measurement_ids: list[int]  # مصادر البيانات: معرّفات القياسات المعتمدة فقط
    # شفافية إضافية (حقول مضافة — لا تكسر العقد القديم)
    name_ar: Optional[str] = None
    name_fr: Optional[str] = None
    name_en: Optional[str] = None
    formula: Optional[str] = None
    source: Optional[str] = None
    valid_from: Optional[datetime] = None
    valid_to: Optional[datetime] = None
    message: Optional[str] = None  # مفتاح i18n عند عدم كفاية البيانات
    params: Optional[dict] = None  # معاملات الحساب الموثقة (عتبات، حد أدنى)


# ---- Workflow ----
class RecommendationOut(ORM):
    id: int
    project_id: int
    indicator_code: str
    basis: str
    evidence_ids: list[int]
    text_ar: str
    text_fr: str
    text_en: str
    status: str
    created_at: datetime


class DecisionIn(BaseModel):
    decision: Literal["approved", "rejected", "modified"]
    rationale: str = Field(min_length=1)


class DecisionOut(ORM):
    id: int
    recommendation_id: int
    decision: str
    rationale: str
    decided_by: int
    created_at: datetime


class ActionIn(BaseModel):
    project_id: int
    decision_id: Optional[int] = None
    title: str = Field(min_length=1, max_length=255)
    assignee: Optional[str] = None


class ActionUpdate(BaseModel):
    status: Optional[Literal["open", "in_progress", "done"]] = None
    result_note: Optional[str] = None
    assignee: Optional[str] = None


class ActionOut(ORM):
    id: int
    project_id: int
    decision_id: Optional[int]
    title: str
    assignee: Optional[str]
    status: str
    result_note: Optional[str]
    created_by: int
    created_at: datetime
    updated_at: datetime


# ---- Audit ----
class AuditOut(ORM):
    id: int
    user_id: Optional[int]
    project_id: Optional[int]
    action: str
    entity_type: str
    entity_id: Optional[int]
    meta: dict
    created_at: datetime


# ---- Metrology ----
class InstrumentIn(BaseModel):
    type: str = Field(min_length=1, max_length=50)
    serial_number: str = Field(min_length=1, max_length=100)
    site_id: Optional[int] = None
    asset_id: Optional[int] = None
    status: Literal["active", "maintenance", "out_of_service"] = "active"


class InstrumentOut(ORM):
    id: int
    type: str
    serial_number: str
    site_id: Optional[int]
    asset_id: Optional[int]
    status: str
    is_demo: bool
    created_at: datetime


class CalibrationIn(BaseModel):
    calibrated_on: datetime
    authority: str = Field(min_length=1, max_length=255)
    result: Literal["pass", "fail"]
    next_due: datetime
    certificate_id: Optional[int] = None


class CalibrationOut(ORM):
    id: int
    instrument_id: int
    calibrated_on: datetime
    authority: str
    result: str
    next_due: datetime
    certificate_id: Optional[int]
    created_at: datetime


class CertificateIn(BaseModel):
    number: str = Field(min_length=1, max_length=100)
    issuer: str = Field(min_length=1, max_length=255)
    status: Literal["draft", "active", "expired", "revoked"] = "draft"
    valid_from: datetime
    valid_to: datetime
    uri: Optional[str] = None


class CertificateOut(ORM):
    id: int
    instrument_id: Optional[int]
    number: str
    issuer: str
    status: str
    valid_from: datetime
    valid_to: datetime
    uri: Optional[str]
    is_demo: bool
    created_at: datetime


class InspectionIn(BaseModel):
    instrument_id: Optional[int] = None
    asset_id: Optional[int] = None
    inspected_on: datetime
    inspector: str = Field(min_length=1, max_length=255)
    result: Literal["pass", "fail", "conditional"]
    notes: Optional[str] = None


class InspectionOut(ORM):
    id: int
    instrument_id: Optional[int]
    asset_id: Optional[int]
    inspected_on: datetime
    inspector: str
    result: str
    notes: Optional[str]
    is_demo: bool
    created_at: datetime


# ---- Services ----
class ServiceOut(ORM):
    id: int
    type: str
    name_ar: str
    name_fr: str
    name_en: str
    description: Optional[str]
    provider: str
    domain: Optional[str]
    is_demo: bool


class ServiceRequestIn(BaseModel):
    service_id: int
    project_id: Optional[int] = None
    site_id: Optional[int] = None
    requesting_entity: Optional[str] = Field(default=None, max_length=255)
    notes: Optional[str] = None


class ServiceRequestOut(ORM):
    id: int
    service_id: int
    project_id: Optional[int]
    site_id: Optional[int]
    requesting_entity: Optional[str]
    status: str
    notes: Optional[str]
    is_demo: bool
    created_by: int
    created_at: datetime
    updated_at: datetime


class ServiceRequestStatusUpdate(BaseModel):
    status: Literal["submitted", "triaged", "assigned", "in_progress", "completed", "cancelled"]
    notes: Optional[str] = None


# ---- Human decisions ----
class HumanDecisionIn(BaseModel):
    project_id: int
    recommendation_id: Optional[int] = None
    action_id: Optional[int] = None
    decision: Literal["approve", "reject", "defer"]
    reason: str = Field(min_length=1)  # السبب إلزامي
    evidence_ids: list[int] = Field(default_factory=list)


class HumanDecisionOut(ORM):
    id: int
    project_id: int
    recommendation_id: Optional[int]
    action_id: Optional[int]
    decision: str
    reason: str
    evidence_ids: list[int]
    decided_by: int
    created_at: datetime


# ---- Water Domain (Contract §4) ----
_WATER_STATUS = Literal["active", "maintenance", "decommissioned"]


class WellIn(BaseModel):
    site_id: int
    name: str = Field(min_length=1, max_length=255)
    depth_m: Optional[float] = Field(default=None, ge=0)
    status: _WATER_STATUS = "active"


class WellOut(ORM):
    id: int
    site_id: int
    name: str
    depth_m: Optional[float]
    status: str
    is_demo: bool


class ReservoirIn(BaseModel):
    site_id: int
    name: str = Field(min_length=1, max_length=255)
    capacity_m3: float = Field(gt=0)
    min_level_m: Optional[float] = Field(default=None, ge=0)
    status: _WATER_STATUS = "active"


class ReservoirOut(ORM):
    id: int
    site_id: int
    name: str
    capacity_m3: float
    min_level_m: Optional[float]
    status: str
    is_demo: bool


class PumpIn(BaseModel):
    site_id: int
    name: str = Field(min_length=1, max_length=255)
    well_id: Optional[int] = None
    reservoir_id: Optional[int] = None
    rated_power_kw: Optional[float] = Field(default=None, ge=0)
    rated_flow_l_s: Optional[float] = Field(default=None, ge=0)
    status: _WATER_STATUS = "active"


class PumpOut(ORM):
    id: int
    site_id: int
    name: str
    well_id: Optional[int]
    reservoir_id: Optional[int]
    rated_power_kw: Optional[float]
    rated_flow_l_s: Optional[float]
    status: str
    is_demo: bool


class VfdIn(BaseModel):
    pump_id: int
    model: str = Field(min_length=1, max_length=255)
    max_frequency_hz: Optional[float] = Field(default=None, gt=0)
    status: _WATER_STATUS = "active"


class VfdOut(ORM):
    id: int
    pump_id: int
    model: str
    max_frequency_hz: Optional[float]
    status: str
    is_demo: bool


class ZoneIn(BaseModel):
    site_id: int
    name: str = Field(min_length=1, max_length=255)
    area_ha: float = Field(gt=0)
    soil_type: Optional[str] = Field(default=None, max_length=100)
    crop_hint: Optional[str] = Field(default=None, max_length=100)


class ZoneOut(ORM):
    id: int
    site_id: int
    name: str
    area_ha: float
    soil_type: Optional[str]
    crop_hint: Optional[str]
    is_demo: bool


class ValveIn(BaseModel):
    site_id: int
    name: str = Field(min_length=1, max_length=255)
    zone_id: Optional[int] = None
    diameter_mm: Optional[float] = Field(default=None, gt=0)
    normally_open: bool = False
    status: _WATER_STATUS = "active"


class ValveOut(ORM):
    id: int
    site_id: int
    zone_id: Optional[int]
    name: str
    diameter_mm: Optional[float]
    normally_open: bool
    status: str
    is_demo: bool


class AllocationIn(BaseModel):
    zone_id: int
    well_id: Optional[int] = None
    reservoir_id: Optional[int] = None
    volume_m3: float = Field(gt=0)
    period_start: datetime
    period_end: datetime


class AllocationOut(ORM):
    id: int
    zone_id: int
    well_id: Optional[int]
    reservoir_id: Optional[int]
    volume_m3: float
    period_start: datetime
    period_end: datetime
    status: str
    created_by: int
    decided_by: Optional[int]
    decided_at: Optional[datetime]
    is_demo: bool


class AllocationTransitionIn(BaseModel):
    to: Literal["proposed", "approved", "executed", "cancelled"]


# =====================================================================
# المرحلة 2 — محرك القرارات العام
# =====================================================================
_DECISION_DOMAIN = Literal["water", "energy", "food", "ecosystem", "health", "cross_domain"]
_DECISION_STATUS = Literal["PROPOSED", "REVIEW_REQUIRED", "APPROVED",
                           "EXECUTION_AUTHORIZED", "EXECUTED", "VERIFIED", "CANCELLED"]
_DECISION_LEVEL = Literal["low", "medium", "high", "critical"]
_EVIDENCE_TYPE = Literal["measurement", "sensor", "manual_observation", "calculation",
                         "rule", "model", "document", "inspection", "satellite",
                         "expert_assessment"]
_VERIFICATION_STATUS = Literal["PASSED", "FAILED", "PARTIAL", "INCONCLUSIVE"]


class GovDecisionIn(BaseModel):
    domain: _DECISION_DOMAIN
    decision_type: str = Field(min_length=1, max_length=50)
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    priority: _DECISION_LEVEL = "medium"
    risk_level: _DECISION_LEVEL = "low"
    subject_type: Optional[str] = Field(default=None, max_length=50)
    subject_id: Optional[int] = None
    source_type: Optional[str] = Field(default=None, max_length=50)
    source_id: Optional[str] = Field(default=None, max_length=100)
    reason: Optional[str] = None
    expected_result: Optional[str] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    meta: dict = Field(default_factory=dict)


class GovDecisionPatchIn(BaseModel):
    decision_type: Optional[str] = Field(default=None, min_length=1, max_length=50)
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    priority: Optional[_DECISION_LEVEL] = None
    risk_level: Optional[_DECISION_LEVEL] = None
    subject_type: Optional[str] = Field(default=None, max_length=50)
    subject_id: Optional[int] = None
    source_type: Optional[str] = Field(default=None, max_length=50)
    source_id: Optional[str] = Field(default=None, max_length=100)
    reason: Optional[str] = None
    expected_result: Optional[str] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    meta: Optional[dict] = None


class GovDecisionOut(ORM):
    id: int
    org_id: int
    domain: str
    decision_type: str
    title: str
    description: Optional[str]
    status: str
    priority: str
    risk_level: str
    subject_type: Optional[str]
    subject_id: Optional[int]
    source_type: Optional[str]
    source_id: Optional[str]
    proposed_by: int
    reviewed_by: Optional[int]
    approved_by: Optional[int]
    authorized_by: Optional[int]
    executed_by: Optional[int]
    verified_by: Optional[int]
    proposed_at: datetime
    reviewed_at: Optional[datetime]
    approved_at: Optional[datetime]
    authorized_at: Optional[datetime]
    executed_at: Optional[datetime]
    verified_at: Optional[datetime]
    cancelled_at: Optional[datetime]
    valid_from: Optional[datetime]
    valid_until: Optional[datetime]
    reason: Optional[str]
    expected_result: Optional[str]
    actual_result: Optional[str]
    meta: dict
    is_demo: bool
    created_at: datetime
    updated_at: datetime


class DecisionTransitionIn(BaseModel):
    to: _DECISION_STATUS
    reason: Optional[str] = None
    comment: Optional[str] = None


class DecisionTransitionOut(ORM):
    id: int
    decision_id: int
    from_status: str
    to_status: str
    actor_id: int
    actor_role: str
    reason: Optional[str]
    comment: Optional[str]
    created_at: datetime


class DecisionEvidenceIn(BaseModel):
    evidence_type: _EVIDENCE_TYPE
    source_type: Optional[str] = Field(default=None, max_length=50)
    source_id: Optional[str] = Field(default=None, max_length=100)
    value: Optional[float] = None
    unit: Optional[str] = Field(default=None, max_length=30)
    observed_at: Optional[datetime] = None
    quality: Optional[str] = Field(default=None, max_length=20)
    meta: dict = Field(default_factory=dict)


class DecisionEvidenceOut(ORM):
    id: int
    decision_id: int
    evidence_type: str
    source_type: Optional[str]
    source_id: Optional[str]
    value: Optional[float]
    unit: Optional[str]
    observed_at: Optional[datetime]
    quality: Optional[str]
    meta: dict
    created_at: datetime


class DecisionExecutionIn(BaseModel):
    execution_type: str = Field(min_length=1, max_length=50)
    execution_reference: Optional[str] = Field(default=None, max_length=100)
    result: Optional[str] = None
    result_code: Optional[str] = Field(default=None, max_length=50)
    success: bool
    failure_reason: Optional[str] = None
    meta: dict = Field(default_factory=dict)


class DecisionExecutionOut(ORM):
    id: int
    decision_id: int
    execution_type: str
    execution_reference: Optional[str]
    idempotency_key: Optional[str]
    requested_at: datetime
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    executor_id: Optional[int]
    result: Optional[str]
    result_code: Optional[str]
    success: Optional[bool]
    failure_reason: Optional[str]
    meta: dict


class DecisionVerificationIn(BaseModel):
    verification_status: _VERIFICATION_STATUS
    expected_result: Optional[str] = None
    observed_result: Optional[str] = None
    verification_method: Optional[str] = Field(default=None, max_length=50)
    notes: Optional[str] = None


class DecisionVerificationOut(ORM):
    id: int
    decision_id: int
    verified_by: int
    verification_status: str
    expected_result: Optional[str]
    observed_result: Optional[str]
    verification_method: Optional[str]
    notes: Optional[str]
    verified_at: datetime


# =====================================================================
# المرحلة 3 — القياس عن بُعد + المحاكي
# =====================================================================
_DEVICE_TYPE = Literal["well_controller", "pump_controller", "reservoir_monitor",
                       "irrigation_controller", "energy_meter",
                       "environmental_station", "generic_sensor_node"]
_SENSOR_TYPE = Literal["water_level", "flow_rate", "pressure", "temperature",
                       "pump_state", "valve_state", "energy", "voltage",
                       "current", "frequency"]
_SCENARIO = Literal["NORMAL", "HIGH_DEMAND", "LOW_WATER", "PRESSURE_ANOMALY",
                    "SENSOR_FAILURE", "ENERGY_ANOMALY"]
_RULE_OP = Literal["GT", "GTE", "LT", "LTE", "EQ", "NEQ"]


class DeviceIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    device_type: _DEVICE_TYPE
    subject_type: Optional[str] = Field(default=None, max_length=50)
    subject_id: Optional[int] = None
    configuration: dict = Field(default_factory=dict)


class DeviceOut(ORM):
    id: int
    org_id: int
    name: str
    device_type: str
    status: str
    subject_type: Optional[str]
    subject_id: Optional[int]
    protocol: str
    configuration: dict
    is_simulated: bool
    is_demo: bool
    created_at: datetime


class SensorIn(BaseModel):
    device_id: int
    name: str = Field(min_length=1, max_length=255)
    sensor_type: _SENSOR_TYPE
    metric: str = Field(min_length=1, max_length=50)
    unit: str = Field(min_length=1, max_length=10)
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    subject_type: Optional[str] = Field(default=None, max_length=50)
    subject_id: Optional[int] = None
    configuration: dict = Field(default_factory=dict)


class SensorOut(ORM):
    id: int
    org_id: int
    device_id: int
    subject_type: Optional[str]
    subject_id: Optional[int]
    name: str
    sensor_type: str
    metric: str
    unit: str
    min_value: Optional[float]
    max_value: Optional[float]
    status: str
    configuration: dict
    is_simulated: bool
    is_demo: bool


class TelemetryIngestIn(BaseModel):
    sensor_id: int
    value: Optional[float] = None
    observed_at: datetime


class TelemetryOut(ORM):
    id: int
    org_id: int
    device_id: int
    sensor_id: int
    subject_type: Optional[str]
    subject_id: Optional[int]
    metric: str
    value: Optional[float]
    unit: str
    quality: str
    observed_at: datetime
    received_at: datetime
    source: str
    simulation_run_id: Optional[int]
    is_demo: bool


class TelemetryValidateOut(BaseModel):
    valid: bool
    quality: str
    errors: list[str]


class TelemetryAggregateOut(BaseModel):
    sensor_id: int
    metric: str
    unit: str
    latest: Optional[float]
    min: Optional[float]
    max: Optional[float]
    avg: Optional[float]
    sum: Optional[float]
    count: int


class SimulationRunIn(BaseModel):
    device_id: int
    scenario: _SCENARIO
    seed: int = Field(ge=0, le=2**31 - 1)
    steps: int = Field(ge=1, le=1000)  # SIM_MAX_STEPS (§32)
    step_seconds: int = Field(ge=1, le=86400)
    start_time: Optional[datetime] = None  # الافتراضي: وقت ثابت حتمي من الخادم


class SimulationRunOut(ORM):
    id: int
    org_id: int
    device_id: int
    scenario: str
    seed: int
    steps: int
    step_seconds: int
    start_time: datetime
    end_time: Optional[datetime]
    status: str
    generated_count: int
    created_by: int
    is_demo: bool
    created_at: datetime


class TelemetryRuleIn(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    domain: _DECISION_DOMAIN
    metric: str = Field(min_length=1, max_length=50)
    operator: _RULE_OP
    threshold: float
    unit: str = Field(min_length=1, max_length=10)
    severity: _DECISION_LEVEL = "medium"
    decision_type: str = Field(min_length=1, max_length=50)
    enabled: bool = True
    configuration: dict = Field(default_factory=dict)


class TelemetryRulePatchIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    operator: Optional[_RULE_OP] = None
    threshold: Optional[float] = None
    severity: Optional[_DECISION_LEVEL] = None
    enabled: Optional[bool] = None
    configuration: Optional[dict] = None


class TelemetryRuleOut(ORM):
    id: int
    org_id: int
    name: str
    domain: str
    metric: str
    operator: str
    threshold: float
    unit: str
    severity: str
    decision_type: str
    enabled: bool
    configuration: dict
    is_demo: bool
    created_at: datetime


class SimulationResultOut(BaseModel):
    run: SimulationRunOut
    generated: int
    proposals: list[GovDecisionOut]
