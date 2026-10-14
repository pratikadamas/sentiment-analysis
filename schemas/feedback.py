"""
Pydantic schemas for feedback record creation, responses, filtering, and summary statistics.
"""

from typing import Optional, Dict, List, Any
from datetime import datetime
from pydantic import BaseModel, Field, field_validator, ConfigDict


class FeedbackCreate(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="Customer feedback text content",
        examples=["Customer support was remarkably fast and solved my issue within minutes!"]
    )
    category: Optional[str] = Field(
        None,
        max_length=50,
        description="Optional categorization (e.g. 'product', 'billing', 'support', 'feature_request')"
    )
    source: Optional[str] = Field(
        "web",
        max_length=50,
        description="Channel where feedback originated (e.g. 'web', 'email', 'mobile', 'survey')"
    )
    rating: Optional[int] = Field(
        None,
        ge=1,
        le=5,
        description="Customer-supplied numerical rating from 1 to 5"
    )

    @field_validator("text")
    @classmethod
    def validate_text_not_empty(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Feedback text cannot be empty or purely whitespace.")
        return trimmed


class FeedbackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: Optional[int] = None
    text: str
    clean_text: Optional[str] = None
    sentiment: str
    confidence: float
    scores: Dict[str, float]
    category: Optional[str] = None
    source: Optional[str] = None
    rating: Optional[int] = None
    model_version: str
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_orm_model(cls, feedback) -> "FeedbackResponse":
        return cls(
            id=feedback.id,
            user_id=feedback.user_id,
            text=feedback.text,
            clean_text=feedback.clean_text,
            sentiment=feedback.sentiment,
            confidence=feedback.confidence,
            scores=feedback.to_scores_dict(),
            category=feedback.category,
            source=feedback.source,
            rating=feedback.rating,
            model_version=feedback.model_version,
            created_at=feedback.created_at,
            updated_at=feedback.updated_at
        )


class FeedbackListResponse(BaseModel):
    items: List[FeedbackResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class FeedbackStatsResponse(BaseModel):
    total_count: int
    positive_count: int
    neutral_count: int
    negative_count: int
    unknown_count: int = 0
    positive_pct: float
    neutral_pct: float
    negative_pct: float
    average_confidence: float
    category_counts: Dict[str, int]
    source_counts: Dict[str, int]
