"""
Core security, authentication utilities, and rate limiting for Sentiment Pulse.
"""

import time
from datetime import datetime, timedelta, timezone
from typing import Optional, Dict, Tuple
from collections import defaultdict

from fastapi import Request, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from passlib.context import CryptContext
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from core.config import settings
from core.logging import get_logger

logger = get_logger(__name__)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security_bearer = HTTPBearer(auto_error=False)

SECRET_KEY = settings.JWT_SECRET_KEY
ALGORITHM = settings.JWT_ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES
COOKIE_NAME = settings.COOKIE_NAME
COOKIE_SECURE = settings.COOKIE_SECURE
COOKIE_SAMESITE = settings.COOKIE_SAMESITE


# ==========================================
# In-Memory Rate Limiter
# ==========================================

class SimpleRateLimiter:
    """
    In-memory sliding-window rate limiter keyed by client IP and action.
    Suitable for single-instance web service (Render web service).
    """
    def __init__(self):
        # Store dict: (action, ip) -> list of timestamp floats
        self._history: Dict[Tuple[str, str], list] = defaultdict(list)

    def reset(self):
        self._history.clear()

    def check_rate_limit(self, action: str, client_ip: str, max_requests: int, window_seconds: int) -> bool:
        if not settings.RATE_LIMIT_ENABLED:
            return True

        now = time.time()
        key = (action, client_ip)
        # Purge timestamps outside window
        cutoff = now - window_seconds
        self._history[key] = [ts for ts in self._history[key] if ts > cutoff]

        if len(self._history[key]) >= max_requests:
            return False

        self._history[key].append(now)
        return True


rate_limiter = SimpleRateLimiter()


def get_client_ip(request: Request) -> str:
    """Extract real client IP considering forward headers."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


# ==========================================
# Password & JWT Utilities
# ==========================================

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against the stored bcrypt hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hashes a plain password using bcrypt."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Creates an encoded JWT access token with expiration."""
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict:
    """Decodes and validates JWT token."""
    return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])


def get_token(
    request: Request,
    auth_credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
) -> Optional[str]:
    """
    FastAPI dependency that extracts JWT token from Authorization header or cookie.
    """
    if auth_credentials and auth_credentials.credentials:
        return auth_credentials.credentials
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1].strip()
    return request.cookies.get(settings.COOKIE_NAME)
