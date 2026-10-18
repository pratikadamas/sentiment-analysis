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


# ==============================================================================
# PHASE 10 COMPLIANCE TESTS (TEST 1 - TEST 10)
# ==============================================================================

def test_phase10_test1_analyze_without_persistence(client):
    """
    TEST 1: Analyze feedback with persistence disabled.
    Expected: sentiment inference succeeds, no feedback INSERT occurs.
    """
    initial_res = client.get("/feedback/stats")
    assert initial_res.status_code == 200
    initial_total = initial_res.json()["total_count"]

    predict_res = client.post("/predict", json={"text": "she is so good"})
    assert predict_res.status_code == 200
    data = predict_res.json()
    assert data["sentiment"] == "positive"
    assert data["confidence"] > 0.5
    assert "scores" in data

    final_res = client.get("/feedback/stats")
    assert final_res.status_code == 200
    assert final_res.json()["total_count"] == initial_total


def test_phase10_test2_analyze_with_persistence_exact_input(client):
    """
    TEST 2: Analyze feedback with persistence enabled.
    Input: "she is so good", Channel: "web", Rating: None, Category: None.
    Expected: inference succeeds, feedback record created with positive sentiment,
    confidence stored, channel/source stored, empty category & rating stored as None.
    """
    payload = {
        "text": "she is so good",
        "category": None,
        "source": "web",
        "rating": None
    }
    res = client.post("/feedback", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["sentiment"] == "positive"
    assert data["confidence"] > 0.5
    assert data["source"] == "web"
    assert data["category"] is None
    assert data["rating"] is None
    assert data["user_id"] is None
    assert "id" in data
    assert data["text"] == "she is so good"


def test_phase10_test3_persistence_with_valid_category(client):
    """
    TEST 3: Persistence with a valid category.
    """
    payload = {
        "text": "The billing portal processed the payment instantly.",
        "category": "billing",
        "source": "web",
        "rating": 5
    }
    res = client.post("/feedback", json=payload)
    assert res.status_code == 201
    assert res.json()["category"] == "billing"


def test_phase10_test4_persistence_with_customer_rating(client):
    """
    TEST 4: Persistence with a customer rating (e.g. 4 stars).
    """
    payload = {
        "text": "Good experience overall, could be slightly faster.",
        "category": "support",
        "source": "web",
        "rating": 4
    }
    res = client.post("/feedback", json=payload)
    assert res.status_code == 201
    assert res.json()["rating"] == 4


def test_phase10_test5_persistence_without_customer_rating(client):
    """
    TEST 5: Persistence without a customer rating.
    """
    payload = {
        "text": "Neutral feedback with no star rating given.",
        "category": "product",
        "source": "email",
        "rating": None
    }
    res = client.post("/feedback", json=payload)
    assert res.status_code == 201
    assert res.json()["rating"] is None


def test_phase10_test6_persistence_without_category(client):
    """
    TEST 6: Persistence without a category (both None and empty string).
    """
    # None category
    res1 = client.post("/feedback", json={"text": "Review with None category", "category": None})
    assert res1.status_code == 201
    assert res1.json()["category"] is None

    # Empty string category
    res2 = client.post("/feedback", json={"text": "Review with empty string category", "category": ""})
    assert res2.status_code == 201
    assert res2.json()["category"] is None


def test_phase10_test7_unauthorized_and_invalid_persistence(client):
    """
    TEST 7: Unauthorized and invalid persistence requests.
    Expected: Rejected appropriately with 422 Unprocessable Entity.
    """
    # Empty text
    res_empty = client.post("/feedback", json={"text": "", "rating": 5})
    assert res_empty.status_code == 422

    # Pure whitespace text
    res_ws = client.post("/feedback", json={"text": "     ", "rating": 5})
    assert res_ws.status_code == 422

    # Rating above 5
    res_high_rating = client.post("/feedback", json={"text": "Valid text", "rating": 6})
    assert res_high_rating.status_code == 422

    # Rating below 1
    res_low_rating = client.post("/feedback", json={"text": "Valid text", "rating": 0})
    assert res_low_rating.status_code == 422


def test_phase10_test8_database_failure_rollback(client, monkeypatch):
    """
    TEST 8: Database failure handling.
    Expected: Transaction rolls back, endpoint returns controlled 500 error,
    no partial/corrupt record remains in the database.
    """
    from sqlalchemy.orm import Session
    from sqlalchemy.exc import OperationalError

    original_commit = Session.commit

    def failing_commit(self):
        raise OperationalError("Simulated database failure on commit", None, None)

    monkeypatch.setattr(Session, "commit", failing_commit)

    res = client.post("/feedback", json={"text": "This should fail and roll back safely."})
    assert res.status_code == 500
    assert res.json()["detail"] == "Failed to persist feedback record."

    monkeypatch.undo()

    # Verify database remains clean and uncorrupted
    verify_res = client.get("/feedback?search=safely")
    assert verify_res.status_code == 200
    assert not any("fail and roll back safely" in item["text"] for item in verify_res.json()["items"])


def test_phase10_test9_sqlite_backend_foreign_keys():
    """
    TEST 9: SQLite backend compatibility.
    Expected: PRAGMA foreign_key_check passes with 0 violations,
    and inserts succeed cleanly when PRAGMA foreign_keys = ON.
    """
    from db.session import engine
    from sqlalchemy import text

    with engine.connect() as conn:
        # Check foreign keys consistency
        res = conn.execute(text("PRAGMA foreign_key_check")).fetchall()
        assert len(res) == 0

        # Enable strict foreign keys and verify an insert succeeds
        conn.execute(text("PRAGMA foreign_keys = ON"))
        test_ins = conn.execute(text("""
            INSERT INTO feedback (text, sentiment, confidence, positive_score, neutral_score,
                negative_score, model_version, created_at, updated_at)
            VALUES ('SQLite FK verification review', 'positive', 0.95, 0.95, 0.03, 0.02, '3.0.0',
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """))
        conn.commit()

        # Clean up test record
        conn.execute(text("DELETE FROM feedback WHERE text = 'SQLite FK verification review'"))
        conn.commit()


def test_phase10_test10_postgresql_compatible_behavior():
    """
    TEST 10: PostgreSQL-compatible dual-dialect behavior.
    Expected: Models use standard SQLAlchemy types with timezone-aware datetimes,
    no dialect-specific SQL hacks, and normalize_db_url properly maps PostgreSQL schemes.
    """
    from core.config import _normalize_db_url
    from db.models import Feedback

    # Verify psycopg dialect normalization
    assert _normalize_db_url("postgres://u:p@h:5432/db") == "postgresql+psycopg://u:p@h:5432/db"
    assert _normalize_db_url("postgresql://u:p@h:5432/db") == "postgresql+psycopg://u:p@h:5432/db"
    assert _normalize_db_url("sqlite:///sentiment.db") == "sqlite:///sentiment.db"

    # Verify Feedback model has timezone-aware DateTime columns
    created_at_col = Feedback.__table__.columns["created_at"]
    assert created_at_col.type.timezone is True
    updated_at_col = Feedback.__table__.columns["updated_at"]
    assert updated_at_col.type.timezone is True

    # Verify user_id is nullable in ORM definition
    user_id_col = Feedback.__table__.columns["user_id"]
    assert user_id_col.nullable is True

