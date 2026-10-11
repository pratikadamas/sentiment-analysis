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
        text = "The report was submitted on Tuesday afternoon."
        res = self.analyzer.predict(text)
        self.assertEqual(res["sentiment"], "neutral")

    def test_empty_string_raises(self):
        with self.assertRaises(ValueError):
            self.analyzer.predict("   ")

if __name__ == "__main__":
    unittest.main()
