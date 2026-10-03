from datetime import date

from sqlalchemy import BigInteger, Boolean, Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base
from .gis_types import Geometry

BigId = BigInteger().with_variant(Integer(), "sqlite")


class AdministrativeVersion(Base):
    __tablename__ = "administrative_versions"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    valid_from: Mapped[date] = mapped_column(Date, nullable=False)
    valid_to: Mapped[date | None] = mapped_column(Date)
    source_title: Mapped[str] = mapped_column(String(255), nullable=False)
    source_uri: Mapped[str] = mapped_column(Text, nullable=False)
    source_date: Mapped[date] = mapped_column(Date, nullable=False)
    source_sha256: Mapped[str | None] = mapped_column(String(64))
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Wilaya(Base):
    __tablename__ = "wilayas"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    version_id: Mapped[int] = mapped_column(ForeignKey("administrative_versions.id"), nullable=False, index=True)
    reference_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    official_code: Mapped[str | None] = mapped_column(String(20), index=True)
    operational_from: Mapped[date | None] = mapped_column(Date)
    name_ar: Mapped[str] = mapped_column(String(150), nullable=False)
    name_fr: Mapped[str] = mapped_column(String(150), nullable=False)
    name_en: Mapped[str] = mapped_column(String(150), nullable=False)
    source_uri: Mapped[str] = mapped_column(Text, nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    geom: Mapped[object | None] = mapped_column(Geometry("MultiPolygon", 4326).with_variant(Text(), "sqlite"))

    version: Mapped[AdministrativeVersion] = relationship()


class Daira(Base):
    __tablename__ = "dairas"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    version_id: Mapped[int] = mapped_column(ForeignKey("administrative_versions.id"), nullable=False, index=True)
    wilaya_id: Mapped[int] = mapped_column(ForeignKey("wilayas.id"), nullable=False, index=True)
    reference_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    official_code: Mapped[str | None] = mapped_column(String(30), index=True)
    name_ar: Mapped[str] = mapped_column(String(150), nullable=False)
    name_fr: Mapped[str] = mapped_column(String(150), nullable=False)
    name_en: Mapped[str] = mapped_column(String(150), nullable=False)
    source_uri: Mapped[str] = mapped_column(Text, nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    geom: Mapped[object | None] = mapped_column(Geometry("MultiPolygon", 4326).with_variant(Text(), "sqlite"))

    wilaya: Mapped[Wilaya] = relationship()


class Commune(Base):
    __tablename__ = "communes"

    id: Mapped[int] = mapped_column(BigId, primary_key=True)
    version_id: Mapped[int] = mapped_column(ForeignKey("administrative_versions.id"), nullable=False, index=True)
    wilaya_id: Mapped[int] = mapped_column(ForeignKey("wilayas.id"), nullable=False, index=True)
    daira_id: Mapped[int | None] = mapped_column(ForeignKey("dairas.id"), index=True)
    reference_key: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    official_code: Mapped[str | None] = mapped_column(String(30), index=True)
    name_ar: Mapped[str] = mapped_column(String(150), nullable=False)
    name_fr: Mapped[str] = mapped_column(String(150), nullable=False)
    name_en: Mapped[str] = mapped_column(String(150), nullable=False)
    source_uri: Mapped[str] = mapped_column(Text, nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    geom: Mapped[object | None] = mapped_column(Geometry("MultiPolygon", 4326).with_variant(Text(), "sqlite"))

    wilaya: Mapped[Wilaya] = relationship()
    daira: Mapped[Daira | None] = relationship()
