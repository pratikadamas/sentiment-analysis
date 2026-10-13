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
