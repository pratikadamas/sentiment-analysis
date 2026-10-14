"""
SQLAlchemy ORM models for Sentiment Pulse.
Includes User, Feedback, and ImportJob models with relationships, indexes, and UTC timestamps.
"""

from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Float, Text, Boolean, DateTime,
    ForeignKey, Index
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


def utc_now():
    return datetime.now(timezone.utc)


class User(Base):
    """
    SQLAlchemy User model representing registered users.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    email_verified = Column(Boolean, default=False, nullable=False)
    email_verified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    feedback = relationship("Feedback", back_populates="owner", cascade="all, delete-orphan")
    import_jobs = relationship("ImportJob", back_populates="owner", cascade="all, delete-orphan")
    verification_tokens = relationship("EmailVerificationToken", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<User(id={self.id}, username='{self.username}', email='{self.email}', verified={self.email_verified})>"


class Feedback(Base):
    """
    Customer feedback record with persisted ONNX sentiment inference results.
    """
    __tablename__ = "feedback"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
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

    # Relationship to owning user
    owner = relationship("User", back_populates="feedback")

    __table_args__ = (
        Index("ix_feedback_user_created", "user_id", "created_at"),
        Index("ix_feedback_user_sentiment", "user_id", "sentiment"),
        Index("ix_feedback_user_category", "user_id", "category"),
    )

    def to_scores_dict(self):
        return {
            "positive": self.positive_score,
            "neutral": self.neutral_score,
            "negative": self.negative_score
        }

    def __repr__(self):
        return f"<Feedback(id={self.id}, user_id={self.user_id}, sentiment='{self.sentiment}', confidence={self.confidence:.2f})>"


class ImportJob(Base):
    """
    CSV batch import tracking job.
    """
    __tablename__ = "import_jobs"

    id = Column(String(36), primary_key=True, index=True)  # UUID string
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    
    total_rows = Column(Integer, default=0, nullable=False)
    processed_rows = Column(Integer, default=0, nullable=False)
    successful_rows = Column(Integer, default=0, nullable=False)
    failed_rows = Column(Integer, default=0, nullable=False)

    status = Column(String(20), default="PENDING", nullable=False, index=True)  # PENDING, PROCESSING, COMPLETED, FAILED
    error_summary = Column(Text, nullable=True)  # JSON serialized list of errors

    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    owner = relationship("User", back_populates="import_jobs")

    def __repr__(self):
        return f"<ImportJob(id='{self.id}', status='{self.status}', progress={self.processed_rows}/{self.total_rows})>"


class EmailVerificationToken(Base):
    """
    Stores cryptographically secure, single-use, expiring email verification tokens.
    Raw tokens are NEVER stored in plaintext; only their SHA-256 hashes are persisted.
    """
    __tablename__ = "email_verification_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_hash = Column(String(64), nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False, index=True)
    used_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationship to user
    user = relationship("User", back_populates="verification_tokens")

    def __repr__(self):
        return f"<EmailVerificationToken(id={self.id}, user_id={self.user_id}, used={self.used_at is not None})>"
