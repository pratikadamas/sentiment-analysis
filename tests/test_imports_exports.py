"""
Test suite for CSV batch imports, job tracking, and secure exports.
Validates bounded CSV parsing, formula injection sanitization, and export functionality without authentication.
"""

import io
import pytest
from fastapi.testclient import TestClient
from main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app, base_url="https://testserver") as test_client:
        yield test_client


def test_csv_upload_and_job_processing(client):
    # Prepare sample CSV
    csv_data = """text,category,rating
"The application is fast and intuitive.",UX,5
"The service failed to connect to database.",Bug,1
"Average experience overall.",General,3
"""
    file_bytes = io.BytesIO(csv_data.encode("utf-8"))
    upload_res = client.post(
        "/feedback/import",
        files={"file": ("customer_reviews.csv", file_bytes, "text/csv")}
    )
    assert upload_res.status_code == 202
    job_info = upload_res.json()
    assert job_info["filename"] == "customer_reviews.csv"
    assert job_info["status"] in ("COMPLETED", "PROCESSING")
    job_id = job_info["id"]

    # Poll status
    status_res = client.get(f"/feedback/import/{job_id}")
    assert status_res.status_code == 200
    job_status = status_res.json()
    assert job_status["status"] == "COMPLETED"
    assert job_status["total_rows"] == 3
    assert job_status["successful_rows"] == 3
    assert job_status["failed_rows"] == 0

    # Verify feedback records were actually persisted
    list_res = client.get("/feedback")
    assert list_res.status_code == 200
    assert list_res.json()["total"] >= 3


def test_invalid_file_extension_rejected(client):
    file_bytes = io.BytesIO(b"binary data")
    res = client.post(
        "/feedback/import",
        files={"file": ("notes.txt", file_bytes, "text/plain")}
    )
    assert res.status_code == 400
    assert "Only CSV files are accepted" in res.json()["detail"]


def test_csv_formula_injection_protection_on_export(client):
    """
    CRITICAL SECURITY TEST:
    Verifies that customer feedback beginning with dangerous spreadsheet formula characters
    (=, +, -, @) are sanitized with a leading single quote (') upon CSV export.
    """
    # Inject formula payloads
    payloads = [
        "=SUM(A1:A10)",
        "@HYPERLINK('http://attacker.com','Click')",
        "-2+3*cmd|' /C calc'!A0",
        "+cmd|' /C calc'!A0"
    ]
    for text in payloads:
        client.post("/feedback", json={"text": text})

    # Export CSV
    export_res = client.get("/feedback/export")
    assert export_res.status_code == 200
    assert export_res.headers["content-type"].startswith("text/csv")
    csv_text = export_res.text

    # Verify formula prefixes are neutralized with leading quote
    assert "'=SUM(A1:A10)" in csv_text
    assert "'@HYPERLINK('http://attacker.com','Click')" in csv_text
    assert "'-2+3*cmd|' /C calc'!A0" in csv_text
    assert "'+cmd|' /C calc'!A0" in csv_text
