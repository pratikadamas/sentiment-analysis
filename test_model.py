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
        """Verify sentiment_model.onnx and tokenizer exist and predict scores sum to ~1.0."""
        import os
        model_path = os.path.join(os.path.dirname(__file__), "sentiment_model.onnx")
        tokenizer_path = os.path.join(os.path.dirname(__file__), "tokenizer", "tokenizer.json")
        self.assertTrue(os.path.exists(model_path), "sentiment_model.onnx must exist")
        self.assertTrue(os.path.exists(tokenizer_path), "tokenizer/tokenizer.json must exist")

        sample_texts = [
            "This product exceeded all my expectations! Highly recommended.",
            "The food was okay, nothing special but not bad either.",
            "The service was awful and completely unacceptable."
        ]
        for sample in sample_texts:
            res = self.analyzer.predict(sample)
            scores_sum = sum(res["scores"].values())
            self.assertAlmostEqual(scores_sum, 1.0, places=3)

    def test_predict_gibberish(self):
        text = "asdfghjkl zxcvbnm"
        res = self.analyzer.predict(text)
        self.assertEqual(res["sentiment"], "unknown")

if __name__ == "__main__":
    unittest.main()
