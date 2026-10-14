"""
Frontend static assets and template integration test suite.
Verifies that the dashboard template and static JavaScript/CSS modules
are served correctly by FastAPI and contain the required DOM structure without authentication.
"""

import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture
def client():
    return TestClient(app, base_url="https://testserver", follow_redirects=False)


def test_login_and_register_routes_return_404(client):
    """Verifies that /login, /register, and all auth routes are permanently removed and return 404."""
    for path in [
        "/login",
        "/register",
        "/logout",
        "/me",
        "/auth/verify-email",
        "/auth/resend-verification",
        "/api/login",
        "/api/register",
        "/api/logout",
        "/api/me",
        "/api/auth/verify-email",
        "/api/auth/resend-verification",
    ]:
        assert client.get(path).status_code == 404, f"GET {path} should be 404"
        assert client.post(path).status_code == 404, f"POST {path} should be 404"



def test_root_renders_saas_shell_directly(client):
    """Accessing / directly renders the SaaS dashboard without requiring login."""
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
