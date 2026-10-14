"""
Automated Integration Tests for FastAPI Endpoints in main.py.
Tests health checks, prediction endpoints, and frontend routing without authentication.
"""

import unittest
from fastapi.testclient import TestClient
from main import app


class TestFastAPIBackend(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client_context = TestClient(app)
        cls.client = cls.client_context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.client_context.__exit__(None, None, None)

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertTrue(data["model_loaded"])
        self.assertEqual(data["version"], "3.0.0")
        self.assertEqual(data["model_version"], "3.0.0")
        self.assertEqual(data["dataset_name"], "yelp_review_full")
        self.assertIsNotNone(data["test_macro_f1"])
        self.assertIsNotNone(data["training_date"])

    def test_health_probes(self):
        live_res = self.client.get("/health/live")
        self.assertEqual(live_res.status_code, 200)
        self.assertEqual(live_res.json()["status"], "alive")

        ready_res = self.client.get("/health/ready")
        self.assertEqual(ready_res.status_code, 200)
        self.assertTrue(ready_res.json()["ready"])

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
        payload = {"text": "The food was okay, nothing special but not bad either."}
        response = self.client.post("/predict", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["sentiment"], "neutral")

    def test_predict_empty_text_validation_error(self):
        payload = {"text": "   "}
        response = self.client.post("/predict", json=payload)
        self.assertEqual(response.status_code, 422)

    def test_predict_probabilities_sum_to_one(self):
        payload = {"text": "The atmosphere was pleasant and the dessert was fantastic."}
        response = self.client.post("/predict", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        scores = data["scores"]
        self.assertAlmostEqual(sum(scores.values()), 1.0, places=3)

    def test_predict_gibberish(self):
        payload = {"text": "asdfghjkl zxcvbnm"}
        response = self.client.post("/predict", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["sentiment"], "unknown")

    def test_batch_prediction(self):
        payload = {
            "texts": [
                "I love this modern interface!",
                "The food was okay, nothing special but not bad either.",
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

    def test_root_returns_200_directly(self):
        client = TestClient(app, follow_redirects=False)
        response = client.get("/")
        self.assertEqual(response.status_code, 200)

    def test_login_and_register_endpoints_return_404(self):
        client = TestClient(app, follow_redirects=False)
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
            self.assertEqual(client.get(path).status_code, 404, f"GET {path} should be 404")
            self.assertEqual(client.post(path).status_code, 404, f"POST {path} should be 404")



if __name__ == "__main__":
    unittest.main()
