"""Operational collaboration records; existing domain tables remain unchanged."""
from datetime import datetime
from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, LargeBinary, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base
from .models import BigId, PortableJSON


class Invitation(Base):
    __tablename__ = "organization_invitations"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    email: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    __table_args__ = (CheckConstraint("role IN ('member','reviewer')"), CheckConstraint("status IN ('pending','accepted','revoked')"))


class EvidenceFile(Base):
    __tablename__ = "evidence_files"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    evidence_id: Mapped[int] = mapped_column(ForeignKey("evidences.id"), index=True)
    filename: Mapped[str] = mapped_column(String(200))
    media_type: Mapped[str] = mapped_column(String(100))
    sha256: Mapped[str] = mapped_column(String(64))
    size: Mapped[int] = mapped_column(BigId)
    content: Mapped[bytes] = mapped_column(LargeBinary)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    __table_args__ = (CheckConstraint("size > 0 AND size <= 5242880"),)


class DataRoom(Base):
    __tablename__ = "data_rooms"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    purpose: Mapped[str] = mapped_column(Text)
    discoverable: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="open")
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    __table_args__ = (CheckConstraint("status IN ('open','closed')"),)


class RoomAccess(Base):
    __tablename__ = "room_access"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("data_rooms.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    decision_reason: Mapped[str | None] = mapped_column(Text)
    decided_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    __table_args__ = (UniqueConstraint("room_id", "user_id"), CheckConstraint("status IN ('pending','approved','rejected','revoked')"))


class RoomDisclosure(Base):
    __tablename__ = "room_disclosures"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("data_rooms.id"), index=True)
    evidence_id: Mapped[int] = mapped_column(ForeignKey("evidences.id"))
    disclosed_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    __table_args__ = (UniqueConstraint("room_id", "evidence_id"),)


class RoomQuestion(Base):
    __tablename__ = "room_questions"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    room_id: Mapped[int] = mapped_column(ForeignKey("data_rooms.id"), index=True)
    asked_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str | None] = mapped_column(Text)
    answered_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class NexusResource(Base):
    __tablename__ = "nexus_resources"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    domain: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(255))
    kind: Mapped[str] = mapped_column(String(100))
    quantity: Mapped[str] = mapped_column(String(80))
    unit: Mapped[str] = mapped_column(String(40))
    source: Mapped[str] = mapped_column(String(255))
    provenance: Mapped[str] = mapped_column(String(20), default="OBSERVED")
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    __table_args__ = (CheckConstraint("domain IN ('water','energy','food','ecosystem','health')"), CheckConstraint("provenance IN ('OBSERVED','PROPOSED')"))


class Opportunity(Base):
    __tablename__ = "opportunities"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    domain: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(20))
    category: Mapped[str] = mapped_column(String(40))
    wilaya: Mapped[str | None] = mapped_column(String(100))
    room_id: Mapped[int | None] = mapped_column(ForeignKey("data_rooms.id"))
    published: Mapped[bool] = mapped_column(Boolean, default=False)
    consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    consent_version: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(20), default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    __table_args__ = (CheckConstraint("domain IN ('water','energy','food','ecosystem','health')"), CheckConstraint("kind IN ('need','offer')"), CheckConstraint("status IN ('open','closed')"), CheckConstraint("NOT published OR consent_at IS NOT NULL"))


class RiskRecord(Base):
    __tablename__ = "project_risks"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    likelihood: Mapped[int] = mapped_column(Integer)
    severity: Mapped[int] = mapped_column(Integer)
    mitigation: Mapped[str] = mapped_column(Text)
    evidence_id: Mapped[int | None] = mapped_column(ForeignKey("evidences.id"))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    __table_args__ = (CheckConstraint("likelihood BETWEEN 1 AND 5"), CheckConstraint("severity BETWEEN 1 AND 5"))


class AssuranceRecord(Base):
    __tablename__ = "assurance_records"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    chain: Mapped[str] = mapped_column(String(100))
    stage: Mapped[str] = mapped_column(String(20))
    reference: Mapped[str] = mapped_column(String(255))
    amount: Mapped[float] = mapped_column(Numeric(18, 2))
    amount_basis: Mapped[str] = mapped_column(String(10), default="gross")
    evidence_id: Mapped[int] = mapped_column(ForeignKey("evidences.id"))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    __table_args__ = (UniqueConstraint("project_id", "chain", "stage", "reference"), CheckConstraint("amount >= 0"), CheckConstraint("amount_basis IN ('gross','net')"), CheckConstraint("stage IN ('contract','purchase_order','work_order','report','acceptance','variation','invoice','payment')"))


class AgriculturalRecord(Base):
    __tablename__ = "agricultural_records"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    evidence_id: Mapped[int] = mapped_column(ForeignKey("evidences.id"))
    kind: Mapped[str] = mapped_column(String(30))
    source: Mapped[str] = mapped_column(String(255))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    content: Mapped[dict] = mapped_column(PortableJSON)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
    __table_args__ = (CheckConstraint("kind IN ('satellite','soil','weather','calendar','diagnosis','forewarning','irrigation')"),)


class AuthThrottle(Base):
    __tablename__ = "auth_throttle"
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    window_start: Mapped[int] = mapped_column(BigId)
    hits: Mapped[int] = mapped_column(Integer)


class DecisionMatrixRun(Base):
    __tablename__ = 'decision_matrix_runs'
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey('organizations.id'), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey('projects.id'), index=True)
    decision_id: Mapped[int | None] = mapped_column(ForeignKey('gov_decisions.id'))
    title: Mapped[str] = mapped_column(String(255))
    inputs: Mapped[dict] = mapped_column(PortableJSON)
    results: Mapped[dict] = mapped_column(PortableJSON)
    created_by: Mapped[int] = mapped_column(ForeignKey('users.id'))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
