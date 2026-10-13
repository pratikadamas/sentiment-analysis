"""
Authentication routes for registration, login, logout, and current user profile.
Enforces bcrypt password security, rate limiting, and JWT token issuance.
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from jose import JWTError, jwt

from core.config import settings
from core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_token,
    rate_limiter,
    get_client_ip,
)
from core.logging import get_logger
from db.session import get_db
from db.models import User
from schemas.auth import UserRegister, UserLogin, TokenResponse, UserResponse

logger = get_logger(__name__)

router = APIRouter(tags=["Authentication"])


# ==========================================
# User Authentication Dependency
# ==========================================

async def get_current_user(
    request: Request,
    token: Optional[str] = Depends(get_token),
    db: Session = Depends(get_db)
) -> User:
    """
    FastAPI dependency validating JWT token from cookie or Authorization header.
    Redirects to /login for root HTML view if unauthenticated.
    Returns 401 Unauthorized JSON for API routes.
    """
    is_root = request.url.path in ("/", "")

    if not token:
        if is_root:
            raise HTTPException(
                status_code=status.HTTP_302_FOUND,
                headers={"Location": "/login"}
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials were not provided or invalid Bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        username: Optional[str] = payload.get("sub")
        if username is None:
            if is_root:
                raise HTTPException(
                    status_code=status.HTTP_302_FOUND,
                    headers={"Location": "/login"}
                )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication token payload.",
                headers={"WWW-Authenticate": "Bearer"},
            )
    except JWTError:
        if is_root:
            raise HTTPException(
                status_code=status.HTTP_302_FOUND,
                headers={"Location": "/login"}
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials: token is invalid or expired.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    user = db.query(User).filter(User.username == username).first()
    if user is None:
        if is_root:
            raise HTTPException(
                status_code=status.HTTP_302_FOUND,
                headers={"Location": "/login"}
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User associated with this token was not found.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


# ==========================================
# Endpoints
# ==========================================

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@router.post("/api/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(request: Request, payload: UserRegister, db: Session = Depends(get_db)):
    """
    Registers a new user with unique username and email, storing a bcrypt-hashed password.
    Protected by IP-based rate limiting.
    """
    client_ip = get_client_ip(request)
    if not rate_limiter.check_rate_limit(
        "register", client_ip, settings.RATE_LIMIT_REGISTER_MAX, settings.RATE_LIMIT_REGISTER_WINDOW_SECONDS
    ):
        logger.warning(f"Rate limit exceeded for registration from IP: {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many registration attempts. Please try again later."
        )

    # Check if username exists
    existing_user = db.query(User).filter(User.username == payload.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Username '{payload.username}' is already registered."
        )

    # Check if email exists
    existing_email = db.query(User).filter(User.email == payload.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Email '{payload.email}' is already registered."
        )

    hashed_pw = get_password_hash(payload.password)
    new_user = User(
        username=payload.username,
        email=str(payload.email).lower(),
        hashed_password=hashed_pw
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    logger.info(f"User '{new_user.username}' successfully registered.")
    return new_user


@router.post("/login", response_model=TokenResponse)
@router.post("/api/login", response_model=TokenResponse)
def login_user(request: Request, payload: UserLogin, response: Response, db: Session = Depends(get_db)):
    """
    Authenticates user with username or email, issuing a signed JWT access token
    and setting an httpOnly SameSite cookie. Protected by IP-based rate limiting.
    """
    client_ip = get_client_ip(request)
    if not rate_limiter.check_rate_limit(
        "login", client_ip, settings.RATE_LIMIT_LOGIN_MAX, settings.RATE_LIMIT_LOGIN_WINDOW_SECONDS
    ):
        logger.warning(f"Rate limit exceeded for login from IP: {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please wait before retrying."
        )

    identifier = payload.username.strip()
    user = db.query(User).filter(
        (User.username == identifier) | (User.email == identifier.lower())
    ).first()

    if not user or not verify_password(payload.password, user.hashed_password):
        logger.warning(f"Failed authentication attempt for identifier: {identifier}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={"sub": user.username, "email": user.email, "user_id": user.id}
    )

    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/"
    )

    logger.info(f"User '{user.username}' authenticated successfully.")
    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        username=user.username,
        email=user.email
    )


@router.post("/logout")
@router.post("/api/logout")
def logout_user(response: Response):
    """
    Clears the access_token cookie to terminate session.
    """
    response.delete_cookie(
        key=settings.COOKIE_NAME,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        path="/"
    )
    return {"message": "Successfully logged out."}


@router.get("/logout")
def logout_user_get():
    """
    Clears access_token cookie and redirects to /login.
    """
    redirect_res = RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)
    redirect_res.delete_cookie(
        key=settings.COOKIE_NAME,
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite=settings.COOKIE_SAMESITE,
        path="/"
    )
    return redirect_res


@router.get("/me", response_model=UserResponse)
@router.get("/api/me", response_model=UserResponse)
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    """
    Returns profile information of the currently authenticated user.
    """
    return current_user
