from datetime import datetime

from sqlalchemy import (BigInteger, Boolean, CheckConstraint, DateTime,
                        ForeignKey, Index, Integer, JSON, Numeric, String, Text,
                        UniqueConstraint, func)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base

# أنواع محمولة بين المحركين:
# PortableJSON — JSONB على PostgreSQL، JSON عادي على SQLite.
# BigId — BIGINT على PostgreSQL، INTEGER على SQLite (شرط autoincrement هناك).
PortableJSON = JSON().with_variant(JSONB(), "postgresql")
BigId = BigInteger().with_variant(Integer(), "sqlite")


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name_ar: Mapped[str] = mapped_column(String(255), nullable=False)
    name_fr: Mapped[str] = mapped_column(String(255), nullable=False)
    name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="member")  # member | reviewer | admin
    locale: Mapped[str] = mapped_column(String(5), nullable=False, default="ar")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())

    org: Mapped[Organization] = relationship()


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    wilaya: Mapped[str] = mapped_column(String(100), nullable=False)
    commune: Mapped[str | None] = mapped_column(String(100))
    lat: Mapped[float | None] = mapped_column(Numeric(9, 5))
    lon: Mapped[float | None] = mapped_column(Numeric(9, 5))
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class WaterResource(Base):
    __tablename__ = "water_resources"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(30), nullable=False)  # foggara | borehole | spring | well | dam
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())

    site: Mapped[Site] = relationship()


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    resource_id: Mapped[int] = mapped_column(ForeignKey("water_resources.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String(50), nullable=False)  # gallery | mother_well | pump | channel | sensor
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="operational")
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    domain: Mapped[str] = mapped_column(String(20), nullable=False, default="water")  # wefeh domain
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # draft|active|suspended|closed
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"))
    resource_id: Mapped[int | None] = mapped_column(ForeignKey("water_resources.id"))
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id"))
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp(), onupdate=func.current_timestamp())

    site: Mapped[Site | None] = relationship()
    resource: Mapped[WaterResource | None] = relationship()
    asset: Mapped[Asset | None] = relationship()


class Measurement(Base):
    __tablename__ = "measurements"
    __table_args__ = (Index("ix_measurements_series", "org_id", "project_id", "parameter", "unit", "measured_at", "id"),)

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    resource_id: Mapped[int | None] = mapped_column(ForeignKey("water_resources.id"))
    parameter: Mapped[str] = mapped_column(String(50), nullable=False)  # see services/indicators.PARAMETERS
    value: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    measured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source: Mapped[str] = mapped_column(String(255), nullable=False)  # جهة/مصدر القياس
    method: Mapped[str] = mapped_column(String(255), nullable=False)  # طريقة القياس
    source_type: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")  # manual|instrument|imported
    import_batch_ref: Mapped[str | None] = mapped_column(String(120), index=True)
    instrument_id: Mapped[int | None] = mapped_column(ForeignKey("instruments.id"))
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id"))
    quality_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")  # pending|validated|rejected
    # التحقق المترولوجي (معايرة الأداة) — منفصل عن quality_status الخاص بسير المراجعة
    verification_status: Mapped[str] = mapped_column(String(20), nullable=False, default="unverified")  # unverified|verified|rejected
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    submitted_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())

    instrument: Mapped["Instrument | None"] = relationship()


class Evidence(Base):
    __tablename__ = "evidences"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    measurement_id: Mapped[int | None] = mapped_column(ForeignKey("measurements.id"))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(50), nullable=False)  # report | photo | lab_result | permit | field_note
    license: Mapped[str] = mapped_column(String(255), nullable=False)  # رخصة/مصدر الوثيقة (إلزامي)
    uri: Mapped[str | None] = mapped_column(Text)  # رابط مرجعي اختياري
    content_note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="submitted")  # submitted|under_review|verified|rejected
    resolution: Mapped[str | None] = mapped_column(String(30))  # accepted|rejected|request_clarification (آخر قرار مراجعة)
    clarification_note: Mapped[str | None] = mapped_column(Text)  # ما طُلب توضيحه من المراجع
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    submitted_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    target_type: Mapped[str] = mapped_column(String(20), nullable=False)  # measurement | evidence
    target_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    reviewer_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    decision: Mapped[str] = mapped_column(String(30), nullable=False)  # accepted | rejected | request_clarification
    note: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())

    reviewer: Mapped[User] = relationship()


