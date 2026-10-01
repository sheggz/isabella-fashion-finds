# 0004. One error response shape, handled at boundaries

Status: Accepted · Date: 2026-10-01

## Context
Errors can arise from validation, business rules, the database, and third parties (Flutterwave, Mailgun, Google). Clients need one predictable shape, and users must never see internals.

## Decision
- Inner code raises domain errors (`app/core/errors.py`); it never returns HTTP codes or leaks vendor exceptions.
- Global handlers translate everything into:
  `{"error": {"code", "message", "details", "request_id"}}` with the right HTTP status.
- Unknown exceptions become a generic 500; the detail is logged with the request id only.
- Every response carries `X-Request-ID` (middleware).
- Third-party adapters catch vendor errors/timeouts and decide policy. For example, a failed email must never fail a paid order.
- The frontend normalises all failures (including network failures) into the same shape in `src/api/apiError.js`.

## Alternatives considered
- Per-route try/except: inconsistent shapes, duplicated code, easy to leak internals.
- RFC 7807 "problem+json": a good standard, but heavier than needed now; the shape can be migrated later.

## Consequences
- (+) Predictable client handling; safe by default; traceable via request id.
- (-) Every new failure mode needs a domain error type and a test.
