# Pending work and roadmap

Last updated: 2026-10-01 (after M4). Context: **close deadline, solo developer, also here to learn.** Update this file whenever something is finished or discovered.

## How we work through the milestones
- Every milestone is a **vertical slice**: backend + frontend + tests + docs, finishing with something you can click through. Nothing "backend only" is left waiting for a UI.
- Inside each milestone: tests first (TDD), pure logic separated from side effects, commit as each step finishes, then a write-up in `.notes/` and an ADR for any significant decision.
- If time runs short, **cut from the bottom** (M7 reviews first). Every milestone leaves a working, demoable store.

## Status

| Milestone | State | Notes |
|---|---|---|
| M0 Scaffold | Done | Monorepo, rules, ADRs, CI workflow, error contract, middleware |
| M1a Database + catalogue API | Done | Supabase Postgres, Alembic, RLS, product CRUD (backend only) |
| M2 Google sign-in | Done | Sessions, roles. **Browser login confirmed working by the developer** |
| Logging system | Done | Structured logs, request ids, no URL/query-string leaks |
| M1b Images + storefront + owner dashboard | **Built and tested; needs your browser click-through** | Backend verified live as owner; UI verified in jsdom only |
| M3 Discounts + per-size pricing | **Built and tested; needs your browser click-through** | Backend verified live (real DB), pages in jsdom against the real API |
| D1 Deploy checkpoint | **Postponed by decision** | Hosting to be chosen later |
| M4 Cart + order history | **Built and tested; needs your browser click-through** | Backend verified live; shopper pages verified in jsdom against the real API |
| **M5 Checkout + Flutterwave** | **Next** | Needs Flutterwave test keys (and Mailgun for M6) |
| M6 Mailgun emails | Planned | |
| M7 Reviews and ratings | Planned | |
| M8 Hardening + final deploy | Planned | |

Tests today: 417 backend, 299 frontend. Backend lint clean; no frontend linter yet.

## Frontend conventions (apply from M1b onward)
Plain JavaScript (ES modules) + Vite + Vitest, no framework yet. Layout under `frontend/src/`:
- `api/`: the only code that calls the backend (`client.js`, one module per resource, e.g. `products.js`).
- `lib/`: **pure** helpers, unit-tested (money formatting from kobo, cart totals, price display, form validation).
- `state/`: small stores (current user, cart) with pure update functions; side effects at the edges.
- `pages/`: one module per screen, rendering into the page; `components/`: reusable DOM builders.
- `router.js`: tiny router (History API) mapping paths to pages.
- Safety rules: build DOM with `textContent`/`createElement`, never `innerHTML` with data; every failure shown to the user comes from the normalised error shape; each screen handles loading, empty, error states.

---

## M1b: Images + storefront + owner dashboard (DONE, pending your browser check)
**Delivered:** the owner can sign in, add a piece with description, price, the fixed sizes (each with stock and optional body-part measurements) and up to 8 photos; customers browse a product grid and open a product page with gallery, size picker, measurements and sold-out/low-stock states.

- [x] Supabase Storage bucket + adapter, photo upload/delete/reorder, server-side validation (real file type, 5 MB, 8 photos) (ADR 0009)
- [x] Fixed sizes + per-size measurements, single source of truth via `/catalogue/options` (ADR 0008)
- [x] `IntegrityError` unique races map to 409
- [x] Frontend foundation: router with role guards, session store, header, loading/empty/error states
- [x] Storefront (list, detail) and owner dashboard (list, create/edit, photo manager)
- [x] Verified live as owner against real Postgres + Storage (role checks, full workflow, CORS preflights, cleanup)

**Follow-ups found during M1b**
- [ ] **Click through it in a real browser** (owner and customer). The UI has only been verified in jsdom against mocked and real API data, never rendered in a browser.
- [ ] Editing saves details and sizes in two requests; if the second fails the first is already saved (message is shown). Consider one combined endpoint later.
- [ ] "Make cover" is the only reordering (no drag and drop).
- [ ] Orphaned Storage files after a failed cleanup have no sweeper; deleted photos can stay visible at their old URL for a while (CDN cache).
- [ ] The multipart upload is received in full before the 5 MB check; add a request-size limit at the host/proxy (D1).
- [ ] Admin list has no pagination UI (API supports limit/offset, default 100).
- [ ] No frontend linter/formatter yet (ESLint/Prettier) and no accessibility audit.