class Indicator(Base):
    __tablename__ = "indicators"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name_ar: Mapped[str] = mapped_column(String(255), nullable=False)
    name_fr: Mapped[str] = mapped_column(String(255), nullable=False)
    name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    formula: Mapped[str] = mapped_column(Text, nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    source: Mapped[str] = mapped_column(String(255), nullable=False)
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Recommendation(Base):
    __tablename__ = "recommendations"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    indicator_code: Mapped[str] = mapped_column(String(50), nullable=False)
    basis: Mapped[str] = mapped_column(Text, nullable=False)  # شرح قابل للتفسير: القيمة والعتبة والنافذة
    evidence_ids: Mapped[list] = mapped_column(PortableJSON, nullable=False, default=list)
    text_ar: Mapped[str] = mapped_column(Text, nullable=False)
    text_fr: Mapped[str] = mapped_column(Text, nullable=False)
    text_en: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="proposed")  # proposed|accepted|rejected
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class Decision(Base):
    __tablename__ = "decisions"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    recommendation_id: Mapped[int] = mapped_column(ForeignKey("recommendations.id"), nullable=False)
    decision: Mapped[str] = mapped_column(String(20), nullable=False)  # approved | rejected | modified
    rationale: Mapped[str] = mapped_column(Text, nullable=False)
    decided_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())

    recommendation: Mapped[Recommendation] = relationship()
    decider: Mapped[User] = relationship()


class Action(Base):
    __tablename__ = "actions"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    decision_id: Mapped[int | None] = mapped_column(ForeignKey("decisions.id"))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    assignee: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="open")  # open|in_progress|done
    result_note: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp(), onupdate=func.current_timestamp())


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), index=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(30), nullable=False)
    entity_id: Mapped[int | None] = mapped_column(BigInteger)
    meta: Mapped[dict] = mapped_column(PortableJSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())

    user: Mapped[User | None] = relationship()


# ---------- Metrology ----------
class Instrument(Base):
    __tablename__ = "instruments"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(50), nullable=False)  # flow_meter | pressure_gauge | ph_meter | ...
    serial_number: Mapped[str] = mapped_column(String(100), nullable=False)
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"))
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id"))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")  # active|maintenance|out_of_service
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())

    site: Mapped[Site | None] = relationship()


class Calibration(Base):
    __tablename__ = "calibrations"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"), nullable=False, index=True)
    calibrated_on: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    authority: Mapped[str] = mapped_column(String(255), nullable=False)  # الجهة المعايرة
    result: Mapped[str] = mapped_column(String(20), nullable=False)  # pass | fail
    next_due: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    certificate_id: Mapped[int | None] = mapped_column(ForeignKey("certificates.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())

    instrument: Mapped[Instrument] = relationship()


class Certificate(Base):
    """شهادة معايرة/مطابقة — كيان له حالة وصلاحية وجهة إصدار، وليس مجرد URI."""
    __tablename__ = "certificates"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    instrument_id: Mapped[int | None] = mapped_column(ForeignKey("instruments.id"), index=True)
    number: Mapped[str] = mapped_column(String(100), nullable=False)
    issuer: Mapped[str] = mapped_column(String(255), nullable=False)  # جهة الإصدار
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")  # draft|active|expired|revoked
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    valid_to: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    uri: Mapped[str | None] = mapped_column(Text)  # مرفق اختياري
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class Inspection(Base):
    __tablename__ = "inspections"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    instrument_id: Mapped[int | None] = mapped_column(ForeignKey("instruments.id"))
    asset_id: Mapped[int | None] = mapped_column(ForeignKey("assets.id"))
    inspected_on: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    inspector: Mapped[str] = mapped_column(String(255), nullable=False)
    result: Mapped[str] = mapped_column(String(20), nullable=False)  # pass | fail | conditional
    notes: Mapped[str | None] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


# ---------- Services catalog ----------
class Service(Base):
    """كتالوج خدمات عام (داخل الجلسة) — لا ينتمي لمؤسسة واحدة."""
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    # calibration|inspection|measurement|technical_study|irrigation_service|maintenance|consultation
    name_ar: Mapped[str] = mapped_column(String(255), nullable=False)
    name_fr: Mapped[str] = mapped_column(String(255), nullable=False)
    name_en: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str] = mapped_column(String(255), nullable=False)  # الجهة المقدمة
    domain: Mapped[str | None] = mapped_column(String(20))  # water|energy|food|ecosystem|health أو None = عابر للمجالات
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class ServiceRequest(Base):
    __tablename__ = "service_requests"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    service_id: Mapped[int] = mapped_column(ForeignKey("services.id"), nullable=False)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"))
    site_id: Mapped[int | None] = mapped_column(ForeignKey("sites.id"))
    requesting_entity: Mapped[str | None] = mapped_column(String(255))  # الجهة الطالبة (وصف حر داخل المؤسسة)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="submitted")
    # submitted|triaged|assigned|in_progress|completed|cancelled
    notes: Mapped[str | None] = mapped_column(Text)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp(), onupdate=func.current_timestamp())

    service: Mapped[Service] = relationship()


