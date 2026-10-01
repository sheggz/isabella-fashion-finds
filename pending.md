# Pending work and known gaps

Last updated: 2026-10-01. Context: **close deadline, solo developer, also here to learn.** Update this file whenever something is finished or discovered.

## Where we are

| Done | Notes |
|---|---|
| M0 Scaffold | Monorepo, rules (AGENTS.md), ADRs, CI workflow, error contract, middleware |
| M1a Database + catalogue API | Supabase Postgres via SQLAlchemy + Alembic, RLS on, product CRUD |
| M2 Google sign-in | Sessions, roles. **Browser login confirmed working by the developer** |
| Logging system | Structured logs, request ids, no query-string/URL leaks |

Tests: 106 backend, 5 frontend. Lint clean.

## What the brief still needs (priority order for the deadline)

### Must have (the store is not usable without these)
- [ ] **Product images** (M1b): Supabase Storage bucket `product-images`, owner-only upload, type/size validation, write `product_images` rows, return image URLs in `ProductOut`.
- [ ] **Storefront pages (frontend):** product list, product detail (with the optional description), sign-in state in a header. *The frontend currently has only a sign-in banner.*
- [ ] **Owner dashboard (frontend):** create/edit/delete product, set sizes and stock, upload photos, write description.
- [ ] **Cart** (server-side, per user) + **order history**: tables, endpoints, UI.
- [ ] **Checkout + Flutterwave** (M5): create pending order, start payment with a unique `tx_ref`, webhook with signature check, **server-side transaction verification**, idempotent "mark paid", stock decrement in one transaction. Needs a payment-flow ADR (0008).
- [ ] **Mailgun payment email** (M6): send after payment confirmation as a background task; failure must never fail a paid order.
- [ ] **Deployment:** pick hosts (frontend static, backend), set production env vars, `APP_ENV=production`, add the production redirect URI in Google Cloud, `FRONTEND_URL`/`BACKEND_URL`/`CORS_ORIGINS`, run migrations on deploy, health-check path `/health`.

### Should have
- [ ] **Scheduled discounts** (M3): `discounts` table (starts_at/ends_at, percent or amount, scope all/product), owner endpoints, **pure** price function (ADR 0005), discounted price shown in the catalogue "when it goes live", price snapshot on the order.
- [ ] **Reviews and ratings** (M7): only users with a paid order containing the product; one review per user per product; average rating on the product.
- [ ] **Delivery address** captured at checkout (NGN only, no shipping calculation, per earlier decision).

### Could have
- [ ] Owner promotion endpoint (promote another user to owner; `OWNER_EMAILS` only bootstraps).
- [ ] Pagination metadata (total count), product search/filter/category.
- [ ] Order status workflow for the owner (paid, packed, shipped), owner sales view.

## Known gaps in what is already built
- [ ] **`IntegrityError` races return a generic 500**, not 409 (two simultaneous inserts of the same size/user). Add a handler and a test.
- [ ] **No rate limiting** on `/auth/*` or write endpoints.
- [ ] **CSRF:** relies on `SameSite=Lax` + CORS allowlist (ADR 0002). Revisit if the frontend and API end up on different registrable domains in production (cookies would need `SameSite=None`, plus explicit CSRF tokens).
- [ ] **Tests run on SQLite**; only manual checks touched real Postgres. Add a small Postgres integration suite (e.g. a separate schema or Supabase branch) for constraints, RLS and concurrency.
- [ ] **CI has never run** (no git remote yet). Create the GitHub repo, push, confirm the workflow passes.
- [ ] **Frontend is barely tested:** only the API-error helper. UI glue has no tests; no end-to-end test.
- [ ] **No session revocation** (logout only clears the cookie; a copied cookie stays valid until its 7-day expiry).
- [ ] **No seed script** for demo products.
- [ ] `get_engine` is never disposed on shutdown (fine now; use a FastAPI `lifespan` if needed).
- [ ] Mailgun **sandbox only emails pre-authorised recipients**; a verified domain is needed before real customers get emails.
- [ ] Flutterwave is test-mode only until the business account is verified for live keys.
- [ ] Logging: business events (order paid, email sent) not logged yet; no log shipping/alerting; `redact()` only masks by key name.
- [ ] README does not yet describe auth/env setup in detail (Google console steps, Supabase connection string).
- [ ] ADRs still to write: payment flow (0008), image storage, cart/order data model.

## Decisions still open
- Hosting providers for frontend and backend.
- Product model details: categories? multiple images per product (yes, table exists), size set per product vs fixed list.
- Whether guests can browse the cart before signing in (current assumption: must be signed in to cart).
- What the internship brief expects as deliverables (live URL, repo, demo, write-up): not yet known.

## Learning checklist (the "also here to learn" part)
Covered so far: layering, error handling at boundaries, middleware vs dependencies, ADRs, migrations, OAuth flow, cookies/sessions, logging and context variables, ES modules/Vite basics, TDD and pure functions.
Coming up: file uploads and object storage, transactions and concurrency (stock/payments), webhooks and idempotency, background tasks, frontend routing and state in plain JS, deployment and environment config.

## Working notes
Detailed write-ups per milestone live in `.notes/` (private, git-ignored).
