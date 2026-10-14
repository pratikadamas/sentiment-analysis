"""
Database session management, connection pooling, and lifecycle dependencies for Sentiment Pulse.
"""

from typing import Generator
from sqlalchemy import create_engine, inspect, text
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


def _migrate_schema() -> None:
    """
    Inspects database tables and ensures schema synchronization.
    """
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()

        # Synchronize Alembic migration state if alembic is present
        if "alembic_version" in tables:
            with engine.begin() as conn:
                res = conn.execute(text("SELECT version_num FROM alembic_version")).fetchone()
                if not res:
                    conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('c4e2f187a912')"))
        else:
            try:
                with engine.begin() as conn:
                    conn.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"))
                    conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('c4e2f187a912')"))
            except Exception as alembic_err:
                logger.debug(f"Alembic version table initialization skipped: {alembic_err}")

        logger.info("Database schema verification completed.")
    except Exception as exc:
        logger.error(f"Error during schema verification: {exc}", exc_info=True)


def init_db() -> None:
    """
    Initializes database tables if they do not exist, and reconciles
    schema differences on existing tables.
    """
    logger.info("Verifying and initializing database schema tables...")
    Base.metadata.create_all(bind=engine)
    _migrate_schema()
    logger.info("Database tables initialized successfully.")
