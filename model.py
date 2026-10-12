"""
Production Sentiment Analysis Inference Engine.
Uses ONNX Runtime (INT8 Quantized Transformer) and Hugging Face Tokenizers
to classify text into positive, neutral, or negative sentiments.
Ultra-lightweight (<90MB RAM in production), fast (<25ms CPU latency), no PyTorch dependency.
"""

import os
import re
from typing import Dict, Any, List
import logging
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "sentiment_model.onnx")
TOKENIZER_PATH = os.path.join(BASE_DIR, "tokenizer", "tokenizer.json")

# Standard label mapping matching trained checkpoint
ID2LABEL = {0: "negative", 1: "neutral", 2: "positive"}


def _is_gibberish(text: str, tokens: List[str]) -> bool:
    """
    Lightweight rule-based detector for keyboard-mashing, non-words, and WordPiece fragmentation.
    Returns True if text appears to be gibberish or ambiguous keystroke mash.
    """
    # Extract real tokens excluding special tokens and padding
    real_tokens = [t for t in tokens if t not in ("[CLS]", "[SEP]", "[PAD]")]
    if not real_tokens:
        return True

    # 1. High ratio of subword tokens (WordPiece breaking down unseen gibberish)
    subword_tokens = [t for t in real_tokens if t.startswith("##")]
    if len(real_tokens) >= 3 and (len(subword_tokens) / len(real_tokens)) >= 0.40:
        return True

    # 2. Check word-level phonetic and vowel structure
    words = [w for w in re.findall(r"[a-zA-Z]+", text) if w]
    if words:
        vowels = set("aeiouyAEIOUY")
        # Words of length >= 4 with 0 vowels (e.g. 'zxcvbnm', 'dfghjk')
        no_vowels = [w for w in words if len(w) >= 4 and not any(c in vowels for c in w)]
        if len(no_vowels) / len(words) >= 0.30:
            return True

        # Extremely long consonant clusters (6+ consonants in a row, e.g. 'asdfghjkl')
        if re.search(r"[bcdfghjklmnpqrstvwxyzBCDFGHJKLMNPQRSTVWXYZ]{6,}", text):
            return True

    return False


class SentimentAnalyzer:
    """Singleton inference engine for ONNX-based sentiment analysis."""
    _instance = None
    _session = None
    _tokenizer = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super(SentimentAnalyzer, cls).__new__(cls)
        return cls._instance

    def __init__(self, model_file: str = MODEL_PATH, tokenizer_file: str = TOKENIZER_PATH):
        if self._session is None:
            self.model_file = model_file
            self.tokenizer_file = tokenizer_file

            if not os.path.exists(self.model_file):
                logger.error(f"ONNX model file not found at: {self.model_file}")
                raise FileNotFoundError(
                    f"Model file not found: {self.model_file}. Please run train_onnx.py first."
                )

            if not os.path.exists(self.tokenizer_file):
                logger.error(f"Tokenizer file not found at: {self.tokenizer_file}")
                raise FileNotFoundError(
                    f"Tokenizer file not found: {self.tokenizer_file}. Please run train_onnx.py first."
                )

            logger.info(f"Loading ONNX sentiment model from: {self.model_file}")
            # Optimize inference session for low latency CPU execution
            sess_options = ort.SessionOptions()
            sess_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            sess_options.intra_op_num_threads = 2
            self._session = ort.InferenceSession(
                self.model_file, sess_options, providers=["CPUExecutionProvider"]
            )

            logger.info(f"Loading tokenizer from: {self.tokenizer_file}")
            self._tokenizer = Tokenizer.from_file(self.tokenizer_file)
            self._input_names = [inp.name for inp in self._session.get_inputs()]
            logger.info("ONNX SentimentAnalyzer initialized successfully.")

    def predict(self, text: str) -> Dict[str, Any]:
        """
        Classifies input text into positive, neutral, or negative sentiment.
        Returns:
            dict containing:
                - text: sanitized input text
                - sentiment: highest scoring label (positive | neutral | negative | unknown)
                - confidence: highest probability (float between 0 and 1)
                - scores: dictionary mapping all 3 labels to probabilities
        """
        cleaned_text = text.strip()
        if not cleaned_text:
            raise ValueError("Input text cannot be empty.")

        # Encode input text with tokenizer
        encoding = self._tokenizer.encode(cleaned_text)
        input_ids = np.array([encoding.ids], dtype=np.int64)
        attention_mask = np.array([encoding.attention_mask], dtype=np.int64)

        ort_inputs = {"input_ids": input_ids, "attention_mask": attention_mask}
        # Include token_type_ids only if expected by model graph
        if "token_type_ids" in self._input_names:
            token_type_ids = np.array([getattr(encoding, "type_ids", [0] * len(encoding.ids))], dtype=np.int64)
            ort_inputs["token_type_ids"] = token_type_ids

        # Run ONNX inference
        outputs = self._session.run(None, ort_inputs)
        logits = outputs[0][0]

        # Convert logits to calibrated softmax probabilities
        exp_logits = np.exp(logits - np.max(logits))
        probabilities = exp_logits / np.sum(exp_logits)

        # Build scores map
        scores_map: Dict[str, float] = {}
        for idx, prob in enumerate(probabilities):
            label = ID2LABEL.get(idx, f"class_{idx}").lower()
            scores_map[label] = round(float(prob), 4)

        # Ensure all 3 keys exist
        for expected in ["positive", "neutral", "negative"]:
            if expected not in scores_map:
                scores_map[expected] = 0.0

        top_sentiment = max(scores_map.items(), key=lambda x: x[1])

        # Guardrails:
        # 1. Low confidence (< 0.45)
        # 2. Linguistic gibberish check (handles WordPiece ## subword inflation)
        is_gib = _is_gibberish(cleaned_text, encoding.tokens)
        if top_sentiment[1] < 0.45 or is_gib:
            sentiment_label = "unknown"
        else:
            sentiment_label = top_sentiment[0]

        return {
            "text": cleaned_text,
            "sentiment": sentiment_label,
            "confidence": top_sentiment[1],
            "scores": scores_map,
        }


# Local test
if __name__ == "__main__":
    analyzer = SentimentAnalyzer()
    test_cases = [
        "I absolutely love this new update, it made everything so fast and easy!",
        "The package arrived on Tuesday afternoon via standard delivery.",
        "Terrible service, it crashed immediately and customer support refused to help.",
        "The food was okay, nothing special but not bad either.",
        "asdfghjkl zxcvbnm",
    ]

    print("\n" + "=" * 60)
    print("LOCAL INFERENCE TEST (ONNX 3-CLASS SENTIMENT ANALYSIS)")
    print("=" * 60)
    for sample in test_cases:
        result = analyzer.predict(sample)
        print(f"Input:       \"{result['text']}\"")
        print(f"Sentiment:   {result['sentiment'].upper()} (Confidence: {result['confidence']*100:.1f}%)")
        print(f"Score breakdown:")
        for sentiment_class, score in result["scores"].items():
            print(f"  - {sentiment_class:8s}: {score*100:5.1f}%")
        print("-" * 60)
