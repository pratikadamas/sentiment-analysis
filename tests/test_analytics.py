"""
Test suite for customer sentiment intelligence analytics.
Tests aggregation metrics, empty datasets, sentiment trends over time, and negative feedback tracking.
"""

import pytest
from fastapi.testclient import TestClient
from main import app
from tests.test_feedback_api import register_and_login


@pytest.fixture(scope="module")
def client():
    with TestClient(app, base_url="https://testserver") as test_client:
        yield test_client


def test_analytics_empty_dataset(client):
    user, headers = register_and_login(client, "emptyuser")
    res = client.get("/feedback/analytics", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["total_feedback"] == 0
    assert data["average_confidence"] == 0.0
    assert data["sentiment_trends"] == []
    assert data["category_breakdown"] == []
    assert data["recent_negative_feedback"] == []


def test_analytics_populated_dataset(client):
    user, headers = register_and_login(client, "analyticsuser")

    samples = [
        ("The product is truly excellent, we rely on it every day.", "product", "web"),
        ("I had a great time using the system today.", "product", "app"),
        ("The checkout flow crashed and charged me twice!", "billing", "web"),
        ("The customer support team never responded to my urgent email.", "support", "email"),
        ("It is an average tool, nothing standout.", "product", "web")
    ]
    for text, cat, src in samples:
        client.post("/feedback", json={"text": text, "category": cat, "source": src}, headers=headers)

    res = client.get("/feedback/analytics", headers=headers)
    assert res.status_code == 200
    data = res.json()

    assert data["total_feedback"] == 5
    assert data["sentiment_counts"]["positive"] >= 2
    assert data["sentiment_counts"]["negative"] >= 2
    assert data["average_confidence"] > 0.0

    # Verify trends
    assert len(data["sentiment_trends"]) >= 1
    today_trend = data["sentiment_trends"][0]
    assert today_trend["total"] == 5

    # Verify category breakdown
    assert len(data["category_breakdown"]) >= 2

    # Verify recent negative feedback surfaces churn risk items
    assert len(data["recent_negative_feedback"]) >= 2
    for item in data["recent_negative_feedback"]:
        assert item["confidence"] > 0.0
        assert item["text"] is not None
