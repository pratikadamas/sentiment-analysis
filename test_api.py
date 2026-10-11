"""
Automated Integration Tests for FastAPI Endpoints in main.py.
Uses FastAPI TestClient to test status codes, validation, and prediction responses.
"""

import unittest
from fastapi.testclient import TestClient
from main import app

class TestFastAPIBackend(unittest.TestCase):
    def setUp(self):
        # Using context manager for lifespan startup/shutdown events
        self.client_context = TestClient(app)
        self.client = self.client_context.__enter__()

    def tearDown(self):
        self.client_context.__exit__(None, None, None)

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertTrue(data["model_loaded"])

    def test_predict_positive(self):
        payload = {"text": "This application works amazingly well! I love it."}
        response = self.client.post("/predict", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["sentiment"], "positive")
        self.assertGreater(data["confidence"], 0.5)
        self.assertIn("positive", data["scores"])
        self.assertIn("neutral", data["scores"])
        self.assertIn("negative", data["scores"])

    def test_predict_negative(self):
        payload = {"text": "Terrible service, it broke immediately and was a complete waste."}
        response = self.client.post("/predict", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["sentiment"], "negative")
        self.assertGreater(data["confidence"], 0.5)

    def test_predict_neutral(self):
        payload = {"text": "The meeting is scheduled for tomorrow at 10 AM in room 204."}
        response = self.client.post("/predict", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["sentiment"], "neutral")

    def test_predict_empty_text_validation_error(self):
        payload = {"text": "   "}
        response = self.client.post("/predict", json=payload)
        # Pydantic field_validator should reject whitespace-only strings with 422
        self.assertEqual(response.status_code, 422)

    def test_batch_prediction(self):
        payload = {
            "texts": [
                "I love this modern interface!",
                "The system rebooted at midnight.",
                "Worst experience ever."
            ]
        }
        response = self.client.post("/predict/batch", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 3)
        self.assertEqual(len(data["results"]), 3)
        self.assertEqual(data["results"][0]["sentiment"], "positive")
        self.assertEqual(data["results"][1]["sentiment"], "neutral")
        self.assertEqual(data["results"][2]["sentiment"], "negative")


if __name__ == "__main__":
    unittest.main()
