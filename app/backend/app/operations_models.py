from sqlalchemy import Column, String, Text, Integer, Boolean, DateTime, Numeric, ForeignKey, UniqueConstraint, func
from .db import Base
from .models import BigId, PortableJSON

class MatrixPolicy(Base):
    __tablename__ = 'matrix_policies'
    id = Column(BigId, primary_key=True)
    org_id = Column(BigId, ForeignKey('organizations.id'), nullable=False, index=True)
    version = Column(Integer, nullable=False)
    name = Column(String(150), nullable=False)
    rules = Column(PortableJSON, nullable=False)
    active = Column(Boolean, nullable=False, default=False)
    created_by = Column(BigId, ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.current_timestamp())
    __table_args__ = (UniqueConstraint('org_id', 'version'),)


class MatrixObservation(Base):
    __tablename__ = 'matrix_observations'
    id = Column(BigId, primary_key=True)
    org_id = Column(BigId, ForeignKey('organizations.id'), nullable=False, index=True)
    project_id = Column(BigId, ForeignKey('projects.id'), nullable=False, index=True)
    domain = Column(String(20), nullable=False)
    value = Column(Numeric(18,5), nullable=False)
    unit = Column(String(30), nullable=False)
    source = Column(String(500), nullable=False)
    measured_at = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(20), nullable=False, default='pending')
    submitted_by = Column(BigId, ForeignKey('users.id'), nullable=False)
    reviewed_by = Column(BigId, ForeignKey('users.id'))
    review_note = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.current_timestamp())


class MatrixEvaluation(Base):
    __tablename__ = 'matrix_evaluations'
    id = Column(BigId, primary_key=True)
    org_id = Column(BigId, ForeignKey('organizations.id'), nullable=False, index=True)
    project_id = Column(BigId, ForeignKey('projects.id'), nullable=False, index=True)
    policy_id = Column(BigId, ForeignKey('matrix_policies.id'), nullable=False)
    fingerprint = Column(String(64), nullable=False)
    result = Column(PortableJSON, nullable=False)
    status = Column(String(20), nullable=False, default='pending')
    reviewed_by = Column(BigId, ForeignKey('users.id'))
    review_note = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.current_timestamp())
    __table_args__ = (UniqueConstraint('org_id', 'fingerprint'),)


class ValueListing(Base):
    __tablename__ = 'value_listings'
    id = Column(BigId, primary_key=True)
    org_id = Column(BigId, ForeignKey('organizations.id'), nullable=False, index=True)
    project_id = Column(BigId, ForeignKey('projects.id'))
    kind = Column(String(15), nullable=False)
    sector = Column(String(30), nullable=False)
    title = Column(String(200), nullable=False)
    product_code = Column(String(80), nullable=False, index=True)
    quantity = Column(Numeric(18,4), nullable=False)
    unit = Column(String(20), nullable=False)
    wilaya = Column(String(80), nullable=False)
    status = Column(String(20), nullable=False, default='active')
    created_by = Column(BigId, ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.current_timestamp())


class ValueMatch(Base):
    __tablename__ = 'value_matches'
    id = Column(BigId, primary_key=True)
    org_id = Column(BigId, ForeignKey('organizations.id'), nullable=False, index=True)
    offer_id = Column(BigId, ForeignKey('value_listings.id'), nullable=False)
    demand_id = Column(BigId, ForeignKey('value_listings.id'), nullable=False)
    quantity = Column(Numeric(18,4), nullable=False)
    score = Column(Integer, nullable=False)
    reasons = Column(PortableJSON, nullable=False)
    status = Column(String(20), nullable=False, default='suggested')
    __table_args__ = (UniqueConstraint('org_id','offer_id','demand_id'),)


class ProductionLot(Base):
    __tablename__ = 'production_lots'
    id = Column(BigId, primary_key=True)
    org_id = Column(BigId, ForeignKey('organizations.id'), nullable=False, index=True)
    project_id = Column(BigId, ForeignKey('projects.id'), nullable=False)
    code = Column(String(80), nullable=False)
    product = Column(String(150), nullable=False)
    sector = Column(String(30), nullable=False)
    stage = Column(String(30), nullable=False, default='production')
    quantity = Column(Numeric(18,4), nullable=False)
    unit = Column(String(20), nullable=False)
    trace = Column(PortableJSON, nullable=False, default=list)
    created_at = Column(DateTime(timezone=True), server_default=func.current_timestamp())
    __table_args__ = (UniqueConstraint('org_id','code'),)


class MatrixJob(Base):
    __tablename__ = 'matrix_jobs'
    id = Column(BigId, primary_key=True)
    org_id = Column(BigId, ForeignKey('organizations.id'), nullable=False, index=True)
    kind = Column(String(30), nullable=False)
    project_id = Column(BigId, ForeignKey('projects.id'))
    status = Column(String(20), nullable=False, default='pending', index=True)
    attempts = Column(Integer, nullable=False, default=0)
    error = Column(String(100))
    created_at = Column(DateTime(timezone=True), server_default=func.current_timestamp())
    finished_at = Column(DateTime(timezone=True))


class ContactTicket(Base):
    __tablename__ = 'contact_tickets'
    id = Column(BigId, primary_key=True)
    reference = Column(String(50), nullable=False, unique=True)
    name = Column(String(120), nullable=False)
    email = Column(String(254), nullable=False)
    subject = Column(String(180), nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default='received')
    policy_version = Column(String(40), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.current_timestamp())


class PrivacyRequest(Base):
    __tablename__ = 'privacy_requests'
    id = Column(BigId, primary_key=True)
    org_id = Column(BigId, ForeignKey('organizations.id'), nullable=False, index=True)
    user_id = Column(BigId, ForeignKey('users.id'), nullable=False)
    kind = Column(String(30), nullable=False)
    note = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default='received')
    response = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.current_timestamp())