# ---------- Human decisions (governance) ----------
class HumanDecision(Base):
    """قرار بشري موثق على مشروع/توصية/إجراء — reviewer/admin فقط، والسبب إلزامي."""
    __tablename__ = "human_decisions"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), nullable=False, index=True)
    recommendation_id: Mapped[int | None] = mapped_column(ForeignKey("recommendations.id"))
    action_id: Mapped[int | None] = mapped_column(ForeignKey("actions.id"))
    decision: Mapped[str] = mapped_column(String(20), nullable=False)  # approve | reject | defer
    reason: Mapped[str] = mapped_column(Text, nullable=False)  # إلزامي
    evidence_ids: Mapped[list] = mapped_column(PortableJSON, nullable=False, default=list)
    decided_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())

    decider: Mapped[User] = relationship()


# ══════════════════════════════════════════════════════════════
# نطاق المياه (Architecture Contract §4) — المرحلة 1
# السلسلة: مصدر (بئر/خزان) → ضخ → توزيع (صمام) → منطقة سقي → تخصيص
# القراءات (WaterReading/FlowMeasurement/WaterQualityObservation) تُغطى عبر
# خط القياسات والمترولوجيا القائم (القاعدة 1 — لا إعادة بناء لما يعمل).
# ══════════════════════════════════════════════════════════════


class Well(Base):
    __tablename__ = "wells"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    depth_m: Mapped[float | None] = mapped_column(Numeric(8, 2))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class Reservoir(Base):
    __tablename__ = "reservoirs"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    capacity_m3: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    min_level_m: Mapped[float | None] = mapped_column(Numeric(8, 2))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class Pump(Base):
    __tablename__ = "pumps"
    __table_args__ = (
        # المضخة تسحب من مصدر واحد بالضبط: بئر أو خزان (قيد DB — القاعدة 8)
        CheckConstraint("(well_id IS NULL) <> (reservoir_id IS NULL)", name="ck_pump_exactly_one_source"),
    )

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    well_id: Mapped[int | None] = mapped_column(ForeignKey("wells.id"))
    reservoir_id: Mapped[int | None] = mapped_column(ForeignKey("reservoirs.id"))
    rated_power_kw: Mapped[float | None] = mapped_column(Numeric(8, 2))
    rated_flow_l_s: Mapped[float | None] = mapped_column(Numeric(8, 2))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class VFD(Base):
    __tablename__ = "vfds"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    pump_id: Mapped[int] = mapped_column(ForeignKey("pumps.id"), nullable=False, index=True)
    model: Mapped[str] = mapped_column(String(255), nullable=False)
    max_frequency_hz: Mapped[float | None] = mapped_column(Numeric(5, 1))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class IrrigationZone(Base):
    __tablename__ = "irrigation_zones"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    area_ha: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    soil_type: Mapped[str | None] = mapped_column(String(100))
    crop_hint: Mapped[str | None] = mapped_column(String(100))
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class Valve(Base):
    __tablename__ = "valves"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), nullable=False, index=True)
    zone_id: Mapped[int | None] = mapped_column(ForeignKey("irrigation_zones.id"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    diameter_mm: Mapped[float | None] = mapped_column(Numeric(6, 1))
    normally_open: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


# حالات التخصيص: انتقالات مضبوطة من الخادم (تمهيد لـ§14 — محرك القرارات لاحقًا)
ALLOCATION_STATUSES = ("proposed", "approved", "executed", "cancelled")
ALLOCATION_TRANSITIONS = {
    "proposed": {"approved", "cancelled"},
    "approved": {"executed", "cancelled"},
    "executed": set(),
    "cancelled": set(),
}


class WaterAllocation(Base):
    __tablename__ = "water_allocations"
    __table_args__ = (
        CheckConstraint("volume_m3 > 0", name="ck_allocation_volume_positive"),
        CheckConstraint("period_end > period_start", name="ck_allocation_period_order"),
        CheckConstraint("(well_id IS NULL) <> (reservoir_id IS NULL)", name="ck_allocation_exactly_one_source"),
    )

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    zone_id: Mapped[int] = mapped_column(ForeignKey("irrigation_zones.id"), nullable=False, index=True)
    well_id: Mapped[int | None] = mapped_column(ForeignKey("wells.id"))
    reservoir_id: Mapped[int | None] = mapped_column(ForeignKey("reservoirs.id"))
    volume_m3: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="proposed")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())



