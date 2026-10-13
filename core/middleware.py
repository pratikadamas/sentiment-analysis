"""
HTTP Middleware for Sentiment Pulse.
Injects correlation request IDs (X-Request-ID) and measures response execution time (X-Process-Time).
"""

import time
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from core.logging import request_id_ctx, get_logger

logger = get_logger(__name__)


class RequestContextMiddleware(BaseHTTPMiddleware):
    """
    Middleware that attaches a unique X-Request-ID and tracks request duration.
    """
    async def dispatch(self, request: Request, call_next):
        req_id = request.headers.get("X-Request-ID")
        if not req_id:
            req_id = str(uuid.uuid4())

        token = request_id_ctx.set(req_id)
        start_time = time.perf_counter()

        try:
            response: Response = await call_next(request)
            process_time = (time.perf_counter() - start_time) * 1000  # ms
            response.headers["X-Request-ID"] = req_id
            response.headers["X-Process-Time"] = f"{process_time:.2f}ms"
            return response
        except Exception as exc:
            process_time = (time.perf_counter() - start_time) * 1000
            logger.error(f"Unhandled exception processing {request.method} {request.url.path}: {exc}", exc_info=True)
            raise
        finally:
            request_id_ctx.reset(token)
