# AGENTS.md: Isabella Fashion Finds

Online store for a fashion brand. The owner manages a catalogue; customers sign in with Google, browse, cart, pay, and review. Delivered on a short deadline, but built to be extended: keep the structure clean even when moving fast.

## Stack
- **Backend:** Python, FastAPI (`backend/`)
- **Frontend:** plain JavaScript (ES modules) + Vite + Vitest, no framework yet (`frontend/`)
- **Persistence/storage:** Supabase as managed Postgres + Storage. Data API and Supabase Auth are NOT used. FastAPI reaches Postgres directly via SQLAlchemy 2.x (psycopg) with Alembic migrations (`backend/alembic/`); every table enables RLS with no policies. The service key stays server-side and is only for Storage.
- **Auth:** FastAPI handles Google OAuth itself; session is a signed httpOnly cookie. Roles: `customer`, `owner` (bootstrapped from `OWNER_EMAILS`).
- **Payments:** Flutterwave (NGN only). **Email:** Mailgun.
- Monorepo: backend, frontend, docs, and DB migrations live together.

## Coding rules
1. **Pure functions first.** Business logic (pricing, discounts, order totals, stock checks) must be pure: same input gives the same output, no I/O, no clock or randomness read inside (pass `now`, ids in as arguments), no mutation of arguments.
2. **Test-driven development.** Write a failing test, then the minimum code to pass, then refactor. Tests pass before a change is done.
3. **Layering (nothing points upward):** `routers -> services -> repositories / integrations`.
   - `routers/`: HTTP only (parse/validate in, serialize out). No business logic.
   - `services/`: business logic; raises domain errors; knows nothing about HTTP.
   - `repositories/`: all database access. `integrations/`: Flutterwave, Mailgun, Google, Storage adapters.
4. **Errors are handled at boundaries.** Inner code raises domain errors (`app/core/errors.py`), never HTTP codes or vendor exceptions. Adapters catch vendor errors/timeouts and translate them. Global handlers map errors to one response shape. Never leak stack traces, SQL or secrets.
5. **Validate at every boundary** (Pydantic on the backend, explicit checks in the browser). Never trust client input or stored data. Prices are always computed server-side.

6. **Explain the non-obvious in docstrings.** When code depends on a subtlety a reader wouldn't spot (implicit behaviour, framework or language quirks, import-time vs call-time effects, ordering that matters, a deliberate trade-off, a security reason), say what is going on and why in the function's docstring. Examples: why a function is cached, why a call only works inside an `except` block, why a cookie is `SameSite=Lax`. Don't narrate obvious lines. Explain the *why*, in plain language, for a reader new to the code and to Python/JavaScript. In JavaScript use a JSDoc block above the function.

## Logging rules
- Every module logs through `logger = logging.getLogger(__name__)`. Never `print`, never configure handlers outside `app/core/log.py`.
- The request id is attached to every line automatically (ContextVar); do not pass it by hand. Exception: code that runs outside the middleware (the unhandled-error handler) passes `extra={"request_id": ...}`.
- Levels: `ERROR` = unexpected failure someone must look at (always with `exc_info`); `WARNING` = handled but abnormal (a vendor call failed and was translated into our error); `INFO` = the access line and business events (order paid, email sent); `DEBUG` = development detail only.
- **Never log:** passwords, secrets or keys, tokens, session cookies, `Authorization` headers, request/response bodies, or query strings (the OAuth callback carries a one-time `code`). Run any dict from a request, webhook or vendor response through `redact()` first. `redact` only masks by key name, so it does not replace the rule.
- Log the exception object explicitly (`exc_info=exc`), not via an implicit `except` context.
- Format: readable text in development, one JSON object per line in production (`LOG_FORMAT=auto|text|json`, `LOG_LEVEL`).

## Error response contract
```json
{ "error": { "code": "out_of_stock", "message": "Size M is sold out", "details": null, "request_id": "..." } }
```
Every response carries an `X-Request-ID` header.

## Commands
- Backend tests: `cd backend && uv run pytest`
- Backend lint: `cd backend && uv run ruff check .`
- New migration: `cd backend && uv run alembic revision --autogenerate -m "message"` (then review it and add RLS for new tables by hand)
- Apply migrations: `cd backend && uv run alembic upgrade head`
- Run API: `cd backend && uv run uvicorn app.main:app --reload`
- Frontend tests: `cd frontend && npm test`
- Run frontend: `cd frontend && npm run dev`

## Conventions
- Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Record significant decisions as ADRs in `docs/adr/` (one per decision; never edit history, supersede instead).
- Secrets only in `.env` (git-ignored); keep `.env.example` current.
- Money is stored as integer kobo, never floats.
