"""Public sourced reference data and private project analysis snapshots."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from .db import Base
from .models import BigId, PortableJSON


class NationalWilaya(Base):
    __tablename__ = "national_wilayas"
    code: Mapped[str] = mapped_column(String(2), primary_key=True)
    ar: Mapped[str] = mapped_column(String(100))
    fr: Mapped[str] = mapped_column(String(100))
    en: Mapped[str] = mapped_column(String(100))
    version: Mapped[str] = mapped_column(String(50))
    sources: Mapped[list] = mapped_column(PortableJSON)


class ReferenceEntry(Base):
    __tablename__ = "reference_entries"
    code: Mapped[str] = mapped_column(String(80), primary_key=True)
    category: Mapped[str] = mapped_column(String(20), index=True)
    domain: Mapped[str] = mapped_column(String(20), index=True)
    content: Mapped[dict] = mapped_column(PortableJSON)
    source_url: Mapped[str] = mapped_column(Text)
    publisher: Mapped[str] = mapped_column(String(100))
    version: Mapped[str] = mapped_column(String(40))
    checked_on: Mapped[str] = mapped_column(String(10))


class EconomicScenario(Base):
    __tablename__ = "economic_scenarios"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    title: Mapped[str] = mapped_column(String(255))
    assumptions: Mapped[dict] = mapped_column(PortableJSON)
    results: Mapped[dict] = mapped_column(PortableJSON)
    input_hash: Mapped[str] = mapped_column(String(64))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class LabWaterAnalysis(Base):
    __tablename__ = "lab_water_analyses"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    evidence_id: Mapped[int] = mapped_column(ForeignKey("evidences.id"))
    source: Mapped[str] = mapped_column(String(255))
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    content: Mapped[dict] = mapped_column(PortableJSON)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())


class AIAnalysisRun(Base):
    __tablename__ = "ai_analysis_runs"
    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    org_id: Mapped[int] = mapped_column(ForeignKey("organizations.id"), index=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    domain: Mapped[str] = mapped_column(String(20))
    locale: Mapped[str] = mapped_column(String(2))
    question: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), index=True)
    snapshot: Mapped[dict] = mapped_column(PortableJSON)
    results: Mapped[dict] = mapped_column(PortableJSON)
    input_hash: Mapped[str] = mapped_column(String(64))
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.current_timestamp())
