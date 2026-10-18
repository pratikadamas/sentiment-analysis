"""
Customer feedback management routes.
Provides persistent feedback creation, querying, pagination, filtering, deletion, statistics, and secure CSV export.
No authentication required.
"""

from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status, Query, Response
from sqlalchemy.orm import Session

from db.session import get_db
from services.feedback_service import FeedbackService
from services.import_service import ImportService
from schemas.feedback import (
    FeedbackCreate,
    FeedbackResponse,
    FeedbackListResponse,
    FeedbackStatsResponse
)
from core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/feedback", tags=["Customer Feedback"])
api_router = APIRouter(prefix="/api/feedback", tags=["Customer Feedback"])


def _create_feedback_handler(payload: FeedbackCreate, db: Session):
    try:
        feedback = FeedbackService.create_feedback(db, payload)
        return FeedbackResponse.from_orm_model(feedback)
    except ValueError as ve:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error persisting feedback: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to persist feedback record."
        )


def _list_feedback_handler(
    page: int,
    page_size: int,
    sentiment: Optional[str],
    category: Optional[str],
    source: Optional[str],
    min_confidence: Optional[float],
    start_date: Optional[datetime],
    end_date: Optional[datetime],
    search: Optional[str],
    sort_by: str,
    sort_order: str,
    db: Session
):
    return FeedbackService.list_feedback(
        db=db,
        page=page,
        page_size=page_size,
        sentiment=sentiment,
        category=category,
        source=source,
        min_confidence=min_confidence,
        start_date=start_date,
        end_date=end_date,
        search=search,
        sort_by=sort_by,
        sort_order=sort_order
    )


def _get_feedback_by_id_handler(feedback_id: int, db: Session):
    fb = FeedbackService.get_feedback_by_id(db, feedback_id)
    if not fb:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Feedback record {feedback_id} not found."
        )
    return FeedbackResponse.from_orm_model(fb)


def _delete_feedback_handler(feedback_id: int, db: Session):
    success = FeedbackService.delete_feedback(db, feedback_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Feedback record {feedback_id} not found."
        )
    return {"message": f"Feedback record {feedback_id} deleted successfully."}


def _stats_handler(db: Session):
    return FeedbackService.get_feedback_stats(db)


def _export_handler(db: Session):
    csv_content = ImportService.generate_csv_export(db)
    timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"feedback_export_{timestamp_str}.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


# Attach routes to both /feedback and /api/feedback for seamless client compatibility
for r in (router, api_router):
    @r.post("", response_model=FeedbackResponse, status_code=status.HTTP_201_CREATED)
    def create_feedback_endpoint(
        payload: FeedbackCreate,
        db: Session = Depends(get_db)
    ):
        """Creates feedback, infers sentiment, and persists record."""
        return _create_feedback_handler(payload, db)

    @r.get("/stats", response_model=FeedbackStatsResponse)
    def get_stats_endpoint(
        db: Session = Depends(get_db)
    ):
        """Returns sentiment statistics aggregated across feedback records."""
        return _stats_handler(db)

    @r.get("/export")
    def export_feedback_endpoint(
        db: Session = Depends(get_db)
    ):
        """Exports feedback as CSV with formula injection protection."""
        return _export_handler(db)

    @r.get("", response_model=FeedbackListResponse)
    def list_feedback_endpoint(
        page: int = Query(1, ge=1, description="Page number"),
        page_size: int = Query(20, ge=1, le=100, description="Items per page"),
        sentiment: Optional[str] = Query(None, description="Filter by sentiment (positive, neutral, negative)"),
        category: Optional[str] = Query(None, description="Filter by category"),
        source: Optional[str] = Query(None, description="Filter by source"),
        min_confidence: Optional[float] = Query(None, ge=0.0, le=1.0, description="Minimum confidence"),
        start_date: Optional[datetime] = Query(None, description="Start date (ISO 8601)"),
        end_date: Optional[datetime] = Query(None, description="End date (ISO 8601)"),
        search: Optional[str] = Query(None, description="Text search substring"),
        sort_by: str = Query("created_at", description="Sort column (created_at, confidence, rating)"),
        sort_order: str = Query("desc", description="Sort direction (asc, desc)"),
        db: Session = Depends(get_db)
    ):
        """Retrieves paginated feedback records."""
        return _list_feedback_handler(
            page, page_size, sentiment, category, source, min_confidence,
            start_date, end_date, search, sort_by, sort_order, db
        )

    @r.get("/{feedback_id}", response_model=FeedbackResponse)
    def get_feedback_endpoint(
        feedback_id: int,
        db: Session = Depends(get_db)
    ):
        """Retrieves a single feedback record."""
        return _get_feedback_by_id_handler(feedback_id, db)

    @r.delete("/{feedback_id}")
    def delete_feedback_endpoint(
        feedback_id: int,
        db: Session = Depends(get_db)
    ):
        """Deletes a feedback record."""
        return _delete_feedback_handler(feedback_id, db)