# =====================================================================
# المرحلة 2 — محرك القرارات العام (Contract §5..§11)
# طبقة عامة مستقلة عن المجال: تخدم water/energy/food/ecosystem/health/cross_domain
# دون أن تنفّذ أيًّا منها. التنفيذ تسجيلي فقط (RECORD-ONLY) — لا أوامر لأي معدات.
# ملاحظة توافق (R1): جدول `decisions` القديم مخصص لقرارات التوصيات في insight
# وتشير إليه actions.decision_id — لذلك تستخدم كيانات هذه المرحلة بادئة gov_*
# دون المساس بالقاعدة القائمة. مسار الـ API يبقى /api/decisions (§14).
# =====================================================================

DECISION_DOMAINS = ("water", "energy", "food", "ecosystem", "health", "cross_domain")
DECISION_PRIORITIES = ("low", "medium", "high", "critical")
DECISION_RISK_LEVELS = ("low", "medium", "high", "critical")

DECISION_STATUSES = (
    "PROPOSED", "REVIEW_REQUIRED", "APPROVED", "EXECUTION_AUTHORIZED",
    "EXECUTED", "VERIFIED", "CANCELLED",
)

# آلة الحالات — مصدر الحقيقة الوحيد (تُفرض في الخادم، لا في الواجهة).
# لا انتقالات عكسية ولا تغييرات اعتباطية.
DECISION_TRANSITIONS = {
    "PROPOSED": {"REVIEW_REQUIRED", "CANCELLED"},
    "REVIEW_REQUIRED": {"APPROVED", "CANCELLED"},
    "APPROVED": {"EXECUTION_AUTHORIZED", "CANCELLED"},
    "EXECUTION_AUTHORIZED": {"EXECUTED", "CANCELLED"},
    "EXECUTED": {"VERIFIED"},
    "VERIFIED": set(),
    "CANCELLED": set(),
}

EVIDENCE_TYPES = (
    "measurement", "sensor", "manual_observation", "calculation", "rule",
    "model", "document", "inspection", "satellite", "expert_assessment",
)

VERIFICATION_STATUSES = ("PASSED", "FAILED", "PARTIAL", "INCONCLUSIVE")


