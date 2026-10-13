"""
Schemas for system health, liveness, and readiness monitoring.
"""

from typing import Optional, Dict, Any
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    version: str
    model_version: Optional[str] = None
    training_date: Optional[str] = None
    dataset_name: Optional[str] = None
    test_macro_f1: Optional[float] = None
    inference_latency_ms: Optional[float] = None


class ReadinessResponse(BaseModel):
    status: str
    database: str
    model: str
    ready: bool
