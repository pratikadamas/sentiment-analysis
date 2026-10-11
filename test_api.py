"""
Automated Integration Tests for FastAPI Endpoints in main.py.
Tests healthcheck, registration, login, JWT validation, and secured prediction endpoints.
"""

import unittest
import time
from fastapi.testclient import TestClient
from main import app


class TestFastAPIBackend(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Create a unique test user once for the test suite
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()
        
        cls.username = f"tester_{int(time.time() * 1000)}"
        cls.password = "validPassword123"
        cls.email = f"{cls.username}@example.com"

        # Register user
        reg_res = cls.client.post("/register", json={
            "username": cls.username,
            "email": cls.email,
            "password": cls.password
        })
        assert reg_res.status_code == 201, f"Failed setup register: {reg_res.text}"

        # Login to obtain token
        login_res = cls.client.post("/login", json={
            "username": cls.username,
            "password": cls.password
        })
        assert login_res.status_code == 200, f"Failed setup login: {login_res.text}"
        cls.token = login_res.json()["access_token"]
        cls.auth_headers = {"Authorization": f"Bearer {cls.token}"}

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertTrue(data["model_loaded"])

    def test_unauthenticated_predict_rejected(self):
        # Requests without Authorization header must receive 401 Unauthorized
        payload = {"text": "This should be unauthorized without token"}
        response = self.client.post("/predict", json=payload)
        self.assertEqual(response.status_code, 401)

    def test_predict_positive(self):
        payload = {"text": "This application works amazingly well! I love it."}
        response = self.client.post("/predict", json=payload, headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["sentiment"], "positive")
        self.assertGreater(data["confidence"], 0.5)
        self.assertIn("positive", data["scores"])
        self.assertIn("neutral", data["scores"])
        self.assertIn("negative", data["scores"])

    def test_predict_negative(self):
        payload = {"text": "Terrible service, it broke immediately and was a complete waste."}
        response = self.client.post("/predict", json=payload, headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["sentiment"], "negative")
        self.assertGreater(data["confidence"], 0.5)

    def test_predict_neutral(self):
        payload = {"text": "The meeting is scheduled for tomorrow at 10 AM in room 204."}
        response = self.client.post("/predict", json=payload, headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["sentiment"], "neutral")

    def test_predict_empty_text_validation_error(self):
        payload = {"text": "   "}
        response = self.client.post("/predict", json=payload, headers=self.auth_headers)
        # Pydantic field_validator should reject whitespace-only strings with 422
        self.assertEqual(response.status_code, 422)

    def test_batch_prediction(self):
        payload = {
            "texts": [
                "I love this modern interface!",
                "The meeting is scheduled for tomorrow.",
                "Worst experience ever."
            ]
        }
        response = self.client.post("/predict/batch", json=payload, headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["count"], 3)
        self.assertEqual(len(data["results"]), 3)
        self.assertEqual(data["results"][0]["sentiment"], "positive")
        self.assertEqual(data["results"][1]["sentiment"], "neutral")
        self.assertEqual(data["results"][2]["sentiment"], "negative")

    def test_me_endpoint(self):
        response = self.client.get("/me", headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["username"], self.username)


if __name__ == "__main__":
    unittest.main()
