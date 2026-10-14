"""
CSV import processing pipeline and secure export service.
Includes bounded chunking, encoding fallbacks, ImportJob state tracking, and CSV formula injection sanitization.
Authentication and user-isolation checks have been permanently removed.
"""

import io
import csv
import uuid
import json
from datetime import datetime, timezone
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.orm import Session

from db.models import Feedback, ImportJob
from core.config import settings
from core.logging import get_logger
from services.sentiment_service import sentiment_service

logger = get_logger(__name__)


def sanitize_csv_cell(value: Any) -> str:
    """
    Prevents CSV Formula Injection (Excel Macro Execution) by prepending a single quote
    if the cell value begins with dangerous characters: =, +, -, @, tab, or carriage return.
    """
    if value is None:
        return ""
    text_val = str(value)
    if text_val and text_val[0] in ("=", "+", "-", "@", "\t", "\r"):
        return f"'{text_val}"
    return text_val


class ImportService:
    @staticmethod
    def create_import_job(db: Session, filename: str) -> ImportJob:
        job = ImportJob(
            id=str(uuid.uuid4()),
            user_id=None,
            filename=filename,
            total_rows=0,
            processed_rows=0,
            successful_rows=0,
            failed_rows=0,
            status="PENDING",
            created_at=datetime.now(timezone.utc)
        )
        db.add(job)
        db.commit()
        db.refresh(job)
        return job

    @staticmethod
    def get_import_job(db: Session, job_id: str) -> Optional[ImportJob]:
        """Retrieval of import job by ID."""
        return db.query(ImportJob).filter(ImportJob.id == job_id).first()

    @staticmethod
    def process_csv_bytes(db: Session, job: ImportJob, content: bytes) -> ImportJob:
        """
        Parses and processes CSV bytes in bounded chunks, creating Feedback records.
        """
        job.status = "PROCESSING"
        db.commit()

        # Attempt decoding with fallback strategies
        decoded_text = None
        for encoding in ("utf-8-sig", "utf-8", "latin-1", "cp1252"):
            try:
                decoded_text = content.decode(encoding)
                break
            except UnicodeDecodeError:
                continue

        if decoded_text is None:
            job.status = "FAILED"
            job.error_summary = json.dumps(["Failed to decode CSV file: unsupported encoding."])
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
            return job

        reader = csv.reader(io.StringIO(decoded_text))
        try:
            header_row = next(reader)
        except StopIteration:
            job.status = "FAILED"
            job.error_summary = json.dumps(["CSV file is completely empty."])
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
            return job

        # Normalize header indices
        header_map: Dict[str, int] = {}
        for idx, col in enumerate(header_row):
            col_cleaned = col.strip().lower()
            header_map[col_cleaned] = idx

        # Locate text column
        text_col_idx = None
        for candidate in ("text", "feedback", "review", "content", "comment"):
            if candidate in header_map:
                text_col_idx = header_map[candidate]
                break

        if text_col_idx is None:
            job.status = "FAILED"
            job.error_summary = json.dumps(["CSV must contain a 'text', 'review', or 'feedback' column."])
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
            return job

        category_idx = header_map.get("category")
        source_idx = header_map.get("source")
        rating_idx = header_map.get("rating")

        # Read and bound rows
        rows = list(reader)
        if len(rows) > settings.MAX_IMPORT_ROWS:
            job.status = "FAILED"
            job.error_summary = json.dumps([
                f"CSV exceeds maximum allowed rows ({len(rows)} > {settings.MAX_IMPORT_ROWS})."
            ])
            job.completed_at = datetime.now(timezone.utc)
            db.commit()
            return job

        job.total_rows = len(rows)
        db.commit()

        chunk_size = settings.IMPORT_CHUNK_SIZE
        errors: List[str] = []

        for chunk_start in range(0, len(rows), chunk_size):
            chunk = rows[chunk_start : chunk_start + chunk_size]
            new_records: List[Feedback] = []

            for row_idx, row in enumerate(chunk, start=chunk_start + 1):
                if text_col_idx >= len(row):
                    errors.append(f"Row {row_idx}: Missing text column.")
                    job.failed_rows += 1
                    continue

                raw_text = row[text_col_idx].strip()
                if not raw_text:
                    errors.append(f"Row {row_idx}: Empty text.")
                    job.failed_rows += 1
                    continue

                cat_val = row[category_idx].strip() if category_idx is not None and category_idx < len(row) else None
                src_val = row[source_idx].strip() if source_idx is not None and source_idx < len(row) else "csv_import"
                rating_val = None
                if rating_idx is not None and rating_idx < len(row) and row[rating_idx].strip():
                    try:
                        parsed_r = int(float(row[rating_idx].strip()))
                        if 1 <= parsed_r <= 5:
                            rating_val = parsed_r
                    except ValueError:
                        pass

                try:
                    pred = sentiment_service.predict(raw_text)
                    scores = pred.get("scores", {})
                    fb = Feedback(
                        user_id=None,
                        text=raw_text,
                        clean_text=pred.get("text", raw_text),
                        sentiment=pred.get("sentiment", "unknown"),
                        confidence=float(pred.get("confidence", 0.0)),
                        positive_score=float(scores.get("positive", 0.0)),
                        neutral_score=float(scores.get("neutral", 0.0)),
                        negative_score=float(scores.get("negative", 0.0)),
                        category=cat_val[:50] if cat_val else None,
                        source=src_val[:50] if src_val else "csv_import",
                        rating=rating_val,
                        model_version="3.0.0",
                        created_at=datetime.now(timezone.utc),
                        updated_at=datetime.now(timezone.utc)
                    )
                    new_records.append(fb)
                    job.successful_rows += 1
                except Exception as e:
                    errors.append(f"Row {row_idx}: Inference failed - {str(e)}")
                    job.failed_rows += 1

            if new_records:
                db.add_all(new_records)
                db.commit()

            job.processed_rows += len(chunk)
            db.commit()

        job.status = "COMPLETED" if job.failed_rows < job.total_rows else "FAILED"
        if errors:
            job.error_summary = json.dumps(errors[:50])  # Cap at 50 errors in summary
        job.completed_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(job)
        return job

    @staticmethod
    def generate_csv_export(db: Session) -> str:
        """
        Generates CSV string of all feedback records with formula injection protection.
        """
        records = db.query(Feedback).order_by(Feedback.created_at.desc()).all()
        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow([
            "id", "text", "sentiment", "confidence", "positive_score", "neutral_score",
            "negative_score", "category", "source", "rating", "model_version", "created_at"
        ])

        for r in records:
            writer.writerow([
                sanitize_csv_cell(r.id),
                sanitize_csv_cell(r.text),
                sanitize_csv_cell(r.sentiment),
                sanitize_csv_cell(f"{r.confidence:.4f}"),
                sanitize_csv_cell(f"{r.positive_score:.4f}"),
                sanitize_csv_cell(f"{r.neutral_score:.4f}"),
                sanitize_csv_cell(f"{r.negative_score:.4f}"),
                sanitize_csv_cell(r.category),
                sanitize_csv_cell(r.source),
                sanitize_csv_cell(r.rating),
                sanitize_csv_cell(r.model_version),
                sanitize_csv_cell(r.created_at.isoformat() if r.created_at else "")
            ])

        return output.getvalue()
