"""
Inference prediction schemas for single and batch text analysis.
"""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class SentimentScores(BaseModel):
    positive: float = Field(..., ge=0.0, le=1.0)
    neutral: float = Field(..., ge=0.0, le=1.0)
    negative: float = Field(..., ge=0.0, le=1.0)


class SentimentRequest(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        max_length=2000,
        description="The text to analyze",
        examples=["I absolutely love using this application, it works flawlessly!"]
    )

    @field_validator("text")
    @classmethod
    def validate_non_empty(cls, v: str) -> str:
        trimmed = v.strip()
        if not trimmed:
            raise ValueError("Input text cannot be empty or purely whitespace.")
        return trimmed


class SentimentResponse(BaseModel):
    text: str
    sentiment: str = Field(..., description="Predicted sentiment: 'positive', 'neutral', 'negative', or 'unknown'")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score between 0 and 1")
    scores: Dict[str, float] = Field(..., description="Probability breakdown across all 3 classes")


class BatchItemError(BaseModel):
    index: int
    text: Optional[str] = None
    error: str


class BatchSentimentRequest(BaseModel):
    texts: List[str] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="List of text strings to analyze (max 50 per batch)"
    )

    @field_validator("texts")
    @classmethod
    def validate_texts(cls, v: List[str]) -> List[str]:
        cleaned = [t.strip() for t in v if t.strip()]
        if not cleaned:
            raise ValueError("Batch must contain at least one non-empty text string.")
        return cleaned


class BatchSentimentResponse(BaseModel):
    count: int
    results: List[SentimentResponse]
    errors: Optional[List[BatchItemError]] = None
