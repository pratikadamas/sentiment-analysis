"""
Backward-compatible authentication facade for Sentiment Pulse.
Re-exports security dependencies, router, and models from api.routes.auth and core.security.
"""

from api.routes.auth import router, get_current_user
from core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_token,
    pwd_context,
    security_bearer,
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    COOKIE_NAME,
    COOKIE_SECURE,
    COOKIE_SAMESITE,
)
from schemas.auth import (
    UserRegister,
    UserLogin,
    TokenResponse,
    UserResponse,
    RegisterResponse,
    ResendVerificationRequest,
    GenericMessageResponse,
)

__all__ = [
    "router",
    "get_current_user",
    "get_token",
    "verify_password",
    "get_password_hash",
    "create_access_token",
    "UserRegister",
    "UserLogin",
    "TokenResponse",
    "UserResponse",
    "RegisterResponse",
    "ResendVerificationRequest",
    "GenericMessageResponse",
    "pwd_context",
    "security_bearer",
    "SECRET_KEY",
    "ALGORITHM",
    "ACCESS_TOKEN_EXPIRE_MINUTES",
    "COOKIE_NAME",
    "COOKIE_SECURE",
    "COOKIE_SAMESITE",
]
