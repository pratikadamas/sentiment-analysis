"""
Inference prediction endpoints for single-string and batch sentiment analysis.
"""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status

from db.models import User
from api.routes.auth import get_current_user
from services.sentiment_service import sentiment_service
from schemas.prediction import (
    SentimentRequest,
    SentimentResponse,
    BatchSentimentRequest,
    BatchSentimentResponse,
    BatchItemError
)
from core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["Inference"])


@router.post("/predict", response_model=SentimentResponse)
@router.post("/api/predict", response_model=SentimentResponse)
async def predict_sentiment(
    payload: SentimentRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Analyzes the sentiment of a single input string. Requires valid authentication.
    Returns predicted class (positive, neutral, negative, unknown), confidence, and score breakdown.
    """
    try:
        result = sentiment_service.predict(payload.text)
        return SentimentResponse(
            text=result["text"],
            sentiment=result["sentiment"],
            confidence=result["confidence"],
            scores=result["scores"]
        )
    except ValueError as ve:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(ve)
        )
    except Exception as e:
        logger.error(f"Inference error: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An error occurred while analyzing sentiment."
        )


@router.post("/predict/batch", response_model=BatchSentimentResponse)
@router.post("/api/predict/batch", response_model=BatchSentimentResponse)
async def predict_batch_sentiment(
    payload: BatchSentimentRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Analyzes sentiment for a batch of text strings (up to 50 items).
    Provides structured per-item error reporting for partial failures without exposing stack traces.
    """
    results: List[SentimentResponse] = []
    errors: List[BatchItemError] = []

    for idx, item in enumerate(payload.texts):
        try:
            trimmed = item.strip()
            if not trimmed:
                errors.append(BatchItemError(index=idx, text=item, error="Input text is empty."))
                continue

            res = sentiment_service.predict(trimmed)
            results.append(SentimentResponse(
                text=res["text"],
                sentiment=res["sentiment"],
                confidence=res["confidence"],
                scores=res["scores"]
            ))
        except Exception as e:
            logger.warning(f"Failed to analyze item at index {idx}: {item[:30]} - {e}")
            errors.append(BatchItemError(index=idx, text=item[:50], error="Inference failed for item."))

    return BatchSentimentResponse(
        count=len(results),
        results=results,
        errors=errors if errors else None
    )
