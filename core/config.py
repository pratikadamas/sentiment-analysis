"""
Core configuration module for Sentiment Pulse application.
Handles environment variables, security parameters, database settings, and rate limiting.
"""

import os
from typing import List
import logging
from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(BASE_DIR, ".env"))

logger = logging.getLogger(__name__)


def _normalize_db_url(url: str) -> str:
    """Normalize Render / Heroku postgres URLs to SQLAlchemy psycopg3 dialect."""
    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)
    if url.startswith("postgresql://") and not url.startswith("postgresql+"):
        return url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


def _parse_origins(origins_str: str) -> List[str]:
    """Parse comma-separated origins."""
    if not origins_str or origins_str.strip() == "*":
        return ["*"]
    return [o.strip() for o in origins_str.split(",") if o.strip()]


class Settings:
    # General App Config
    APP_NAME: str = os.getenv("APP_NAME", "Sentiment Pulse")
    APP_VERSION: str = os.getenv("APP_VERSION", "2.0.0")
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() in ("true", "1")

    # Database Configuration
    DATABASE_URL: str = _normalize_db_url(
        os.getenv("DATABASE_URL", f"sqlite:///{os.path.join(BASE_DIR, 'sentiment.db')}")
    )
    DB_POOL_SIZE: int = int(os.getenv("DB_POOL_SIZE", "5"))
    DB_MAX_OVERFLOW: int = int(os.getenv("DB_MAX_OVERFLOW", "10"))
    DB_POOL_TIMEOUT: int = int(os.getenv("DB_POOL_TIMEOUT", "30"))
    DB_POOL_RECYCLE: int = int(os.getenv("DB_POOL_RECYCLE", "1800"))

    # JWT & Authentication
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "sentiment-pulse-super-secret-key-2026-production")
    JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # 24 hours

    # Cookie Settings
    COOKIE_NAME: str = os.getenv("COOKIE_NAME", "access_token")
    COOKIE_SECURE: bool = os.getenv("COOKIE_SECURE", "true").lower() in ("true", "1")
    COOKIE_SAMESITE: str = os.getenv("COOKIE_SAMESITE", "lax")

    # CORS Settings
    ALLOWED_ORIGINS: List[str] = _parse_origins(os.getenv("ALLOWED_ORIGINS", "*"))

    # Rate Limiting (in-memory per client IP)
    RATE_LIMIT_ENABLED: bool = os.getenv("RATE_LIMIT_ENABLED", "true").lower() in ("true", "1")
    RATE_LIMIT_LOGIN_MAX: int = int(os.getenv("RATE_LIMIT_LOGIN_MAX", "100"))
    RATE_LIMIT_LOGIN_WINDOW_SECONDS: int = int(os.getenv("RATE_LIMIT_LOGIN_WINDOW_SECONDS", "60"))
    RATE_LIMIT_REGISTER_MAX: int = int(os.getenv("RATE_LIMIT_REGISTER_MAX", "100"))
    RATE_LIMIT_REGISTER_WINDOW_SECONDS: int = int(os.getenv("RATE_LIMIT_REGISTER_WINDOW_SECONDS", "60"))
    RATE_LIMIT_RESEND_MAX: int = int(os.getenv("RATE_LIMIT_RESEND_MAX", "5"))
    RATE_LIMIT_RESEND_WINDOW_SECONDS: int = int(os.getenv("RATE_LIMIT_RESEND_WINDOW_SECONDS", "60"))

    # Email & SMTP Delivery Configuration
    SMTP_HOST: str = os.getenv("SMTP_HOST", "")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    SMTP_USE_TLS: bool = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1")
    SMTP_USE_SSL: bool = os.getenv("SMTP_USE_SSL", "false").lower() in ("true", "1")
    SMTP_FROM_EMAIL: str = os.getenv("SMTP_FROM_EMAIL", "noreply@sentimentpulse.com")
    SMTP_FROM_NAME: str = os.getenv("SMTP_FROM_NAME", "SentimentPulse")
    EMAIL_VERIFICATION_EXPIRE_MINUTES: int = int(os.getenv("EMAIL_VERIFICATION_EXPIRE_MINUTES", "30"))
    APP_BASE_URL: str = os.getenv(
        "APP_BASE_URL",
        "https://sentiment-pulse-app.onrender.com" if os.getenv("ENVIRONMENT") == "production" else "http://localhost:8000"
    )

    # Batch & CSV Import Limits
    MAX_BATCH_SIZE: int = int(os.getenv("MAX_BATCH_SIZE", "50"))
    MAX_IMPORT_FILE_SIZE_BYTES: int = int(os.getenv("MAX_IMPORT_FILE_SIZE_BYTES", str(5 * 1024 * 1024)))  # 5 MB
    MAX_IMPORT_ROWS: int = int(os.getenv("MAX_IMPORT_ROWS", "5000"))
    IMPORT_CHUNK_SIZE: int = int(os.getenv("IMPORT_CHUNK_SIZE", "100"))

    # Model & Tokenizer Paths
    MODEL_PATH: str = os.getenv("MODEL_PATH", os.path.join(BASE_DIR, "sentiment_model.onnx"))
    TOKENIZER_PATH: str = os.getenv("TOKENIZER_PATH", os.path.join(BASE_DIR, "tokenizer", "tokenizer.json"))
    METRICS_PATH: str = os.getenv("METRICS_PATH", os.path.join(BASE_DIR, "model_metrics.json"))

    def validate_production_settings(self):
        """Warn if insecure default keys are used in production."""
        if self.ENVIRONMENT.lower() == "production":
            if self.JWT_SECRET_KEY == "sentiment-pulse-super-secret-key-2026-production":
                logger.warning(
                    "SECURITY WARNING: Default JWT_SECRET_KEY is being used in production! "
                    "Set JWT_SECRET_KEY in your environment variables."
                )


settings = Settings()
settings.validate_production_settings()
