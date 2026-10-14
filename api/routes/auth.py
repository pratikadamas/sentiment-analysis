"""
Authentication routes for registration, login, logout, and current user profile.
Enforces bcrypt password security, rate limiting, and JWT token issuance.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Union
from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
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
from db.models import User, EmailVerificationToken, utc_now
from schemas.auth import (
    UserRegister,
    UserLogin,
    TokenResponse,
    UserResponse,
    RegisterResponse,
    ResendVerificationRequest,
    GenericMessageResponse,
)
from services.email_service import (
    email_service,
    generate_verification_token,
    hash_verification_token,
)

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

    try:
        user = db.query(User).filter(User.username == username).first()
    except Exception as exc:
        logger.error(f"Database error loading current user '{username}': {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database service temporarily unavailable. Please try again later."
        )

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

@router.post("/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
@router.post("/api/register", response_model=RegisterResponse, status_code=status.HTTP_201_CREATED)
def register_user(request: Request, payload: UserRegister, db: Session = Depends(get_db)):
    """
    Registers a new user as UNVERIFIED, securely hashes the password with bcrypt,
    generates a single-use cryptographically secure verification token (storing only
    its SHA-256 hash), and dispatches a verification email.
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

    clean_username = payload.username.strip()
    clean_email = str(payload.email).strip().lower()

    # Check if username or email already registered
    try:
        existing_user = db.query(User).filter(User.username == clean_username).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Username '{clean_username}' is already registered."
            )

        existing_email = db.query(User).filter(User.email == clean_email).first()
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Email '{clean_email}' is already registered."
            )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Database query error during registration check: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database service temporarily unavailable. Please try again later."
        )

    hashed_pw = get_password_hash(payload.password)
    new_user = User(
        username=clean_username,
        email=clean_email,
        hashed_password=hashed_pw,
        is_active=True,
        email_verified=False
    )

    try:
        db.add(new_user)
        db.flush()  # Populate new_user.id for token foreign key

        # Generate cryptographic token and persist token hash
        raw_token, token_hash = generate_verification_token()
        expire_dt = datetime.now(timezone.utc) + timedelta(minutes=settings.EMAIL_VERIFICATION_EXPIRE_MINUTES)
        token_record = EmailVerificationToken(
            user_id=new_user.id,
            token_hash=token_hash,
            expires_at=expire_dt
        )
        db.add(token_record)
        db.commit()
        db.refresh(new_user)
    except IntegrityError as ie:
        db.rollback()
        logger.warning(f"Integrity conflict during user registration: {ie}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this username or email already exists."
        )
    except Exception as exc:
        db.rollback()
        logger.error(f"Database error committing new user '{clean_username}': {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database service temporarily unavailable. Please try again later."
        )

    # Dispatch verification email (failsafe: account created, user can resend if delivery fails)
    email_sent = email_service.send_verification_email(new_user.email, new_user.username, raw_token)
    if email_sent:
        logger.info(f"User '{new_user.username}' (id={new_user.id}) registered. Verification email dispatched to '{clean_email}'.")
        msg = "Account created. Please check your email to verify your account."
    else:
        logger.warning(f"User '{new_user.username}' (id={new_user.id}) registered, but verification email delivery failed.")
        msg = "Account created, but we encountered an issue delivering your verification email. Please use 'Resend verification email' to try again."

    return RegisterResponse(
        message=msg,
        id=new_user.id,
        username=new_user.username,
        email=new_user.email,
        email_verified=False
    )


