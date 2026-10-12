"""
Authentication router and security utilities for Sentiment Analysis App.
Includes password hashing, JWT generation, user registration, and login endpoints.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional
import re

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy.orm import Session
from passlib.context import CryptContext
from jose import JWTError, jwt

from database import User, get_db

# Security & Token Configurations
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "sentiment-pulse-super-secret-key-2026-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))  # Default 24 hours

# Cookie Configurations
COOKIE_NAME = "access_token"
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "true").lower() in ("true", "1")
COOKIE_SAMESITE = "lax"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security_bearer = HTTPBearer(auto_error=False)

router = APIRouter(tags=["Authentication"])


# ==========================================
# Pydantic Schemas
# ==========================================

class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, description="Unique username")
    email: EmailStr = Field(..., description="Valid email address")
    password: str = Field(..., min_length=6, max_length=128, description="Account password (min 6 chars)")

    @field_validator("username")
    @classmethod
    def validate_username(cls, v: str) -> str:
        clean = v.strip()
        if not re.match(r"^[a-zA-Z0-9_.-]+$", clean):
            raise ValueError("Username can only contain alphanumeric characters, underscores, hyphens, and periods.")
        return clean


class UserLogin(BaseModel):
    username: str = Field(..., min_length=1, description="Username or Email")
    password: str = Field(..., min_length=1, description="Account password")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    email: str


class UserResponse(BaseModel):
    id: int
    username: str
    email: str

    class Config:
        from_attributes = True


# ==========================================
# Security Utilities
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
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "iat": datetime.now(timezone.utc)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_token(
    request: Request,
    auth_credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_bearer),
) -> Optional[str]:
    """
    FastAPI dependency that extracts the JWT token from the Authorization Bearer header
    or the access_token cookie.
    """
    if auth_credentials and auth_credentials.credentials:
        return auth_credentials.credentials
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ", 1)[1].strip()
    return request.cookies.get(COOKIE_NAME)


async def get_current_user(
    request: Request,
    token: Optional[str] = Depends(get_token),
    db: Session = Depends(get_db)
) -> User:
    """
    FastAPI dependency that validates the JWT token obtained from cookie or Authorization header,
    returning the authenticated User model from the database.
    Unauthenticated GET "/" returns a 302 redirect to /login.
    API routes return 401 Unauthorized JSON.
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
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
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
# Auth Endpoints
# ==========================================

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@router.post("/api/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(payload: UserRegister, db: Session = Depends(get_db)):
    """
    Registers a new user with a unique username and email, storing a bcrypt-hashed password.
    """
    # Check if username already exists
    existing_user = db.query(User).filter(User.username == payload.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Username '{payload.username}' is already registered."
        )

    # Check if email already exists
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
    return new_user


@router.post("/login", response_model=TokenResponse)
@router.post("/api/login", response_model=TokenResponse)
def login_user(payload: UserLogin, response: Response, db: Session = Depends(get_db)):
    """
    Authenticates a user with username/email and password, returning a JWT Bearer token upon success
    and setting an httpOnly, Secure, SameSite=Lax access_token cookie.
    """
    identifier = payload.username.strip()
    
    # Allow logging in via either username or email
    user = db.query(User).filter(
        (User.username == identifier) | (User.email == identifier.lower())
    ).first()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token = create_access_token(
        data={"sub": user.username, "email": user.email, "user_id": user.id}
    )

    response.set_cookie(
        key=COOKIE_NAME,
        value=access_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/"
    )

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
    Clears the access_token cookie to log out the user.
    """
    response.delete_cookie(
        key=COOKIE_NAME,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
        path="/"
    )
    return {"message": "Successfully logged out."}


@router.get("/logout")
def logout_user_get():
    """
    Clears the access_token cookie and redirects to /login.
    """
    redirect_res = RedirectResponse(url="/login", status_code=status.HTTP_302_FOUND)
    redirect_res.delete_cookie(
        key=COOKIE_NAME,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite=COOKIE_SAMESITE,
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
