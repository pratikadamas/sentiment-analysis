"""
Test suite for system reliability, observability, and probe endpoints.
Tests liveness, readiness, correlation IDs, process time headers, and clean error handling.
"""

import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app, base_url="https://testserver") as test_client:
        yield test_client


def test_liveness_probe(client):
    res = client.get("/health/live")
    assert res.status_code == 200
    assert res.json() == {"status": "alive"}


def test_readiness_probe(client):
    res = client.get("/health/ready")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ready"
    assert data["database"] == "ok"
    assert data["model"] == "ok"
    assert data["ready"] is True


def test_request_id_and_process_time_middleware(client):
    # Standard request automatically gets a UUID X-Request-ID and X-Process-Time
    res = client.get("/health")
    assert res.status_code == 200
    assert "X-Request-ID" in res.headers
    assert "X-Process-Time" in res.headers
    assert res.headers["X-Process-Time"].endswith("ms")

    # Custom incoming X-Request-ID is preserved
    custom_id = "trace-req-alpha-998877"
    res_custom = client.get("/health", headers={"X-Request-ID": custom_id})
    assert res_custom.status_code == 200
    assert res_custom.headers["X-Request-ID"] == custom_id


def test_clean_error_response_no_stack_traces(client):
    # Malformed JSON body
    res = client.post(
        "/predict",
        content="not-valid-json",
        headers={"Content-Type": "application/json"}
    )
    assert res.status_code in (400, 422)
    # Ensure raw Python traceback is not leaked in response
    assert "Traceback" not in res.text