class GovDecision(Base):
    """قرار عام — يشير إلى كيانات قائمة (subject_type/subject_id) دون استبدالها."""
    __tablename__ = "gov_decisions"
    __table_args__ = (
        CheckConstraint("domain IN ('water','energy','food','ecosystem','health','cross_domain')",
                        name="ck_gdecision_domain"),
        CheckConstraint("status IN ('PROPOSED','REVIEW_REQUIRED','APPROVED','EXECUTION_AUTHORIZED','EXECUTED','VERIFIED','CANCELLED')",
                        name="ck_gdecision_status"),
        CheckConstraint("priority IN ('low','medium','high','critical')", name="ck_gdecision_priority"),
        CheckConstraint("risk_level IN ('low','medium','high','critical')", name="ck_gdecision_risk"),
        CheckConstraint("valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from",
                        name="ck_gdecision_validity_order"),
    )

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    domain: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    decision_type: Mapped[str] = mapped_column(String(50), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="PROPOSED", index=True)
    priority: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")
    risk_level: Mapped[str] = mapped_column(String(10), nullable=False, default="low")
    # مرجع عام لمورد قائم (مثل water_allocation/17) — لا ينشئ نسخة ثانية منه
    subject_type: Mapped[str | None] = mapped_column(String(50))
    subject_id: Mapped[int | None] = mapped_column(BigInteger)
    source_type: Mapped[str | None] = mapped_column(String(50))
    source_id: Mapped[str | None] = mapped_column(String(100))
    proposed_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    authorized_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    executed_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    verified_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    proposed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    authorized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reason: Mapped[str | None] = mapped_column(Text)
    expected_result: Mapped[str | None] = mapped_column(Text)
    actual_result: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict] = mapped_column("metadata", PortableJSON, nullable=False, default=dict)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp(),
                                                 onupdate=func.current_timestamp())


class GovDecisionEvidence(Base):
    """دليل مرفق بقرار — أنواع بيانات فقط (لا تكامل أقمار/IoT في هذه المرحلة)."""
    __tablename__ = "gov_decision_evidence"
    __table_args__ = (
        CheckConstraint(
            "evidence_type IN ('measurement','sensor','manual_observation','calculation','rule','model','document','inspection','satellite','expert_assessment')",
            name="ck_gevidence_type"),
    )

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    decision_id: Mapped[int] = mapped_column(ForeignKey("gov_decisions.id"), nullable=False, index=True)
    evidence_type: Mapped[str] = mapped_column(String(30), nullable=False)
    source_type: Mapped[str | None] = mapped_column(String(50))
    source_id: Mapped[str | None] = mapped_column(String(100))
    value: Mapped[float | None] = mapped_column(Numeric(18, 4))
    unit: Mapped[str | None] = mapped_column(String(30))
    observed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    quality: Mapped[str | None] = mapped_column(String(20))
    meta: Mapped[dict] = mapped_column("metadata", PortableJSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class GovDecisionTransition(Base):
    """سجل انتقالات — كل انتقال ناجح يُنشئ سجلًا هنا + قيد تدقيق."""
    __tablename__ = "gov_decision_transitions"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    decision_id: Mapped[int] = mapped_column(ForeignKey("gov_decisions.id"), nullable=False, index=True)
    from_status: Mapped[str] = mapped_column(String(24), nullable=False)
    to_status: Mapped[str] = mapped_column(String(24), nullable=False)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    actor_role: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    comment: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict] = mapped_column("metadata", PortableJSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class GovDecisionExecution(Base):
    """سجل تنفيذ — تسجيلي فقط. ليس واجهة تحكم بمعدات (لا مضخات/صمامات/PLC/SCADA)."""
    __tablename__ = "gov_decision_executions"
    __table_args__ = (
        # حماية من تكرار التنفيذ: المفتاح نفسه للقرار نفسه لا يُنشئ سجلًا ثانيًا
        UniqueConstraint("decision_id", "idempotency_key", name="uq_gexecution_idempotency"),
    )

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    decision_id: Mapped[int] = mapped_column(ForeignKey("gov_decisions.id"), nullable=False, index=True)
    execution_type: Mapped[str] = mapped_column(String(50), nullable=False)
    execution_reference: Mapped[str | None] = mapped_column(String(100))
    idempotency_key: Mapped[str | None] = mapped_column(String(100))
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    executor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    result: Mapped[str | None] = mapped_column(Text)
    result_code: Mapped[str | None] = mapped_column(String(50))
    success: Mapped[bool | None] = mapped_column(Boolean)
    failure_reason: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict] = mapped_column("metadata", PortableJSON, nullable=False, default=dict)


