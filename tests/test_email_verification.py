"""
Automated Test Suite for SentimentPulse Email Ownership Verification.
Covers all 18 production verification criteria:
1. Valid registration creates an unverified account.
2. Verification email is generated.
3. Verification token expires correctly.
4. Valid token verifies the email.
5. Invalid token is rejected.
6. Expired token is rejected.
7. Used token cannot be reused.
8. Unverified user cannot log in.
9. Verified user can log in.
10. Resend verification works.
11. Resend is rate-limited.
12. Duplicate email is handled correctly.
13. Duplicate username is handled correctly.
14. Password remains hashed.
15. Verification token is not stored in plaintext.
16. Existing sentiment analysis functionality still works.
17. Existing login functionality for verified users still works.
18. Existing database records are preserved during migration.
"""

import time
import hashlib
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient

from main import app
from db.session import SessionLocal
from db.models import User, EmailVerificationToken
from core.security import verify_password
from services.email_service import email_service, hash_verification_token
from core.config import settings


@pytest.fixture(scope="module")
def client():
    with TestClient(app, base_url="https://testserver") as test_client:
        yield test_client


# ==============================================================================
# 1. Valid registration creates an unverified account
# 2. Verification email is generated
# 14. Password remains hashed
# 15. Verification token is not stored in plaintext
# ==============================================================================
def test_valid_registration_creates_unverified_account_and_generates_token(client):
    username = f"unverified_user_{int(time.time() * 1000)}"
    email = f"{username}@example.com"
    raw_password = "SecurePassword123!"

    email_service.clear_sent_messages()

    res = client.post("/register", json={
        "username": username,
        "email": email,
        "password": raw_password
    })
    assert res.status_code == 201
    data = res.json()
    assert "id" in data
    assert data["username"] == username
    assert data["email"] == email
    assert data["email_verified"] is False
    assert "check your email" in data["message"].lower()

    # Verify database state
    with SessionLocal() as db:
        user = db.query(User).filter(User.username == username).first()
        assert user is not None
        assert user.email_verified is False
        assert user.email_verified_at is None
        # 14: Password remains hashed
        assert user.hashed_password != raw_password
        assert verify_password(raw_password, user.hashed_password) is True

        # 15: Verification token is not stored in plaintext
        tok = db.query(EmailVerificationToken).filter(EmailVerificationToken.user_id == user.id).first()
        assert tok is not None
        assert len(tok.token_hash) == 64
        tok_exp = tok.expires_at if tok.expires_at.tzinfo else tok.expires_at.replace(tzinfo=timezone.utc)
        assert tok_exp > datetime.now(timezone.utc)

    # 2: Verification email generated
    raw_token = email_service.get_last_sent_token_for(email)
    assert raw_token is not None
    # Token hash matches SHA-256 of raw_token
    assert hashlib.sha256(raw_token.encode("utf-8")).hexdigest() == tok.token_hash


# ==============================================================================
# 8. Unverified user cannot log in
# ==============================================================================
def test_unverified_user_cannot_log_in(client):
    username = f"unverified_login_{int(time.time() * 1000)}"
    email = f"{username}@example.com"
    password = "ValidPassword123!"

    client.post("/register", json={
        "username": username,
        "email": email,
        "password": password
    })

    login_res = client.post("/login", json={
        "username": username,
        "password": password
    })
    assert login_res.status_code == 403
    assert "Please verify your email address before signing in." in login_res.json()["detail"]


