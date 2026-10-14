"""
Backward-compatible database facade for Sentiment Pulse.
Re-exports ORM models, session providers, and engine from db.session and db.models.
"""

from db.session import engine, SessionLocal, get_db, init_db
from db.models import Base, Feedback, ImportJob

__all__ = [
    "engine",
    "SessionLocal",
    "get_db",
    "init_db",
    "Base",
    "Feedback",
    "ImportJob",
]
