"""
Schemas for feedback intelligence analytics and sentiment insights.
"""

from typing import List, Dict, Optional
from datetime import datetime
from pydantic import BaseModel


class SentimentTrendPoint(BaseModel):
    date: str
    positive: int
    neutral: int
    negative: int
    unknown: int = 0
    total: int
    average_confidence: float


class CategoryBreakdown(BaseModel):
    category: str
    positive: int
    neutral: int
    negative: int
    unknown: int = 0
    total: int
    positive_pct: float
    negative_pct: float


class SourceBreakdown(BaseModel):
    source: str
    total: int
    positive: int
    neutral: int
    negative: int


class RecentNegativeItem(BaseModel):
    id: int
    text: str
    confidence: float
    rating: Optional[int] = None
    category: Optional[str] = None
    created_at: datetime


class FeedbackAnalyticsResponse(BaseModel):
    total_feedback: int
    sentiment_counts: Dict[str, int]
    sentiment_percentages: Dict[str, float]
    average_confidence: float
    sentiment_trends: List[SentimentTrendPoint]
    category_breakdown: List[CategoryBreakdown]
    source_breakdown: List[SourceBreakdown]
    recent_negative_feedback: List[RecentNegativeItem]
