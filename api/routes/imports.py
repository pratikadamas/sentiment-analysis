"""
CSV batch import routes for customer feedback intelligence.
Handles file validation, size limits, chunked execution, and import job status polling.
No authentication required.
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session

from db.session import get_db
from services.import_service import ImportService
from schemas.import_job import ImportJobResponse
from core.config import settings
from core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/feedback/import", tags=["Feedback Import"])
api_router = APIRouter(prefix="/api/feedback/import", tags=["Feedback Import"])


async def _upload_handler(file: UploadFile, db: Session):
    # Verify file extension
    if not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only CSV files are accepted for feedback imports."
        )

    # Read content with bounded size enforcement
    content = await file.read()
    if len(content) > settings.MAX_IMPORT_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"Uploaded file exceeds maximum allowed size ({settings.MAX_IMPORT_FILE_SIZE_BYTES // (1024 * 1024)} MB)."
        )

    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded CSV file is empty."
        )

    # Create tracking job
    job = ImportService.create_import_job(db, file.filename)

    # Process synchronously in bounded chunks
    processed_job = ImportService.process_csv_bytes(db, job, content)
    return processed_job


def _status_handler(job_id: str, db: Session):
    job = ImportService.get_import_job(db, job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Import job '{job_id}' not found."
        )
    return job


for r in (router, api_router):
    @r.post("", response_model=ImportJobResponse, status_code=status.HTTP_202_ACCEPTED)
    async def upload_csv_endpoint(
        file: UploadFile = File(..., description="CSV file with feedback text"),
        db: Session = Depends(get_db)
    ):
        """Uploads and processes a customer feedback CSV file in bounded chunks."""
        return await _upload_handler(file, db)

    @r.get("/{job_id}", response_model=ImportJobResponse)
    def get_job_status_endpoint(
        job_id: str,
        db: Session = Depends(get_db)
    ):
        """Retrieves import job status and progress."""
        return _status_handler(job_id, db)
