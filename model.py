"""
Production Sentiment Analysis Inference Engine.
Uses Scikit-learn (TF-IDF + Calibrated Logistic Regression)
to classify text into positive, neutral, or negative sentiments.
Ultra-lightweight (<40MB RAM), fast (<5ms latency), ideal for Render free tier.
"""

import os
from typing import Dict, Any
import logging
import joblib

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "sentiment_model.joblib")

class SentimentAnalyzer:
    _instance = None
    _pipeline = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(SentimentAnalyzer, cls).__new__(cls)
        return cls._instance

    def __init__(self, model_file: str = MODEL_PATH):
        if self._pipeline is None:
            self.model_file = model_file
            if not os.path.exists(self.model_file):
                logger.info("Model file not found. Triggering automated model generation...")
                from train_model import build_and_train_model
                build_and_train_model()
            
            logger.info(f"Loading sentiment model from: {self.model_file}")
            self._pipeline = joblib.load(self.model_file)
            logger.info("Sentiment model loaded successfully.")

    def predict(self, text: str) -> Dict[str, Any]:
        """
        Classifies input text into positive, neutral, or negative sentiment.
        Returns:
            dict containing:
                - text: sanitized input text
                - sentiment: highest scoring label (positive | neutral | negative)
                - confidence: highest probability (float between 0 and 1)
                - scores: dictionary mapping all 3 labels to probabilities
        """
        cleaned_text = text.strip()
        if not cleaned_text:
            raise ValueError("Input text cannot be empty.")

        # Predict class probabilities
        classes = list(self._pipeline.classes_)
        probabilities = self._pipeline.predict_proba([cleaned_text])[0]

        scores_map: Dict[str, float] = {}
        for label, prob in zip(classes, probabilities):
            scores_map[label.lower()] = round(float(prob), 4)

        # Ensure all 3 keys exist even if model had an edge case
        for expected in ["positive", "neutral", "negative"]:
            if expected not in scores_map:
                scores_map[expected] = 0.0

        top_sentiment = max(scores_map.items(), key=lambda x: x[1])

        return {
            "text": cleaned_text,
            "sentiment": top_sentiment[0],
            "confidence": top_sentiment[1],
            "scores": scores_map
        }


# Local test
if __name__ == "__main__":
    analyzer = SentimentAnalyzer()
    test_cases = [
        "I absolutely love this new update, it made everything so fast and easy!",
        "The package arrived on Tuesday afternoon via standard delivery.",
        "Terrible service, it crashed immediately and customer support refused to help."
    ]

    print("\n" + "="*60)
    print("LOCAL INFERENCE TEST (3-CLASS SENTIMENT ANALYSIS)")
    print("="*60)
    for sample in test_cases:
        result = analyzer.predict(sample)
        print(f"Input:       \"{result['text']}\"")
        print(f"Sentiment:   {result['sentiment'].upper()} (Confidence: {result['confidence']*100:.1f}%)")
        print(f"Score breakdown:")
        for sentiment_class, score in result["scores"].items():
            print(f"  - {sentiment_class:8s}: {score*100:5.1f}%")
        print("-" * 60)
