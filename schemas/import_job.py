"""
Schemas for CSV batch import job status and results.
"""

from typing import Optional, List, Any
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ImportJobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: int
    filename: str
    total_rows: int
    processed_rows: int
    successful_rows: int
    failed_rows: int
    status: str
    error_summary: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