class GovDecisionVerification(Base):
    """تحقق من نتيجة التنفيذ — القرار لا يبلغ VERIFIED إلا عبر سجل PASSED."""
    __tablename__ = "gov_decision_verifications"
    __table_args__ = (
        CheckConstraint("verification_status IN ('PASSED','FAILED','PARTIAL','INCONCLUSIVE')",
                        name="ck_gverification_status"),
    )

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    decision_id: Mapped[int] = mapped_column(ForeignKey("gov_decisions.id"), nullable=False, index=True)
    verified_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    verification_status: Mapped[str] = mapped_column(String(15), nullable=False)
    expected_result: Mapped[str | None] = mapped_column(Text)
    observed_result: Mapped[str | None] = mapped_column(Text)
    verification_method: Mapped[str | None] = mapped_column(String(50))
    notes: Mapped[str | None] = mapped_column(Text)
    verified_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())



# =====================================================================
# المرحلة 3 — القياس عن بُعد الحتمي + محاكي IoT (Phase 03)
# طبقة محاكاة آمنة تولّد قراءات واقعية الشكل وتغذّي محرك القرارات.
# لا تحكم بأي معدات مادية — تنتهي عند «اقتراح قرار» فقط (§25/§39).
# =====================================================================

DEVICE_TYPES = ("well_controller", "pump_controller", "reservoir_monitor",
                "irrigation_controller", "energy_meter", "environmental_station",
                "generic_sensor_node")
DEVICE_STATUSES = ("active", "inactive", "maintenance", "decommissioned")

SENSOR_TYPES = ("water_level", "flow_rate", "pressure", "temperature",
                "pump_state", "valve_state", "energy", "voltage", "current",
                "frequency")

TELEMETRY_UNITS = ("L/s", "m3/h", "m3", "m", "bar", "°C", "%", "kW", "kWh",
                   "V", "A", "Hz", "state")

TELEMETRY_QUALITIES = ("VALID", "INVALID", "SUSPECT", "MISSING")
TELEMETRY_SOURCES = ("simulator", "manual", "api")

SIMULATION_SCENARIOS = ("NORMAL", "HIGH_DEMAND", "LOW_WATER",
                        "PRESSURE_ANOMALY", "SENSOR_FAILURE", "ENERGY_ANOMALY")
SIMULATION_RUN_STATUSES = ("CREATED", "RUNNING", "COMPLETED", "FAILED", "CANCELLED")

RULE_OPERATORS = ("GT", "GTE", "LT", "LTE", "EQ", "NEQ")
RULE_SEVERITIES = ("low", "medium", "high", "critical")

# حدود أمان الأداء (§32)
SIM_MAX_STEPS = 1000
TELEMETRY_QUERY_MAX_LIMIT = 1000
TELEMETRY_QUERY_MAX_DAYS = 92


class Device(Base):
    """تجريد جهاز فقط — لا اتصال بأي عتاد حقيقي."""
    __tablename__ = "devices"
    __table_args__ = (
        CheckConstraint("device_type IN ('well_controller','pump_controller','reservoir_monitor','irrigation_controller','energy_meter','environmental_station','generic_sensor_node')",
                        name="ck_device_type"),
        CheckConstraint("status IN ('active','inactive','maintenance','decommissioned')",
                        name="ck_device_status"),
    )

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    device_type: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    subject_type: Mapped[str | None] = mapped_column(String(50))
    subject_id: Mapped[int | None] = mapped_column(BigInteger)
    protocol: Mapped[str] = mapped_column(String(20), nullable=False, default="simulated")
    configuration: Mapped[dict] = mapped_column(PortableJSON, nullable=False, default=dict)
    is_simulated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp(),
                                                 onupdate=func.current_timestamp())


