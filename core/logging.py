"""
Structured logging module for Sentiment Pulse application.
Provides request ID tracking, sensitive parameter sanitization, and log formatters.
"""

import logging
import re
import contextvars
from typing import Optional

request_id_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("request_id", default=None)

# Patterns for sanitizing sensitive data from log records
SENSITIVE_PATTERNS = [
    (re.compile(r"password['\"]\s*:\s*['\"][^'\"]+['\"]", re.IGNORECASE), "password': '***'"),
    (re.compile(r"Bearer\s+[A-Za-z0-9\-._~+/]+=*", re.IGNORECASE), "Bearer ***"),
    (re.compile(r"access_token['\"]\s*:\s*['\"][^'\"]+['\"]", re.IGNORECASE), "access_token': '***'"),
]


class SafeFormatter(logging.Formatter):
    """Logging formatter that injects request ID and sanitizes sensitive credentials."""
    def format(self, record: logging.LogRecord) -> str:
        req_id = request_id_ctx.get()
        record.request_id = f"[{req_id}] " if req_id else ""
        msg = super().format(record)
        for pattern, replacement in SENSITIVE_PATTERNS:
            msg = pattern.sub(replacement, msg)
        return msg


def setup_logging(log_level: str = "INFO"):
    handler = logging.StreamHandler()
    formatter = SafeFormatter(
        fmt="%(asctime)s | %(levelname)-7s | %(request_id)s%(name)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, log_level.upper(), logging.INFO))
    # Replace root handlers
    root_logger.handlers = [handler]


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
