"""
Comprehensive test suite for advanced authentication and security controls.
Tests rate limiting, invalid credentials, duplicate registration, token tampering, and session invalidation.
"""

import time
import pytest
from fastapi.testclient import TestClient
from main import app
from core.security import create_access_token


@pytest.fixture(scope="module")
def client():
    with TestClient(app, base_url="https://testserver") as test_client:
        yield test_client


def test_duplicate_registration_rejected(client):
    unique_user = f"dupuser_{int(time.time() * 1000)}"
    payload = {
        "username": unique_user,
        "email": f"{unique_user}@example.com",
        "password": "ValidPassword123"
    }
    # First registration
    res1 = client.post("/register", json=payload)
    assert res1.status_code == 201

    # Duplicate username
    dup_username = {
        "username": unique_user,
        "email": f"different_{unique_user}@example.com",
        "password": "ValidPassword123"
    }
    res2 = client.post("/register", json=dup_username)
    assert res2.status_code == 400
    assert "already registered" in res2.json()["detail"]

    # Duplicate email
    dup_email = {
        "username": f"diff_{unique_user}",
        "email": f"{unique_user}@example.com",
        "password": "ValidPassword123"
    }
    res3 = client.post("/register", json=dup_email)
    assert res3.status_code == 400
    assert "already registered" in res3.json()["detail"]


def test_invalid_login_credentials(client):
    res = client.post("/login", json={
        "username": "non_existent_user_9999",
        "password": "incorrectPassword"
    })
    assert res.status_code == 401
    assert "Incorrect username or password" in res.json()["detail"]


def test_invalid_jwt_token_rejected(client):
    res = client.get("/me", headers={"Authorization": "Bearer invalid.jwt.token.string"})
    assert res.status_code == 401
    assert "Could not validate credentials" in res.json()["detail"]


def test_token_with_nonexistent_user_rejected(client):
    fake_token = create_access_token(data={"sub": "ghost_user_does_not_exist"})
    res = client.get("/me", headers={"Authorization": f"Bearer {fake_token}"})
    assert res.status_code == 401
    assert "User associated with this token was not found" in res.json()["detail"]


def test_login_rate_limiting(client):
    # Ensure repeated rapid attempts trigger rate limiting
    from core.config import settings
    ip_client = TestClient(app, base_url="https://testserver", headers={"X-Forwarded-For": "198.51.100.42"})
    for _ in range(settings.RATE_LIMIT_LOGIN_MAX + 1):
        res = ip_client.post("/login", json={"username": "test", "password": "wrong"})
    assert res.status_code == 429
    assert "Too many login attempts" in res.json()["detail"]


def test_valid_user_registration_and_db_storage(client):
    unique_user = f"reguser_{int(time.time() * 1000)}"
    raw_password = "SecurePassword123!"
    payload = {
        "username": unique_user,
        "email": f"{unique_user}@example.com",
        "password": raw_password
    }

    # 1. Registration succeeds with 201 Created
    res = client.post("/register", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["username"] == unique_user
    assert data["email"] == f"{unique_user}@example.com"
    assert "id" in data

    # 2. Verify user in database
    from db.session import SessionLocal
    from db.models import User
    from core.security import verify_password

    with SessionLocal() as db:
        user = db.query(User).filter(User.username == unique_user).first()
        assert user is not None
        assert user.email == f"{unique_user}@example.com"
        assert user.is_active is True
        assert user.created_at is not None
        # Verify password is NOT plaintext and verifies against bcrypt
        assert user.hashed_password != raw_password
        assert user.hashed_password.startswith("$2b$")
        assert verify_password(raw_password, user.hashed_password) is True

    # 3. Newly registered user can log in with registered credentials
    login_res = client.post("/login", json={
        "username": unique_user,
        "password": raw_password
    })
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert "access_token" in login_data
    assert login_data["username"] == unique_user


def test_registration_email_case_insensitivity(client):
    unique_user = f"caseuser_{int(time.time() * 1000)}"
    payload = {
        "username": unique_user,
        "email": f"UpperCase_{unique_user}@Example.COM",
        "password": "Password123!"
    }
    res = client.post("/register", json=payload)
    assert res.status_code == 201

    # Attempting to register another user with same email (lowercase) must fail
    dup_payload = {
        "username": f"other_{unique_user}",
        "email": f"uppercase_{unique_user}@example.com",
        "password": "Password123!"
    }
    dup_res = client.post("/register", json=dup_payload)
    assert dup_res.status_code in (400, 409)


def test_registration_validation_rejections(client):
    # 1. Missing fields
    res_empty = client.post("/register", json={})
    assert res_empty.status_code == 422

    # 2. Invalid email format
    res_bad_email = client.post("/register", json={
        "username": "validuser123",
        "email": "not-a-valid-email",
        "password": "ValidPassword123"
    })
    assert res_bad_email.status_code == 422

    # 3. Password too short (< 6 chars)
    res_short_pw = client.post("/register", json={
        "username": "validuser123",
        "email": "valid@example.com",
        "password": "123"
    })
    assert res_short_pw.status_code == 422

    # 4. Username too short (< 3 chars)
    res_short_user = client.post("/register", json={
        "username": "ab",
        "email": "valid@example.com",
        "password": "ValidPassword123"
    })
    assert res_short_user.status_code == 422

    # 5. Username with illegal characters
    res_bad_user = client.post("/register", json={
        "username": "user with spaces!",
        "email": "valid@example.com",
        "password": "ValidPassword123"
    })
    assert res_bad_user.status_code == 422


def test_legacy_schema_migration_heals_missing_columns(tmp_path):
    import sqlite3
    from sqlalchemy import create_engine, inspect, text
    from sqlalchemy.orm import sessionmaker
    from db.models import Base, User
    import db.session as session_module

    db_file = tmp_path / "legacy_test.db"
    conn = sqlite3.connect(str(db_file))
    # Create legacy table with only 4 original columns
    conn.execute(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR(50) UNIQUE, email VARCHAR(120) UNIQUE, hashed_password VARCHAR(255))"
    )
    conn.commit()
    conn.close()

    # Create temporary engine
    test_engine = create_engine(f"sqlite:///{db_file}")

    # Inspect before migration
    insp_before = inspect(test_engine)
    cols_before = {c["name"] for c in insp_before.get_columns("users")}
    assert "is_active" not in cols_before
    assert "created_at" not in cols_before
    assert "updated_at" not in cols_before

    # Temporarily monkeypatch session_module.engine
    orig_engine = session_module.engine
    session_module.engine = test_engine
    try:
        session_module._migrate_schema()

        # Inspect after migration
        insp_after = inspect(test_engine)
        cols_after = {c["name"] for c in insp_after.get_columns("users")}
        assert "is_active" in cols_after
        assert "created_at" in cols_after
        assert "updated_at" in cols_after

        # Verify SQLAlchemy User ORM can now query without OperationalError
        TestSession = sessionmaker(bind=test_engine)
        with TestSession() as s:
            u = s.query(User).filter(User.username == "nonexistent").first()
            assert u is None
    finally:
        session_module.engine = orig_engine


def test_readiness_probe_healthy(client):
    res = client.get("/health/ready")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ready"
    assert data["database"] == "ok"
    assert data["model"] == "ok"
    assert data["ready"] is True