## D1: Deploy checkpoint (small, early on purpose)
Deploying late is the biggest risk for a close deadline, so deploy the M1b version first.
- [ ] Choose hosts (frontend static host; backend host such as Render/Railway/Fly). *Decision needed.*
- [ ] Production env vars; `APP_ENV=production`; `FRONTEND_URL`, `BACKEND_URL`, `CORS_ORIGINS`; add the production redirect URI in Google Cloud.
- [ ] Run migrations on deploy; health check on `/health`; confirm Secure cookies and cross-origin cookies work in production (revisit SameSite/CSRF per ADR 0002 if hosts are on different domains).
- [ ] **Single-page-app fallback:** the History API router needs the host to serve `index.html` for unknown paths (e.g. Netlify `/*  /index.html  200`, Vercel `rewrites`), otherwise refreshing `/products/123` gives a 404.
- [ ] **Run the backend in the same region as the database** (Supabase project is in eu-west-1). From a dev machine each database round trip is slow and a request makes several, so calls take seconds; measure after deploying, and reconsider `pool_pre_ping` (one extra round trip per request) if still slow.
- [ ] Request-size limit at the proxy; run `python -m scripts.ensure_bucket` against the production Supabase project.
- [ ] Create the GitHub repo and push so **CI runs for the first time** and the code is backed up.
**Done when:** a public URL shows the catalogue and the owner can sign in there.

## M3: Scheduled discounts + per-size pricing (DONE, pending your browser check)
**Delivered:** the owner chooses, per piece, one price for every size or a different price for each size, and schedules percentage or fixed-amount discounts (every piece or selected pieces) that customers see exactly while they are live.

- [x] Pricing mode per piece (`single` / `per_size`), enforced by schema and database checks (ADR 0010)
- [x] One atomic `PUT /products/{id}` saves details, mode, prices and sizes (also fixes the M1b "two requests on save" follow-up)
- [x] `discounts` + `discount_products` tables, RLS on; owner CRUD under `/admin/discounts`
- [x] Pure pricing rules (`app/domain/pricing.py`): live window, best single discount (no stacking), never below 1 kobo, integer basis points
- [x] Storefront: "From" prices, struck-through original, sale price, -N% badge, size-dependent price, "ends on" note in the shopper's zone
- [x] Owner: pricing-mode controls in the product form; Discounts screen (list with status, create/edit, delete)
- [x] Verified live: sale prices for both modes, scheduled discount invisible until it starts, role checks, DB constraints, cascades, real pages against the real API

**Follow-ups found during M3**
- [ ] **Click through it in a real browser**: create a per-size piece, set a discount a few minutes ahead and watch it appear after a refresh.
- [ ] A customer with a page already open sees a discount only after refreshing (nothing pushes it). Consider a light refresh when the tab regains focus.
- [ ] Both start and end are required; there is no open-ended discount.
- [ ] Discounts do not stack and cannot target individual sizes (by decision; revisit if the owner needs it).
- [ ] **M4/M5 must price through `quote_variant`** (never re-implement pricing) and snapshot the price on the order; checkout should also refuse a zero total.
- [ ] The Discounts list has no pagination or search yet.
- [ ] No sorting or filtering by price on the storefront.

## M4: Cart + order history (DONE, pending your browser check)
**Delivered:** signed-in shoppers add a size to a cart that lives on the server, see it with live prices and notices, change quantities, and see their order history. The owner can set a **limit per order** on each piece.

- [x] `cart_items` + pure cart rules; GET/POST/PATCH/DELETE `/cart` (ADR 0011)
- [x] Owner's optional limit per order per piece (counted across sizes; 1 suits one-of-a-kind finds)
- [x] Live re-pricing through the shared pricing rules, price-change notices, problem lines excluded from the subtotal (hidden piece, stock dropped, lowered limit)
- [x] `orders` + `order_items` snapshots (RLS on); read-only `/orders` history, other shoppers' orders reported as not found
- [x] Frontend: add-to-cart on the product page, cart page, order history page, cart count in the header, sign-in page for members-only routes, "limit per order" field in the owner form
- [x] Verified live: limits and stock conflicts, per-shopper isolation, sale starting while an item sits in the cart, cascade when a size is removed, snapshots surviving product deletion; the real shopper journey through the actual pages against the real API

**Follow-ups found during M4**
- [ ] **Click through it in a real browser** as a customer: sign in, add, change quantities, hit the limit, watch a sale change a price.
- [ ] After signing in the shopper lands on the home page, not the product they were viewing. Needs a safe "return to" path (validated same-site, never a free redirect).
- [ ] The header cart count updates in the current tab only (no cross-tab sync).
- [ ] No order detail page yet (the API has `GET /orders/{id}`).
- [ ] Stock is deliberately not held by the cart: two shoppers can hold the last item; checkout must re-check (M5).
- [ ] Order lines keep a photo path, not the photo: if the owner later deletes that photo from Storage the history image will be broken.

