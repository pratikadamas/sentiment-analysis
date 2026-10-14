"""
Customer feedback intelligence analytics routes.
Provides comprehensive sentiment breakdown, temporal trends, and negative feedback monitoring.
No authentication required.
"""

from typing import Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from db.session import get_db
from services.analytics_service import AnalyticsService
from schemas.analytics import FeedbackAnalyticsResponse

router = APIRouter(prefix="/feedback/analytics", tags=["Feedback Analytics"])
api_router = APIRouter(prefix="/api/feedback/analytics", tags=["Feedback Analytics"])


def _analytics_handler(
    start_date: Optional[datetime],
    end_date: Optional[datetime],
    db: Session
):
    return AnalyticsService.get_analytics(
        db=db,
        start_date=start_date,
        end_date=end_date
    )


for r in (router, api_router):
    @r.get("", response_model=FeedbackAnalyticsResponse)
    def get_analytics_endpoint(
        start_date: Optional[datetime] = Query(None, description="Start date filter (ISO 8601)"),
        end_date: Optional[datetime] = Query(None, description="End date filter (ISO 8601)"),
        db: Session = Depends(get_db)
    ):
        """
        Retrieves business sentiment analytics, time trends, category distributions,
        and high-priority negative customer feedback.
        """
        return _analytics_handler(start_date, end_date, db)
