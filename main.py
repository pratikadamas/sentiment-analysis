"""
FastAPI Backend for 3-Class Sentiment Analysis Application.
Features:
- Async endpoints with Pydantic request & response validation
- Application lifespan event for model preloading
- CORS middleware enabled
- Healthcheck, Single Prediction, and Batch Prediction endpoints
- Template/Static support for Frontend (Phase 3)
"""

import os
from contextlib import asynccontextmanager
from typing import Dict, List, Optional
import logging

from fastapi import FastAPI, HTTPException, status, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from pydantic import BaseModel, Field, field_validator

from model import SentimentAnalyzer

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Lifespan context manager to load and warm up the model
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Initializing SentimentAnalyzer model during startup...")
    app.state.analyzer = SentimentAnalyzer()
    logger.info("Model preloaded and ready for incoming inference requests.")
    yield
    logger.info("Application shutting down.")

app = FastAPI(
    title="Sentiment Analysis API",
    description="High-performance async REST API for 3-class sentiment analysis (positive, neutral, negative).",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for seamless frontend and cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Setup directories for static files and templates
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
STATIC_DIR = os.path.join(BASE_DIR, "static")

os.makedirs(TEMPLATES_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=TEMPLATES_DIR)


# ==========================================
# Pydantic Schemas
# ==========================================

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


class SentimentScores(BaseModel):
    positive: float = Field(..., ge=0.0, le=1.0)
    neutral: float = Field(..., ge=0.0, le=1.0)
    negative: float = Field(..., ge=0.0, le=1.0)


class SentimentResponse(BaseModel):
    text: str
    sentiment: str = Field(..., description="Predicted sentiment: 'positive', 'neutral', or 'negative'")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score between 0 and 1")
    scores: Dict[str, float] = Field(..., description="Probability breakdown across all 3 classes")


class BatchSentimentRequest(BaseModel):
    texts: List[str] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="List of text strings to analyze"
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


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    version: str


# ==========================================
# REST API Endpoints
# ==========================================

@app.get("/", response_class=HTMLResponse)
async def serve_index(request: Request):
    """
    Renders the web frontend interface (Phase 3).
    If templates/index.html is not yet created, returns a friendly status page.
    """
    index_path = os.path.join(TEMPLATES_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    
    return HTMLResponse(
        content="""
        <!DOCTYPE html>
        <html>
        <head><title>Sentiment Analysis API</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h2>Sentiment Analysis API is Running</h2>
            <p>Phase 2 (FastAPI Backend) is active!</p>
            <p>Interactive API Docs: <a href="/docs">/docs</a> | Healthcheck: <a href="/health">/health</a></p>
        </body>
        </html>
        """,
        status_code=200
    )


@app.get("/health", response_model=HealthResponse, tags=["System"])
@app.get("/api/health", response_model=HealthResponse, tags=["System"])
async def healthcheck():
    """
    Health check endpoint for Render monitoring and uptime checks.
    """
    is_loaded = hasattr(app.state, "analyzer") and app.state.analyzer is not None
    return HealthResponse(
        status="healthy",
        model_loaded=is_loaded,
        version="1.0.0"
    )


@app.post("/predict", response_model=SentimentResponse, tags=["Inference"])
@app.post("/api/predict", response_model=SentimentResponse, tags=["Inference"])
async def predict_sentiment(payload: SentimentRequest):
    """
    Analyzes the sentiment of a single input string.
    Returns the predicted class (positive, neutral, negative), confidence, and full score distribution.
    """
    try:
        analyzer: SentimentAnalyzer = app.state.analyzer
        result = analyzer.predict(payload.text)
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


@app.post("/predict/batch", response_model=BatchSentimentResponse, tags=["Inference"])
@app.post("/api/predict/batch", response_model=BatchSentimentResponse, tags=["Inference"])
async def predict_batch_sentiment(payload: BatchSentimentRequest):
    """
    Analyzes sentiment for a batch of text strings (up to 50 at a time).
    """
    analyzer: SentimentAnalyzer = app.state.analyzer
    results: List[SentimentResponse] = []

    for item in payload.texts:
        try:
            res = analyzer.predict(item)
            results.append(SentimentResponse(
                text=res["text"],
                sentiment=res["sentiment"],
                confidence=res["confidence"],
                scores=res["scores"]
            ))
        except Exception as e:
            logger.warning(f"Failed to analyze item in batch: {item} - {e}")
            continue

    return BatchSentimentResponse(
        count=len(results),
        results=results
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
