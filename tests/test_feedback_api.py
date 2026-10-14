"""
Test suite for Customer Feedback API and IDOR authorization enforcement.
Verifies feedback creation, persistence, filtering, pagination, stats, and cross-user isolation.
"""

import time
import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app, base_url="https://testserver") as test_client:
        yield test_client


def register_and_login(client, username_prefix: str):
    unique = f"{username_prefix}_{int(time.time() * 1000)}"
    email = f"{unique}@example.com"
    reg_res = client.post("/register", json={
        "username": unique,
        "email": email,
        "password": "ValidPassword123"
    })
    assert reg_res.status_code == 201

    from services.email_service import email_service
    raw_token = email_service.get_last_sent_token_for(email)
    if raw_token:
        verify_res = client.get(f"/auth/verify-email?token={raw_token}", follow_redirects=False)
        assert verify_res.status_code in (200, 302)

    login_res = client.post("/login", json={
        "username": unique,
        "password": "ValidPassword123"
    })
    assert login_res.status_code == 200
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    return unique, headers


def test_create_and_get_feedback(client):
    user, headers = register_and_login(client, "fbuser")

    # Create positive feedback
    payload = {
        "text": "The platform responsiveness is fantastic, our support team is delighted!",
        "category": "product",
        "source": "web",
        "rating": 5
    }
    create_res = client.post("/feedback", json=payload, headers=headers)
    assert create_res.status_code == 201
    fb_data = create_res.json()
    assert fb_data["sentiment"] == "positive"
    assert fb_data["confidence"] > 0.5
    assert fb_data["category"] == "product"
    assert fb_data["rating"] == 5
    fb_id = fb_data["id"]

    # Retrieve single record
    get_res = client.get(f"/feedback/{fb_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json()["id"] == fb_id
    assert get_res.json()["text"] == payload["text"]


def test_feedback_pagination_and_filtering(client):
    user, headers = register_and_login(client, "filteruser")

    # Seed feedback entries
    samples = [
        ("Love this new dashboard feature!", "feature", 5),
        ("Terrible customer service, nobody answered my ticket.", "support", 1),
        ("The checkout page was completely unresponsive.", "billing", 1),
        ("It was okay, nothing special but workable.", "product", 3)
    ]
    for text, cat, rating in samples:
        client.post("/feedback", json={"text": text, "category": cat, "rating": rating}, headers=headers)

    # Test list pagination
    list_res = client.get("/feedback?page=1&page_size=2", headers=headers)
    assert list_res.status_code == 200
    data = list_res.json()
    assert len(data["items"]) == 2
    assert data["total"] == 4
    assert data["total_pages"] == 2

    # Filter by negative sentiment
    neg_res = client.get("/feedback?sentiment=negative", headers=headers)
    assert neg_res.status_code == 200
    neg_data = neg_res.json()
    assert neg_data["total"] >= 2
    for item in neg_data["items"]:
        assert item["sentiment"] == "negative"

    # Filter by search keyword
    search_res = client.get("/feedback?search=dashboard", headers=headers)
    assert search_res.status_code == 200
    assert search_res.json()["total"] == 1
    assert "dashboard" in search_res.json()["items"][0]["text"].lower()


def test_idor_cross_user_data_isolation(client):
    """
    CRITICAL SECURITY TEST:
    Verifies that User B cannot read or delete feedback records created by User A.
    """
    user_a, headers_a = register_and_login(client, "usera")
    user_b, headers_b = register_and_login(client, "userb")

    # User A creates a record
    create_res = client.post("/feedback", json={
        "text": "User A confidential customer review.",
        "category": "security"
    }, headers=headers_a)
    assert create_res.status_code == 201
    feedback_id = create_res.json()["id"]

    # User B attempts to view User A's feedback (IDOR read attack)
    get_res = client.get(f"/feedback/{feedback_id}", headers=headers_b)
    assert get_res.status_code == 404
    assert "not found" in get_res.json()["detail"].lower()

    # User B attempts to delete User A's feedback (IDOR delete attack)
    del_res = client.delete(f"/feedback/{feedback_id}", headers=headers_b)
    assert del_res.status_code == 404
    assert "not found" in del_res.json()["detail"].lower()

    # Verify User A can still view the record
    verify_res = client.get(f"/feedback/{feedback_id}", headers=headers_a)
    assert verify_res.status_code == 200

    # User A successfully deletes own record
    del_res_a = client.delete(f"/feedback/{feedback_id}", headers=headers_a)
    assert del_res_a.status_code == 200

    # Record is now gone
    final_res = client.get(f"/feedback/{feedback_id}", headers=headers_a)
    assert final_res.status_code == 404


def test_feedback_stats(client):
    user, headers = register_and_login(client, "statsuser")

    client.post("/feedback", json={"text": "Outstanding and wonderful experience!"}, headers=headers)
    client.post("/feedback", json={"text": "Horrible and broken experience!"}, headers=headers)

    res = client.get("/feedback/stats", headers=headers)
    assert res.status_code == 200
    stats = res.json()
    assert stats["total_count"] == 2
    assert stats["positive_count"] == 1
    assert stats["negative_count"] == 1
    assert stats["positive_pct"] == 50.0
    assert stats["negative_pct"] == 50.0
    assert stats["average_confidence"] > 0.0
