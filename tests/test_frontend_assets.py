"""
Frontend static assets and template integration test suite.
Verifies that all server-rendered HTML templates and static JavaScript/CSS modules
are served correctly by FastAPI and contain the required DOM structure.
"""

import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture
def client():
    return TestClient(app, base_url="https://testserver", follow_redirects=False)


def test_login_page_renders_cleanly(client):
    """Verifies that /login renders the accessible login template with form elements."""
    response = client.get("/login")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    html = response.text
    assert "Sign In" in html
    assert 'id="login-form"' in html
    assert 'id="username"' in html
    assert 'id="password"' in html
    assert 'id="theme-toggle"' in html
    assert "/static/theme.js" in html
    assert "/static/css/app.css" in html


def test_register_page_renders_cleanly(client):
    """Verifies that /register renders the accessible registration template."""
    response = client.get("/register")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    html = response.text
    assert "Create your account" in html
    assert 'id="register-form"' in html
    assert 'id="username"' in html
    assert 'id="email"' in html
    assert 'id="password"' in html
    assert 'id="confirm-password"' in html
    assert 'id="theme-toggle"' in html


def test_unauthenticated_root_redirects_to_login(client):
    """Unauthenticated users accessing / should be redirected to /login with 302."""
    response = client.get("/")
    assert response.status_code == 302
    assert response.headers["location"] == "/login"


def test_authenticated_root_renders_saas_shell(client):
    """Authenticated user accessing / should receive the index.html SaaS dashboard."""
    import time
    username = f"front_user_{int(time.time() * 1000)}"
    # Register and login a test user
    test_email = f"{username}@example.com"
    client.post("/register", json={
        "username": username,
        "email": test_email,
        "password": "SecretPassword123"
    })
    from services.email_service import email_service
    token = email_service.get_last_sent_token_for(test_email)
    if token:
        client.get(f"/auth/verify-email?token={token}", follow_redirects=False)

    login_resp = client.post("/login", json={
        "username": username,
        "password": "SecretPassword123"
    })
    assert login_resp.status_code == 200

    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    html = response.text

    # Core SaaS App Shell Components
    assert "SentimentPulse" in html
    assert 'id="view-overview"' in html
    assert 'id="view-analyze"' in html
    assert 'id="view-explorer"' in html
    assert 'id="view-analytics"' in html
    assert 'id="view-import-export"' in html

    # Modular Scripts
    assert "/static/css/app.css" in html
    assert "/static/theme.js" in html
    assert "/static/js/api.js" in html
    assert "/static/js/overview.js" in html
    assert "/static/js/analyze.js" in html
    assert "/static/js/explorer.js" in html
    assert "/static/js/analytics.js" in html
    assert "/static/js/imports.js" in html
    assert "/static/js/app.js" in html

    # Modals & Alerts
    assert 'id="feedback-detail-modal"' in html
    assert 'id="global-confirm-modal"' in html
    assert 'id="toast-container"' in html


def test_static_css_and_javascript_served_with_correct_mime(client):
    """Verifies that all modular static frontend assets are reachable with 200 OK."""
    static_files = [
        ("/static/css/app.css", "text/css"),
        ("/static/theme.js", "javascript"),
        ("/static/js/api.js", "javascript"),
        ("/static/js/overview.js", "javascript"),
        ("/static/js/analyze.js", "javascript"),
        ("/static/js/explorer.js", "javascript"),
        ("/static/js/analytics.js", "javascript"),
        ("/static/js/imports.js", "javascript"),
        ("/static/js/app.js", "javascript"),
    ]

    for path, expected_type in static_files:
        resp = client.get(path)
        assert resp.status_code == 200, f"Failed to retrieve {path}: status {resp.status_code}"
        assert expected_type in resp.headers["content-type"].lower(), (
            f"Expected {expected_type} in content-type for {path}, got {resp.headers['content-type']}"
        )