@router.post("/login", response_model=TokenResponse)
@router.post("/api/login", response_model=TokenResponse)
def login_user(request: Request, payload: UserLogin, response: Response, db: Session = Depends(get_db)):
    """
    Authenticates user with username or email, verifying bcrypt password and confirming
    the account's email has been verified. Protected by IP-based rate limiting.
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
    try:
        user = db.query(User).filter(
            (User.username == identifier) | (User.email == identifier.lower())
        ).first()
    except Exception as exc:
        logger.error(f"Database error during login authentication: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database service temporarily unavailable. Please try again later."
        )

    if not user or not verify_password(payload.password, user.hashed_password):
        logger.warning(f"Failed authentication attempt for identifier: {identifier}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Reject unverified users before granting token or session
    if not getattr(user, "email_verified", False):
        logger.warning(f"Login rejected: email not verified for user '{user.username}' (email: '{user.email}')")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email address before signing in.",
        )

    # Reject deactivated users
    if not user.is_active:
        logger.warning(f"Login rejected: account inactive for user '{user.username}'")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive. Please contact system support.",
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


@router.get("/auth/verify-email")
@router.get("/api/auth/verify-email")
@router.get("/verify-email")
def verify_email(
    request: Request,
    token: str = Query(..., description="Email verification token"),
    db: Session = Depends(get_db)
):
    """
    Validates the single-use email verification token:
    1. Computes SHA-256 hash of the received token.
    2. Checks token existence, expiration, and used status.
    3. Marks the user account email as verified and token as used.
    4. Redirects to frontend login with status query parameter or returns JSON.
    """
    is_json = request.headers.get("accept", "").startswith("application/json")
    clean_token = token.strip()
    if not clean_token:
        if is_json:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification token is missing.")
        return RedirectResponse(url="/login?verified=false&reason=invalid", status_code=status.HTTP_302_FOUND)

    token_hash = hash_verification_token(clean_token)

    try:
        token_record = db.query(EmailVerificationToken).filter(
            EmailVerificationToken.token_hash == token_hash
        ).first()
    except Exception as exc:
        logger.error(f"Database error querying verification token: {exc}", exc_info=True)
        if is_json:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Database service temporarily unavailable.")
        return RedirectResponse(url="/login?verified=false&reason=error", status_code=status.HTTP_302_FOUND)

    if not token_record:
        logger.warning("Verification rejected: token not found.")
        if is_json:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification token.")
        return RedirectResponse(url="/login?verified=false&reason=invalid", status_code=status.HTTP_302_FOUND)

    if token_record.used_at is not None:
        logger.warning(f"Verification rejected: token already used (user_id={token_record.user_id}).")
        if is_json:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification token has already been used.")
        return RedirectResponse(url="/login?verified=false&reason=used", status_code=status.HTTP_302_FOUND)

    # Expiration check
    now = datetime.now(timezone.utc)
    # Ensure expires_at is timezone-aware for comparison
    expires_at = token_record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < now:
        logger.warning(f"Verification rejected: token expired for user_id={token_record.user_id}.")
        if is_json:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification token has expired. Please request a new one.")
        return RedirectResponse(url="/login?verified=false&reason=expired", status_code=status.HTTP_302_FOUND)

    # Token is valid: verify user and invalidate token
    try:
        user = token_record.user
        if not user:
            user = db.query(User).filter(User.id == token_record.user_id).first()

        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User associated with token not found.")

        user.email_verified = True
        user.email_verified_at = now
        token_record.used_at = now
        db.commit()
    except HTTPException:
        raise
    except Exception as exc:
        db.rollback()
        logger.error(f"Database error finalizing email verification: {exc}", exc_info=True)
        if is_json:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Database service temporarily unavailable.")
        return RedirectResponse(url="/login?verified=false&reason=error", status_code=status.HTTP_302_FOUND)

    logger.info(f"User '{user.username}' (email: '{user.email}') successfully verified their email address.")

    if is_json:
        return {"message": "Email verified successfully. You can now sign in.", "verified": True}
    return RedirectResponse(url="/login?verified=true", status_code=status.HTTP_302_FOUND)


@router.post("/auth/resend-verification", response_model=GenericMessageResponse)
@router.post("/api/auth/resend-verification", response_model=GenericMessageResponse)
@router.post("/resend-verification", response_model=GenericMessageResponse)
def resend_verification(
    request: Request,
    payload: ResendVerificationRequest,
    db: Session = Depends(get_db)
):
    """
    Generates and dispatches a fresh verification token for an unverified account.
    Security protections:
    - IP-based rate limiting prevents mailbox spamming.
    - Constant-time enumeration protection: returns identical success message whether
      account exists, is already verified, or does not exist.
    - Invalidates previously issued unused tokens.
    """
    client_ip = get_client_ip(request)
    if not rate_limiter.check_rate_limit(
        "resend_verification", client_ip, settings.RATE_LIMIT_RESEND_MAX, settings.RATE_LIMIT_RESEND_WINDOW_SECONDS
    ):
        logger.warning(f"Rate limit exceeded for resend-verification from IP: {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many verification requests. Please wait a moment before trying again."
        )

    clean_email = str(payload.email).strip().lower()

    try:
        user = db.query(User).filter(User.email == clean_email).first()
    except Exception as exc:
        logger.error(f"Database error during resend verification check: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database service temporarily unavailable. Please try again later."
        )

    if user and not getattr(user, "email_verified", False):
        try:
            now = datetime.now(timezone.utc)
            # Invalidate prior unused tokens
            db.query(EmailVerificationToken).filter(
                EmailVerificationToken.user_id == user.id,
                EmailVerificationToken.used_at.is_(None)
            ).update({"used_at": now})

            # Issue fresh token
            raw_token, token_hash = generate_verification_token()
            expire_dt = now + timedelta(minutes=settings.EMAIL_VERIFICATION_EXPIRE_MINUTES)
            new_record = EmailVerificationToken(
                user_id=user.id,
                token_hash=token_hash,
                expires_at=expire_dt
            )
            db.add(new_record)
            db.commit()

            # Dispatch fresh email
            email_service.send_verification_email(user.email, user.username, raw_token)
            logger.info(f"Verification email resent to user '{user.username}' (id={user.id}).")
        except Exception as exc:
            db.rollback()
            logger.error(f"Error issuing new verification token for '{clean_email}': {exc}", exc_info=True)
    elif user and getattr(user, "email_verified", False):
        logger.info(f"Resend verification requested for already-verified email '{clean_email}'. Ignored safely.")
    else:
        logger.info(f"Resend verification requested for non-existent email '{clean_email}'. Ignored safely.")

    # Return safe generic response to prevent account enumeration
    return GenericMessageResponse(
        message="If an account exists with that email address, a verification email has been sent."
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