class Sensor(Base):
    """مستشعر منطقي مرتبط بجهاز ومورد قائم — بلا مشغّلات عتاد."""
    __tablename__ = "sensors"
    __table_args__ = (
        CheckConstraint("sensor_type IN ('water_level','flow_rate','pressure','temperature','pump_state','valve_state','energy','voltage','current','frequency')",
                        name="ck_sensor_type"),
        CheckConstraint("max_value IS NULL OR min_value IS NULL OR max_value > min_value",
                        name="ck_sensor_range_order"),
    )

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), nullable=False, index=True)
    subject_type: Mapped[str | None] = mapped_column(String(50))
    subject_id: Mapped[int | None] = mapped_column(BigInteger)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sensor_type: Mapped[str] = mapped_column(String(30), nullable=False)
    metric: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    unit: Mapped[str] = mapped_column(String(10), nullable=False)
    min_value: Mapped[float | None] = mapped_column(Numeric(18, 4))
    max_value: Mapped[float | None] = mapped_column(Numeric(18, 4))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    configuration: Mapped[dict] = mapped_column(PortableJSON, nullable=False, default=dict)
    is_simulated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp(),
                                                 onupdate=func.current_timestamp())

    device: Mapped[Device] = relationship()


class SimulationRun(Base):
    """تشغيلة محاكاة حتمية — نفس المدخلات تنتج نفس المخرجات دائمًا."""
    __tablename__ = "simulation_runs"
    __table_args__ = (
        CheckConstraint("scenario IN ('NORMAL','HIGH_DEMAND','LOW_WATER','PRESSURE_ANOMALY','SENSOR_FAILURE','ENERGY_ANOMALY')",
                        name="ck_simrun_scenario"),
        CheckConstraint("status IN ('CREATED','RUNNING','COMPLETED','FAILED','CANCELLED')",
                        name="ck_simrun_status"),
        CheckConstraint("steps > 0", name="ck_simrun_steps_positive"),
        CheckConstraint("step_seconds > 0", name="ck_simrun_step_seconds_positive"),
    )

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), nullable=False, index=True)
    scenario: Mapped[str] = mapped_column(String(30), nullable=False)
    seed: Mapped[int] = mapped_column(BigInteger, nullable=False)
    steps: Mapped[int] = mapped_column(Integer, nullable=False)
    step_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(15), nullable=False, default="CREATED")
    generated_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    configuration: Mapped[dict] = mapped_column(PortableJSON, nullable=False, default=dict)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())

    device: Mapped[Device] = relationship()


class TelemetryReading(Base):
    """قراءة قياس عن بُعد عامة — تدعم الأجهزة الحقيقية مستقبلًا دون إعادة كتابة."""
    __tablename__ = "telemetry_readings"
    __table_args__ = (
        CheckConstraint("quality IN ('VALID','INVALID','SUSPECT','MISSING')",
                        name="ck_telemetry_quality"),
        CheckConstraint("source IN ('simulator','manual','api')",
                        name="ck_telemetry_source"),
        # حماية من التكرار (§18): هوية استيعاب حتمية
        UniqueConstraint("sensor_id", "observed_at", "metric",
                         name="uq_telemetry_ingestion_identity"),
    )

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("devices.id"), nullable=False, index=True)
    sensor_id: Mapped[int] = mapped_column(ForeignKey("sensors.id"), nullable=False, index=True)
    subject_type: Mapped[str | None] = mapped_column(String(50))
    subject_id: Mapped[int | None] = mapped_column(BigInteger)
    metric: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    value: Mapped[float | None] = mapped_column(Numeric(18, 4))
    unit: Mapped[str] = mapped_column(String(10), nullable=False)
    quality: Mapped[str] = mapped_column(String(10), nullable=False, index=True)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    source: Mapped[str] = mapped_column(String(15), nullable=False)
    simulation_run_id: Mapped[int | None] = mapped_column(ForeignKey("simulation_runs.id"), index=True)
    meta: Mapped[dict] = mapped_column("metadata", PortableJSON, nullable=False, default=dict)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class TelemetryRule(Base):
    """قاعدة حتمية صريحة — عتبة وعامل فقط، بلا عبارات قابلة للتنفيذ (§21)."""
    __tablename__ = "telemetry_rules"
    __table_args__ = (
        CheckConstraint("operator IN ('GT','GTE','LT','LTE','EQ','NEQ')",
                        name="ck_rule_operator"),
        CheckConstraint("severity IN ('low','medium','high','critical')",
                        name="ck_rule_severity"),
        CheckConstraint("domain IN ('water','energy','food','ecosystem','health','cross_domain')",
                        name="ck_rule_domain"),
    )

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    domain: Mapped[str] = mapped_column(String(20), nullable=False)
    metric: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    operator: Mapped[str] = mapped_column(String(3), nullable=False)
    threshold: Mapped[float] = mapped_column(Numeric(18, 4), nullable=False)
    unit: Mapped[str] = mapped_column(String(10), nullable=False)
    severity: Mapped[str] = mapped_column(String(10), nullable=False, default="medium")
    decision_type: Mapped[str] = mapped_column(String(50), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    configuration: Mapped[dict] = mapped_column(PortableJSON, nullable=False, default=dict)
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp(),
                                                 onupdate=func.current_timestamp())

