"""
Test suite for Customer Feedback API.
Verifies feedback creation, persistence, filtering, pagination, stats, and deletion without authentication.
"""

import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app, base_url="https://testserver") as test_client:
        yield test_client


def test_create_and_get_feedback(client):
    # Create positive feedback
    payload = {
        "text": "The platform responsiveness is fantastic, our support team is delighted!",
        "category": "product",
        "source": "web",
        "rating": 5
    }
    create_res = client.post("/feedback", json=payload)
    assert create_res.status_code == 201
    fb_data = create_res.json()
    assert fb_data["sentiment"] == "positive"
    assert fb_data["confidence"] > 0.5
    assert fb_data["category"] == "product"
    assert fb_data["rating"] == 5
    fb_id = fb_data["id"]

    # Retrieve single record
    get_res = client.get(f"/feedback/{fb_id}")
    assert get_res.status_code == 200
    assert get_res.json()["id"] == fb_id
    assert get_res.json()["text"] == payload["text"]


def test_feedback_pagination_and_filtering(client):
    # Seed unique feedback entries
    samples = [
        ("Love this new dashboard feature!", "feature", 5),
        ("Terrible customer service, nobody answered my ticket.", "support", 1),
        ("The checkout page was completely unresponsive.", "billing", 1),
        ("It was okay, nothing special but workable.", "product", 3)
    ]
    for text, cat, rating in samples:
        client.post("/feedback", json={"text": text, "category": cat, "rating": rating})

    # Test list pagination
    list_res = client.get("/feedback?page=1&page_size=2")
    assert list_res.status_code == 200
    data = list_res.json()
    assert len(data["items"]) == 2
    assert data["total"] >= 4
    assert data["total_pages"] >= 2

    # Filter by negative sentiment
    neg_res = client.get("/feedback?sentiment=negative")
    assert neg_res.status_code == 200
    neg_data = neg_res.json()
    assert neg_data["total"] >= 2
    for item in neg_data["items"]:
        assert item["sentiment"] == "negative"

    # Filter by search keyword
    search_res = client.get("/feedback?search=dashboard")
    assert search_res.status_code == 200
    assert search_res.json()["total"] >= 1
    found = any("dashboard" in item["text"].lower() for item in search_res.json()["items"])
    assert found


def test_feedback_deletion(client):
    # Create record
    create_res = client.post("/feedback", json={
        "text": "Temporary customer review to be deleted.",
        "category": "temp"
    })
    assert create_res.status_code == 201
    feedback_id = create_res.json()["id"]

    # Verify retrieval
    get_res = client.get(f"/feedback/{feedback_id}")
    assert get_res.status_code == 200

    # Delete record
    del_res = client.delete(f"/feedback/{feedback_id}")
    assert del_res.status_code == 200

    # Verify gone
    final_res = client.get(f"/feedback/{feedback_id}")
    assert final_res.status_code == 404


def test_feedback_stats(client):
    res = client.get("/feedback/stats")
    assert res.status_code == 200
    stats = res.json()
    assert stats["total_count"] >= 1
    assert "positive_count" in stats
    assert "negative_count" in stats
    assert "neutral_count" in stats
    assert "average_confidence" in stats


def test_feedback_api_prefix_compatibility(client):
    # Verify /api/feedback prefix works identically
    res = client.get("/api/feedback?page=1&page_size=5")
    assert res.status_code == 200
    assert "items" in res.json()

    stats_res = client.get("/api/feedback/stats")
    assert stats_res.status_code == 200
