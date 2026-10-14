"""
Core security utilities and in-memory rate limiting for Sentiment Pulse.
"""

import time
from typing import Dict, Tuple
from collections import defaultdict
from fastapi import Request

from core.config import settings
from core.logging import get_logger

logger = get_logger(__name__)


# ==========================================
# In-Memory Rate Limiter
# ==========================================

class SimpleRateLimiter:
    """
    In-memory sliding-window rate limiter keyed by client IP and action.
    Suitable for single-instance web service (Render web service).
    """
    def __init__(self):
        # Store dict: (action, ip) -> list of timestamp floats
        self._history: Dict[Tuple[str, str], list] = defaultdict(list)

    def reset(self):
        self._history.clear()

    def check_rate_limit(self, action: str, client_ip: str, max_requests: int, window_seconds: int) -> bool:
        if not settings.RATE_LIMIT_ENABLED:
            return True

        now = time.time()
        key = (action, client_ip)
        # Purge timestamps outside window
        cutoff = now - window_seconds
        self._history[key] = [ts for ts in self._history[key] if ts > cutoff]

        if len(self._history[key]) >= max_requests:
            return False

        self._history[key].append(now)
        return True


rate_limiter = SimpleRateLimiter()


def get_client_ip(request: Request) -> str:
    """Extract real client IP considering forward headers."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"