# Agriculture: append-only evidence and reviewable irrigation scenarios.
class AgriParcel(Base):
    __tablename__ = 'agri_parcels'
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey('organizations.id'), index=True)
    name: Mapped[str] = mapped_column(String(160))
    crop: Mapped[str] = mapped_column(String(80))
    area_ha: Mapped[float] = mapped_column(Numeric(12, 4))
    location: Mapped[str] = mapped_column(String(160))
    site_id: Mapped[int | None] = mapped_column(ForeignKey('sites.id'), index=True)
    lat: Mapped[float | None] = mapped_column(Numeric(9, 6))
    lon: Mapped[float | None] = mapped_column(Numeric(9, 6))
    boundary_geojson: Mapped[dict | None] = mapped_column(PortableJSON)
    stage: Mapped[str] = mapped_column(String(30), default='initial')
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[int] = mapped_column(ForeignKey('users.id'))
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    __table_args__ = (
        CheckConstraint('area_ha > 0', name='ck_agri_area'),
        CheckConstraint('(lat IS NULL AND lon IS NULL) OR (lat IS NOT NULL AND lon IS NOT NULL)', name='ck_agri_parcel_coordinate_pair'),
        CheckConstraint('lat IS NULL OR (lat >= -90 AND lat <= 90)', name='ck_agri_parcel_lat'),
        CheckConstraint('lon IS NULL OR (lon >= -180 AND lon <= 180)', name='ck_agri_parcel_lon'),
    )


class AgriObservation(Base):
    __tablename__ = 'agri_observations'
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey('organizations.id'), index=True)
    parcel_id: Mapped[int] = mapped_column(ForeignKey('agri_parcels.id'), index=True)
    metric: Mapped[str] = mapped_column(String(30))
    value: Mapped[float] = mapped_column(Numeric(16, 6))
    unit: Mapped[str] = mapped_column(String(30))
    source_type: Mapped[str] = mapped_column(String(30))
    source_ref: Mapped[str] = mapped_column(String(300))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    evidence_status: Mapped[str] = mapped_column(String(20), default='OBSERVED')
    created_by: Mapped[int] = mapped_column(ForeignKey('users.id'))
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    verified_by: Mapped[int | None] = mapped_column(ForeignKey('users.id'))
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    __table_args__ = (CheckConstraint("evidence_status IN ('OBSERVED','INFERRED','VERIFIED')", name='ck_agri_evidence'),)


class AgriPlan(Base):
    __tablename__ = 'agri_plans'
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey('organizations.id'), index=True)
    parcel_id: Mapped[int] = mapped_column(ForeignKey('agri_parcels.id'), index=True)
    inputs: Mapped[dict] = mapped_column(PortableJSON)
    result: Mapped[dict] = mapped_column(PortableJSON)
    created_by: Mapped[int] = mapped_column(ForeignKey('users.id'))
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class AgriTask(Base):
    __tablename__ = 'agri_tasks'
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey('organizations.id'), index=True)
    parcel_id: Mapped[int] = mapped_column(ForeignKey('agri_parcels.id'), index=True)
    title: Mapped[str] = mapped_column(String(200))
    due_date: Mapped[str] = mapped_column(String(10))
    completed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_by: Mapped[int] = mapped_column(ForeignKey('users.id'))
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