## M5: Checkout + Flutterwave
**Goal:** a customer pays and the order becomes paid exactly once.
**Backend**
- [ ] Delivery address capture (NGN only, no shipping calculation); add the address and payment columns (tx_ref, paid_at handling) to `orders` with a migration.
- [ ] **Re-check everything at checkout** through `cart_totals`/`quote_variant`: stock, per-order limits, hidden pieces, prices; refuse a zero total; build the order lines as snapshots (`order_items`).
- [ ] Create `pending` order from the cart; start Flutterwave payment with a unique `tx_ref`; return the payment link.
- [ ] Webhook: **verify signature header**, **verify the transaction server-side with Flutterwave**, mark paid **idempotently**, decrement stock in **one database transaction**, clear the cart. Never trust the redirect alone.
- [ ] Flutterwave adapter in `integrations/flutterwave.py` (timeouts, errors translated); ADR 0012 (payment flow).
**Frontend**
- [ ] Checkout page (address form, order summary, pay button) that redirects to Flutterwave.
- [ ] Return page that reads the order status from the backend (poll briefly while the webhook lands), with success, failed and "still processing" states.
**Done when:** a test-mode payment marks the order paid, reduces stock and shows in order history; replaying the webhook changes nothing.

## M6: Mailgun payment emails
**Goal:** customers get a confirmation email after paying.
- [ ] Mailgun adapter in `integrations/mailgun.py`; template as a **pure** function (order data in, subject/body out; tested).
- [ ] Sent as a background task after payment confirmation; **a failed email never fails a paid order** (log a warning, record "email not sent" for retry).
- [ ] Optional: owner notification email.
- [ ] Frontend: confirmation screen mentions the email; nothing else needed.
**Caveat:** the Mailgun sandbox only emails pre-authorised recipients; a verified domain is needed for real customers.
**Done when:** a test payment sends an email to an authorised address, and a simulated Mailgun outage leaves the order paid.

## M7: Reviews and ratings
**Goal:** customers who bought a piece can rate and review it.
**Backend**
- [ ] `reviews` table (rating 1-5, text optional, one per user per product) + migration with RLS.
- [ ] Rule: only users with a **paid** order containing the product may review (pure eligibility function + tests); average rating and count on `ProductOut`.
**Frontend**
- [ ] Product page: reviews list, average stars, review form shown only when eligible; star display helpers in `lib/` (pure).
**Done when:** an eligible buyer can post a review and everyone sees it; an ineligible user gets a clear message.

## M8: Hardening + final deploy
- [ ] Rate limiting on `/auth/*` and write endpoints.
- [ ] Postgres integration test suite (constraints, RLS, concurrent stock decrement), since current tests run on SQLite.
- [ ] Frontend end-to-end smoke test; accessibility pass (labels, focus, keyboard); mobile layout check.
- [ ] Seed script with demo products; README with full setup (Google console, Supabase connection string, env vars).
- [ ] Final production checks: secrets rotated, Flutterwave live keys (if the business account is verified), Mailgun domain verified, error alerting on ERROR-level logs.

---

## Cross-cutting items and where they get fixed
| Item | Fixed in |
|---|---|
| CI has never run (no git remote) | D1 |
| CSRF relies on SameSite=Lax + CORS (ADR 0002); revisit if hosts differ | D1 / M8 |
| No rate limiting | M8 |
| Tests run on SQLite only | M8 |
| No session revocation (copied cookie valid until 7-day expiry) | later, if time allows |
| `get_engine` never disposed on shutdown | later (FastAPI `lifespan`) |
| Business events not logged yet (order paid, email sent); no log shipping/alerting | M5, M6, M8 |
| Owner promotion endpoint (`OWNER_EMAILS` only bootstraps) | after M7, if time allows |
| Pagination metadata, search/filter, order status workflow for the owner | optional extras |
| Flutterwave live keys need a verified business account | M8 |

## Decisions still open
- Hosting providers for frontend and backend (needed at D1).
- Product details: categories? fixed size list vs free-form sizes.
- Whether guests can browse before signing in (current assumption: must sign in to use the cart).
- What the internship brief expects as deliverables (live URL, repo, demo, write-up).

## Learning checklist (the "also here to learn" part)
Covered: layering, error handling at boundaries, middleware vs dependencies, ADRs, migrations, OAuth flow, cookies/sessions, logging and context variables, ES modules/Vite, TDD and pure functions.
Per upcoming milestone: M1b file uploads, object storage and DOM/routing basics in plain JS; M3 time-based logic and pure pricing; M4 relational design for carts/orders and client state; M5 transactions, webhooks and idempotency; M6 background tasks and failure isolation; M7 authorization rules based on data; M8 testing against real Postgres and production hardening.

## Working notes
Detailed write-ups per milestone live in `.notes/` (private, git-ignored).