# ==============================================================================
# 4. Valid token verifies the email
# 9. Verified user can log in
# ==============================================================================
def test_valid_token_verifies_email_and_enables_login(client):
    username = f"verify_flow_{int(time.time() * 1000)}"
    email = f"{username}@example.com"
    password = "ValidPassword123!"

    client.post("/register", json={
        "username": username,
        "email": email,
        "password": password
    })

    raw_token = email_service.get_last_sent_token_for(email)
    assert raw_token is not None

    # Step A: Verify via endpoint (testing JSON Accept header)
    verify_res = client.get(
        f"/auth/verify-email?token={raw_token}",
        headers={"Accept": "application/json"}
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["verified"] is True

    # Step B: Check DB status
    with SessionLocal() as db:
        user = db.query(User).filter(User.username == username).first()
        assert user.email_verified is True
        assert user.email_verified_at is not None

        tok = db.query(EmailVerificationToken).filter(EmailVerificationToken.user_id == user.id).first()
        assert tok.used_at is not None

    # Step C: 9. Verified user can now log in
    login_res = client.post("/login", json={
        "username": username,
        "password": password
    })
    assert login_res.status_code == 200
    data = login_res.json()
    assert "access_token" in data
    assert data["username"] == username


# ==============================================================================
# 5. Invalid token is rejected
# ==============================================================================
def test_invalid_token_rejected(client):
    # JSON request
    res_json = client.get(
        "/auth/verify-email?token=completely_invalid_random_token_12345",
        headers={"Accept": "application/json"}
    )
    assert res_json.status_code == 400
    assert "Invalid verification token" in res_json.json()["detail"]

    # Browser request (redirects to /login?verified=false&reason=invalid)
    res_html = client.get(
        "/auth/verify-email?token=completely_invalid_random_token_12345",
        follow_redirects=False
    )
    assert res_html.status_code == 302
    assert "verified=false" in res_html.headers["location"]
    assert "reason=invalid" in res_html.headers["location"]


# ==============================================================================
# 3. Verification token expires correctly
# 6. Expired token is rejected
# ==============================================================================
def test_expired_token_rejected(client):
    username = f"expired_user_{int(time.time() * 1000)}"
    email = f"{username}@example.com"
    password = "ValidPassword123!"

    client.post("/register", json={
        "username": username,
        "email": email,
        "password": password
    })

    raw_token = email_service.get_last_sent_token_for(email)
    assert raw_token is not None

    # Manually expire token in database
    with SessionLocal() as db:
        user = db.query(User).filter(User.username == username).first()
        tok = db.query(EmailVerificationToken).filter(EmailVerificationToken.user_id == user.id).first()
        tok.expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        db.commit()

    # Attempt verification with expired token
    res_json = client.get(
        f"/auth/verify-email?token={raw_token}",
        headers={"Accept": "application/json"}
    )
    assert res_json.status_code == 400
    assert "expired" in res_json.json()["detail"].lower()

    # Browser redirect check
    res_html = client.get(
        f"/auth/verify-email?token={raw_token}",
        follow_redirects=False
    )
    assert res_html.status_code == 302
    assert "reason=expired" in res_html.headers["location"]

    # Verify user remains unverified
    with SessionLocal() as db:
        user = db.query(User).filter(User.username == username).first()
        assert user.email_verified is False


# ==============================================================================
# 7. Used token cannot be reused
# ==============================================================================
def test_used_token_cannot_be_reused(client):
    username = f"singleuse_user_{int(time.time() * 1000)}"
    email = f"{username}@example.com"
    password = "ValidPassword123!"

    client.post("/register", json={
        "username": username,
        "email": email,
        "password": password
    })

    raw_token = email_service.get_last_sent_token_for(email)

    # First use succeeds
    res1 = client.get(f"/auth/verify-email?token={raw_token}", headers={"Accept": "application/json"})
    assert res1.status_code == 200

    # Second use must be rejected
    res2 = client.get(f"/auth/verify-email?token={raw_token}", headers={"Accept": "application/json"})
    assert res2.status_code == 400
    assert "already been used" in res2.json()["detail"].lower()

    # Browser redirect check for used token
    res3 = client.get(f"/auth/verify-email?token={raw_token}", follow_redirects=False)
    assert res3.status_code == 302
    assert "reason=used" in res3.headers["location"]


# ==============================================================================
# 10. Resend verification works
# ==============================================================================
def test_resend_verification_issues_new_token_and_invalidates_old(client):
    username = f"resend_user_{int(time.time() * 1000)}"
    email = f"{username}@example.com"
    password = "ValidPassword123!"

    client.post("/register", json={
        "username": username,
        "email": email,
        "password": password
    })
    token1 = email_service.get_last_sent_token_for(email)
    assert token1 is not None

    # Request resend
    res = client.post("/auth/resend-verification", json={"email": email})
    assert res.status_code == 200
    assert "verification email has been sent" in res.json()["message"]

    token2 = email_service.get_last_sent_token_for(email)
    assert token2 is not None
    assert token1 != token2

    # Old token was invalidated
    with SessionLocal() as db:
        user = db.query(User).filter(User.username == username).first()
        tok1_hash = hash_verification_token(token1)
        old_tok = db.query(EmailVerificationToken).filter(EmailVerificationToken.token_hash == tok1_hash).first()
        assert old_tok.used_at is not None

    # Old token fails
    old_verify = client.get(f"/auth/verify-email?token={token1}", headers={"Accept": "application/json"})
    assert old_verify.status_code == 400

    # New token verifies successfully
    new_verify = client.get(f"/auth/verify-email?token={token2}", headers={"Accept": "application/json"})
    assert new_verify.status_code == 200


# ==============================================================================
# 11. Resend is rate-limited
# ==============================================================================
def test_resend_verification_rate_limiting(client):
    rate_client = TestClient(app, base_url="https://testserver", headers={"X-Forwarded-For": "203.0.113.88"})
    test_email = "rate_limit_test@example.com"

    # Exhaust rate limit threshold
    for _ in range(settings.RATE_LIMIT_RESEND_MAX):
        res = rate_client.post("/auth/resend-verification", json={"email": test_email})
        assert res.status_code == 200

    # Exceeding threshold must trigger 429
    res_exceeded = rate_client.post("/auth/resend-verification", json={"email": test_email})
    assert res_exceeded.status_code == 429
    assert "Too many verification requests" in res_exceeded.json()["detail"]


# ==============================================================================
# 12. Duplicate email is handled correctly
# 13. Duplicate username is handled correctly
# ==============================================================================
def test_duplicate_registration_handled_correctly(client):
    unique = f"dup_check_{int(time.time() * 1000)}"
    payload = {
        "username": unique,
        "email": f"{unique}@example.com",
        "password": "ValidPassword123!"
    }
    res1 = client.post("/register", json=payload)
    assert res1.status_code == 201

    # Duplicate username
    dup_username = {
        "username": unique,
        "email": f"different_{unique}@example.com",
        "password": "ValidPassword123!"
    }
    res2 = client.post("/register", json=dup_username)
    assert res2.status_code == 400
    assert "already registered" in res2.json()["detail"]

    # Duplicate email
    dup_email = {
        "username": f"diff_{unique}",
        "email": f"{unique}@example.com",
        "password": "ValidPassword123!"
    }
    res3 = client.post("/register", json=dup_email)
    assert res3.status_code == 400
    assert "already registered" in res3.json()["detail"]


# ==============================================================================
# 16. Existing sentiment analysis functionality still works
# 17. Existing login functionality for verified users still works
# ==============================================================================
def test_sentiment_analysis_and_authenticated_features_for_verified_user(client):
    username = f"verified_analyst_{int(time.time() * 1000)}"
    email = f"{username}@example.com"
    password = "ValidPassword123!"

    client.post("/register", json={"username": username, "email": email, "password": password})
    raw_token = email_service.get_last_sent_token_for(email)
    client.get(f"/auth/verify-email?token={raw_token}", headers={"Accept": "application/json"})

    # Login
    login_res = client.post("/login", json={"username": username, "password": password})
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Prediction works
    pred_res = client.post("/predict", json={"text": "SentimentPulse email verification is completely robust!"}, headers=headers)
    assert pred_res.status_code == 200
    assert pred_res.json()["sentiment"] == "positive"
    assert pred_res.json()["confidence"] > 0.5


# ==============================================================================
# 18. Existing database records are preserved during migration
# ==============================================================================
def test_existing_users_preserved_and_defaulted_to_verified_during_migration(tmp_path):
    import sqlite3
    from sqlalchemy import create_engine, inspect
    from sqlalchemy.orm import sessionmaker
    import db.session as session_module

    db_file = tmp_path / "migration_preservation.db"
    conn = sqlite3.connect(str(db_file))
    # Create legacy table with existing user before verification existed
    conn.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR(50) UNIQUE, email VARCHAR(120) UNIQUE, hashed_password VARCHAR(255), is_active BOOLEAN DEFAULT 1)"
    )
    conn.execute(
        "INSERT INTO users (id, username, email, hashed_password, is_active) VALUES (1, 'legacy_user', 'legacy@example.com', 'hashed_pass_placeholder', 1)"
    )
    conn.commit()
    conn.close()

    test_engine = create_engine(f"sqlite:///{db_file}")
    orig_engine = session_module.engine
    session_module.engine = test_engine
    try:
        session_module._migrate_schema()

        insp = inspect(test_engine)
        cols = {c["name"] for c in insp.get_columns("users")}
        assert "email_verified" in cols
        assert "email_verified_at" in cols

        TestSession = sessionmaker(bind=test_engine)
        with TestSession() as s:
            legacy_u = s.query(User).filter(User.username == "legacy_user").first()
            assert legacy_u is not None
            assert legacy_u.email == "legacy@example.com"
            # Crucial: Existing user must be preserved and verified so they are NOT locked out!
            assert legacy_u.email_verified is True
    finally:
        session_module.engine = orig_engine
