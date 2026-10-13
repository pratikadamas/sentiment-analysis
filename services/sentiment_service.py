"""
Production Sentiment Service wrapping ONNX Runtime inference engine.
Provides singleton lifecycle management, latency benchmarking, warmup, and inference safety.
"""

import time
from typing import Dict, Any, Optional
from core.config import settings
from core.logging import get_logger
from model import SentimentAnalyzer

logger = get_logger(__name__)


class SentimentService:
    _instance: Optional["SentimentService"] = None

    def __init__(self):
        self.analyzer: Optional[SentimentAnalyzer] = None
        self.benchmark_latency_ms: Optional[float] = None
        self._initialize()

    def _initialize(self):
        try:
            logger.info("Initializing SentimentAnalyzer singleton...")
            self.analyzer = SentimentAnalyzer(
                model_file=settings.MODEL_PATH,
                tokenizer_file=settings.TOKENIZER_PATH
            )
            self.warmup_and_benchmark()
            logger.info("SentimentService initialized and benchmarked successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize SentimentAnalyzer: {e}", exc_info=True)
            self.analyzer = None

    def is_ready(self) -> bool:
        return self.analyzer is not None and self.analyzer._session is not None

    def warmup_and_benchmark(self, sample_text: str = "This service is running smoothly."):
        """Runs a warmup inference pass and records CPU latency."""
        if not self.analyzer:
            return
        # Warmup pass
        self.analyzer.predict(sample_text)
        
        # Benchmark pass
        latencies = []
        for _ in range(3):
            t0 = time.perf_counter()
            self.analyzer.predict(sample_text)
            latencies.append((time.perf_counter() - t0) * 1000)
        self.benchmark_latency_ms = round(sum(latencies) / len(latencies), 2)
        logger.info(f"Inference benchmark latency: {self.benchmark_latency_ms:.2f} ms")

    def predict(self, text: str) -> Dict[str, Any]:
        """
        Executes sentiment analysis.
        Returns dict with keys: text, sentiment, confidence, scores.
        """
        if not self.analyzer:
            raise RuntimeError("Sentiment model is not initialized or unavailable.")
        return self.analyzer.predict(text)


sentiment_service = SentimentService()
