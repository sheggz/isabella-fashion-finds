"""Logging setup: one place that decides how every log line looks and what it carries.

Design in one paragraph: each module logs through `logging.getLogger(__name__)`; a single
handler on the ROOT logger formats everything (readable text in development, one JSON object
per line in production); a filter stamps every line with the current request id; and one
middleware writes a single access line per request.

Named `log.py` (not `logging.py`) so it can never be confused with the standard library.
"""
import json
import logging
import sys
from contextvars import ContextVar
from datetime import datetime, timezone

# The id of the request currently being handled. A ContextVar (not a global) keeps concurrent
# requests apart: each request task/thread sees its own value, so log lines written deep in
# the code get the right id without anyone passing it down through every function.
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

TEXT_FORMAT = "%(asctime)s %(levelname)-7s [%(request_id)s] %(name)s: %(message)s"

# Fields an access-log call may attach via `extra=`; copied into the JSON output when present.
_EXTRA_FIELDS = ("method", "path", "status", "duration_ms")

# Substrings that mark a key as sensitive (matched case-insensitively).
_SENSITIVE = (
    "password", "secret", "token", "authorization", "cookie",
    "api_key", "apikey", "service_key", "private_key", "session",
)


def redact(value):
    """Return a copy of `value` with sensitive-looking dictionary entries replaced by '***'.

    Pure: the input is never modified. Use it before logging any dict that came from a request,
    a webhook or a vendor response. It only inspects KEYS; it cannot spot a secret inside free
    text, so the real rule remains "do not log secrets, cookies, bodies or query strings".
    """
    if isinstance(value, dict):
        return {
            k: "***" if any(s in str(k).lower() for s in _SENSITIVE) else redact(v)
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [redact(item) for item in value]
    return value


class RequestIdFilter(logging.Filter):
    """Stamp each record with the current request id so the formatters can print it.

    An id passed explicitly (`extra={"request_id": ...}`) wins over the context value. That
    matters for the unhandled-error handler, which Starlette runs OUTSIDE our middleware,
    after the context value has already been reset.

    The filter is attached to our HANDLER, not to a logger: logger-level filters are skipped
    for records coming from child loggers, handler-level filters see everything.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = getattr(record, "request_id", None) or request_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    """One JSON object per line: easy for log platforms to index and search."""

    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
        }
        for field in _EXTRA_FIELDS:
            if hasattr(record, field):
                entry[field] = getattr(record, field)
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


def configure_logging(level: str = "INFO", json_format: bool = False, stream=None) -> None:
    """Install our handler on the root logger. Safe to call repeatedly.

    Idempotent on purpose: `create_app()` runs once per test, and Alembic/uvicorn may also
    trigger it, so we replace our own previous handler (marked `isabella_handler`) instead of adding
    another, which would print every line twice. Handlers we did not install (pytest's
    `caplog`, for example) are left alone.

    Uvicorn's own access log is turned down to WARNING because we write our own: it would
    duplicate every request and it prints the full URL including the query string, which on
    the OAuth callback contains Google's one-time `code`.

    `httpx`/`httpcore` get the same treatment. They log the full URL of every outgoing request
    at INFO, and the URLs we call (Google now, Flutterwave and Mailgun later) can carry tokens
    or identifiers in the query string. A failing outgoing call is still logged by our own
    adapters, with the detail we choose.
    """
    root = logging.getLogger()
    for handler in list(root.handlers):
        if getattr(handler, "isabella_handler", False):
            root.removeHandler(handler)

    handler = logging.StreamHandler(stream or sys.stderr)
    handler.isabella_handler = True  # marker so we can find and replace it next time
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(JsonFormatter() if json_format else logging.Formatter(TEXT_FORMAT))
    root.addHandler(handler)
    root.setLevel(level.upper())

    for noisy in ("uvicorn.access", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
