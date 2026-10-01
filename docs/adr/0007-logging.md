# 0007. Structured logging with request correlation

Status: Accepted · Date: 2026-10-01

## Context
Until now modules called `logging.getLogger("app")` but nothing configured logging: INFO messages were dropped, WARNING/ERROR lines had a bare default format, there was no per-request log line, and nothing tied log lines to the `request_id` returned to clients. Payments and OAuth are coming, so we need to be able to answer "what happened to this request?" without leaking secrets.

## Decision
- **One configuration point:** `app/core/log.py`, called from `create_app()`. A single handler on the root logger; each module logs via `logging.getLogger(__name__)`.
- **Format:** readable text in development; one JSON object per line in production (`LOG_FORMAT=auto`).
- **Correlation:** the request id lives in a `ContextVar` set by `RequestIdMiddleware`; a handler-level filter stamps it on every line automatically.
- **Access log:** `AccessLogMiddleware` writes one line per request (method, path, status, duration). Path only, never the query string.
- **Third-party noise/leaks:** `uvicorn.access`, `httpx` and `httpcore` are set to WARNING because they log full URLs (query strings included).
- **Redaction:** a pure `redact()` masks sensitive keys in dicts; written rules in `AGENTS.md` define what must never be logged.
- Unexpected errors are logged with an explicit `exc_info=exc` and the request id passed via `extra`, because Starlette runs that handler outside our middleware.

## Alternatives considered
- **`structlog` / `loguru`:** richer, but another dependency and new concepts for a small app. The stdlib covers our needs and the JSON shape can be reproduced if we migrate.
- **Passing the request id through every function:** noisy and easy to forget; a ContextVar does it implicitly.
- **Keeping uvicorn's access log:** it would duplicate ours and prints query strings.

## Consequences
- (+) Every line is traceable to a request; production logs are machine-searchable; known secret leaks (query strings, httpx URLs) are closed and tested.
- (-) Logging is global state, so tests call `configure_logging()` to reset it. `redact()` only inspects keys. No log shipping, metrics or tracing yet (add when deploying: ship stdout JSON to the host's log service).
