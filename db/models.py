"""
SQLAlchemy ORM models for Sentiment Pulse.
Includes Feedback and ImportJob models with indexes and UTC timestamps.
Authentication models (User, EmailVerificationToken) have been removed.
"""

from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Float, Text, DateTime
)
from sqlalchemy.orm import declarative_base

Base = declarative_base()


def utc_now():
    return datetime.now(timezone.utc)


class Feedback(Base):
    """
    Customer feedback record with persisted ONNX sentiment inference results.
    """
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    # Retained as nullable integer for historical data integrity (no longer tied to users table)
    user_id = Column(Integer, nullable=True, index=True)

    # Original text & cleaned version
    text = Column(Text, nullable=False)
    clean_text = Column(Text, nullable=True)

    # Inference predictions
    sentiment = Column(String(20), nullable=False, index=True)  # positive, neutral, negative, unknown
    confidence = Column(Float, nullable=False)
    positive_score = Column(Float, nullable=False, default=0.0)
    neutral_score = Column(Float, nullable=False, default=0.0)
    negative_score = Column(Float, nullable=False, default=0.0)

    # Metadata & customer context
    category = Column(String(50), nullable=True, index=True)  # e.g., 'product', 'pricing', 'support'
    source = Column(String(50), nullable=True, index=True)    # e.g., 'web', 'csv_import', 'api'
    rating = Column(Integer, nullable=True)                  # Optional 1-5 rating
    model_version = Column(String(30), nullable=False, default="3.0.0")

    # Timestamps
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    def to_scores_dict(self):
        return {
            "positive": self.positive_score,
            "neutral": self.neutral_score,
            "negative": self.negative_score
        }

    def __repr__(self):
        return f"<Feedback(id={self.id}, sentiment='{self.sentiment}', confidence={self.confidence:.2f})>"


class ImportJob(Base):
    """
    CSV batch import tracking job.
    """
    __tablename__ = "import_jobs"

    id = Column(String(36), primary_key=True, index=True)  # UUID string
    # Retained as nullable integer for historical data integrity
    user_id = Column(Integer, nullable=True, index=True)
    filename = Column(String(255), nullable=False)

    total_rows = Column(Integer, default=0, nullable=False)
    processed_rows = Column(Integer, default=0, nullable=False)
    successful_rows = Column(Integer, default=0, nullable=False)
    failed_rows = Column(Integer, default=0, nullable=False)

    status = Column(String(20), default="PENDING", nullable=False, index=True)  # PENDING, PROCESSING, COMPLETED, FAILED
    error_summary = Column(Text, nullable=True)  # JSON serialized list of errors

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    def __repr__(self):
        return f"<ImportJob(id='{self.id}', status='{self.status}', progress={self.processed_rows}/{self.total_rows})>"
