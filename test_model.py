"""
Unit and integration test script for model inference.
"""

import sys
import unittest
from model import SentimentAnalyzer

class TestSentimentModel(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.analyzer = SentimentAnalyzer()

    def test_positive_sentiment(self):
        text = "This product exceeded all my expectations! Highly recommended."
        res = self.analyzer.predict(text)
        self.assertEqual(res["sentiment"], "positive")
        self.assertGreater(res["confidence"], 0.5)
        self.assertIn("positive", res["scores"])
        self.assertIn("neutral", res["scores"])
        self.assertIn("negative", res["scores"])

    def test_negative_sentiment(self):
        text = "The service was awful and completely unacceptable."
        res = self.analyzer.predict(text)
        self.assertEqual(res["sentiment"], "negative")
        self.assertGreater(res["confidence"], 0.5)

    def test_neutral_sentiment(self):
        text = "The food was okay, nothing special but not bad either."
        res = self.analyzer.predict(text)
        self.assertEqual(res["sentiment"], "neutral")

    def test_empty_string_raises(self):
        with self.assertRaises(ValueError):
            self.analyzer.predict("   ")

    def test_model_artifact_loading_and_probabilities_sum_to_one(self):
        """Verify sentiment_model.joblib loads cleanly and predict_proba sums to ~1.0."""
        import os
        import joblib
        model_path = os.path.join(os.path.dirname(__file__), "sentiment_model.joblib")
        self.assertTrue(os.path.exists(model_path), "sentiment_model.joblib must exist")
        loaded_model = joblib.load(model_path)
        self.assertTrue(hasattr(loaded_model, "predict_proba"))

        sample_texts = [
            "This product exceeded all my expectations! Highly recommended.",
            "The food was okay, nothing special but not bad either.",
            "The service was awful and completely unacceptable."
        ]
        for sample in sample_texts:
            raw_probs = loaded_model.predict_proba([sample])[0]
            self.assertAlmostEqual(float(sum(raw_probs)), 1.0, places=4)

            res = self.analyzer.predict(sample)
            scores_sum = sum(res["scores"].values())
            self.assertAlmostEqual(scores_sum, 1.0, places=3)

if __name__ == "__main__":
    unittest.main()
