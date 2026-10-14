"""
Test suite for customer sentiment intelligence analytics.
Tests aggregation metrics, empty datasets, sentiment trends over time, and negative feedback tracking without authentication.
"""

import pytest
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app, base_url="https://testserver") as test_client:
        yield test_client


def test_analytics_empty_dataset(client):
    # Query with date range in future to test zero-record handling
    future_date = "2099-01-01T00:00:00Z"
    res = client.get(f"/feedback/analytics?start_date={future_date}")
    assert res.status_code == 200
    data = res.json()
    assert data["total_feedback"] == 0
    assert data["average_confidence"] == 0.0
    assert data["sentiment_trends"] == []
    assert data["category_breakdown"] == []
    assert data["recent_negative_feedback"] == []


def test_analytics_populated_dataset(client):
    samples = [
        ("The product is truly excellent, we rely on it every day.", "product", "web"),
        ("I had a great time using the system today.", "product", "app"),
        ("The checkout flow crashed and charged me twice!", "billing", "web"),
        ("The customer support team never responded to my urgent email.", "support", "email"),
        ("It is an average tool, nothing standout.", "product", "web")
    ]
    for text, cat, src in samples:
        client.post("/feedback", json={"text": text, "category": cat, "source": src})

    res = client.get("/feedback/analytics")
    assert res.status_code == 200
    data = res.json()

    assert data["total_feedback"] >= 5
    assert data["sentiment_counts"]["positive"] >= 1
    assert data["sentiment_counts"]["negative"] >= 1
    assert data["average_confidence"] > 0.0

    # Verify trends
    assert len(data["sentiment_trends"]) >= 1

    # Verify category breakdown
    assert len(data["category_breakdown"]) >= 1

    # Verify recent negative feedback surfaces churn risk items
    assert len(data["recent_negative_feedback"]) >= 1
    for item in data["recent_negative_feedback"]:
        assert item["confidence"] > 0.0
        assert item["text"] is not None
