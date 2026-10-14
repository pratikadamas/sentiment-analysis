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
    Inspects database tables and applies non-destructive schema migrations.
    Ensures columns added in newer versions (such as users.is_active,
    users.created_at, users.updated_at) exist on older database instances.
    """
    try:
        inspector = inspect(engine)
        tables = inspector.get_table_names()

        if "users" in tables:
            existing_cols = {col["name"] for col in inspector.get_columns("users")}
            is_pg = engine.dialect.name == "postgresql"

            with engine.begin() as conn:
                if "is_active" not in existing_cols:
                    logger.info("Migrating 'users': adding column 'is_active'...")
                    if is_pg:
                        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE"))
                    else:
                        conn.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1"))

                if "created_at" not in existing_cols:
                    logger.info("Migrating 'users': adding column 'created_at'...")
                    if is_pg:
                        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()"))
                    else:
                        conn.execute(text("ALTER TABLE users ADD COLUMN created_at TIMESTAMP"))

                if "updated_at" not in existing_cols:
                    logger.info("Migrating 'users': adding column 'updated_at'...")
                    if is_pg:
                        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()"))
                    else:
                        conn.execute(text("ALTER TABLE users ADD COLUMN updated_at TIMESTAMP"))

                if "email_verified" not in existing_cols:
                    logger.info("Migrating 'users': adding column 'email_verified' (defaulting existing accounts to verified)...")
                    if is_pg:
                        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE"))
                    else:
                        conn.execute(text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT 1"))

                if "email_verified_at" not in existing_cols:
                    logger.info("Migrating 'users': adding column 'email_verified_at'...")
                    if is_pg:
                        conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP WITH TIME ZONE"))
                    else:
                        conn.execute(text("ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMP"))

        # Create email_verification_tokens table if missing
        if "email_verification_tokens" not in tables:
            logger.info("Migrating schema: creating 'email_verification_tokens' table...")
            Base.metadata.tables["email_verification_tokens"].create(bind=engine, checkfirst=True)

        # Synchronize Alembic migration state if alembic is present
        if "alembic_version" in tables:
            with engine.begin() as conn:
                res = conn.execute(text("SELECT version_num FROM alembic_version")).fetchone()
                if not res:
                    conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('b5f1a9238de4')"))
        else:
            try:
                with engine.begin() as conn:
                    conn.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)"))
                    conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('b5f1a9238de4')"))
            except Exception as alembic_err:
                logger.debug(f"Alembic version table initialization skipped: {alembic_err}")

        logger.info("Database schema verification and self-healing migration completed.")
    except Exception as exc:
        logger.error(f"Error during schema migration: {exc}", exc_info=True)


def init_db() -> None:
    """
    Initializes database tables if they do not exist, and reconciles
    schema differences on existing tables (such as missing columns added in v2).
    """
    logger.info("Verifying and initializing database schema tables...")
    Base.metadata.create_all(bind=engine)
    _migrate_schema()
    logger.info("Database tables initialized successfully.")

