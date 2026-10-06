from sqlalchemy import Column, String, Text, Integer, DateTime, ForeignKey, UniqueConstraint, CheckConstraint, func

from .db import Base
from .models import BigId


class ExpoVisit(Base):
    __tablename__ = "expo_visits"
    id = Column(BigId, primary_key=True)
    session_key = Column(String(64), nullable=False, unique=True, index=True)
    name = Column(String(120))
    visitor_role = Column(String(120))
    created_at = Column(DateTime(timezone=True), server_default=func.current_timestamp(), nullable=False)
    last_seen_at = Column(DateTime(timezone=True), server_default=func.current_timestamp(), nullable=False)


class ExpoFeedback(Base):
    __tablename__ = "expo_feedback"
    id = Column(BigId, primary_key=True)
    visit_id = Column(BigId, ForeignKey("expo_visits.id"), nullable=False, index=True)
    rating = Column(Integer)
    suggestion = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.current_timestamp(), nullable=False)
    __table_args__ = (
        CheckConstraint("rating IS NULL OR (rating >= 1 AND rating <= 5)", name="ck_expo_feedback_rating"),
    )
