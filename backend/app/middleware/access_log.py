import logging
import time

from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger("app.access")


class AccessLogMiddleware(BaseHTTPMiddleware):
    """Write exactly one line per request: method, path, status and how long it took.

    Two deliberate choices:
    - Only `request.url.path` is logged, never the query string. The OAuth callback URL carries
      Google's one-time `code` and our `state`, and query strings often hold tokens.
    - If the request crashes, the exception passes through here BEFORE Starlette turns it into
      a 500 response, so we record it as 500 ourselves and re-raise it untouched.

    It must sit INSIDE RequestIdMiddleware (added before it in main.py) so the request id is
    already set when the line is written.
    """

    async def dispatch(self, request, call_next):
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            self._log(request, 500, start)
            raise
        self._log(request, response.status_code, start)
        return response

    @staticmethod
    def _log(request, status: int, start: float) -> None:
        duration_ms = round((time.perf_counter() - start) * 1000, 1)
        path = request.url.path
        logger.info(
            "%s %s %s %.1fms",
            request.method,
            path,
            status,
            duration_ms,
            extra={"method": request.method, "path": path, "status": status, "duration_ms": duration_ms},
        )
