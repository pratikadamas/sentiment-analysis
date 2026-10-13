"""
Database session management, connection pooling, and lifecycle dependencies for Sentiment Pulse.
"""

from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from core.config import settings
from core.logging import get_logger
from db.models import Base

logger = get_logger(__name__)

# Determine connect args and pooling options based on engine dialect
is_sqlite = settings.DATABASE_URL.startswith("sqlite")

engine_kwargs = {
    "pool_pre_ping": True,
}

if is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs["pool_size"] = settings.DB_POOL_SIZE
    engine_kwargs["max_overflow"] = settings.DB_MAX_OVERFLOW
    engine_kwargs["pool_timeout"] = settings.DB_POOL_TIMEOUT
    engine_kwargs["pool_recycle"] = settings.DB_POOL_RECYCLE

engine = create_engine(settings.DATABASE_URL, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency yielding a transactional database session per request.
    Rolls back uncommitted transactions on unhandled exceptions and ensures clean closure.
    """
    db = SessionLocal()
    try:
        yield db
    except Exception as exc:
        db.rollback()
        logger.error(f"Database session rolled back due to error: {exc}")
        raise
    finally:
        db.close()


def init_db() -> None:
    """
    Initializes database tables if they do not exist.
    Used for local development bootstrap and testing environments.
    """
    logger.info("Verifying and initializing database schema tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables initialized successfully.")
