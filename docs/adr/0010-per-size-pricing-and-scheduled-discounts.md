# 0010. Per-size pricing and scheduled discounts

Status: Accepted · Date: 2026-10-01 · Builds on ADR 0005 (discounts computed at read time)

## Context
The owner needs (1) either one price for all sizes of a piece or a separate price per size, and (2) discounts she can schedule that customers see the moment they go live.

## Decision
**Pricing mode.** Each piece is `single` (one price on the piece, sizes carry none) or `per_size` (each size carries its own price, the piece carries none). The database enforces that exactly one of the two exists (`CHECK ((pricing_mode = 'single') = (price_kobo IS NOT NULL))`), the schema enforces the same with specific messages, and the pure function `check_prices` is the shared rule. A piece reports a "from" price (cheapest size) and whether sizes differ. A whole piece (details, mode, prices, sizes) is saved by one atomic `PUT /products/{id}`, so it can never be left half-converted; `PATCH` and "replace sizes" refuse changes that would make a piece inconsistent.

**Discounts.** A discount has a name (shown to customers), a kind (percentage or fixed naira amount), a start and an end (both required, stored in UTC, time zones required on input), an enabled flag, and a scope (every piece, or selected pieces). Rules, all in pure `app/domain/pricing.py`:
- live means `starts_at <= now < ends_at` and enabled; nothing runs on a timer (ADR 0005);
- discounts **never stack**: the single best (largest reduction) applies; ties go to the one ending soonest, then lowest id, so results never depend on row order;
- a discount never reduces a price below 1 kobo; percentages are strictly between 0 and 100; percentages are stored as integer basis points and rounded half up;
- each size is discounted from its own price.
Responses are built by a presenter from the base price plus live discounts and the current time, which is passed in as an argument. The same `quote_variant` function will price carts and orders, so the server computes every real price one way.

## Alternatives considered
- **Always store a price on every size plus a "same price" flag:** simpler reads, but editing the shared price means rewriting every size, and the flag and values can disagree.
- **Per-size prices as an override of the piece price:** allows two prices at once, which is ambiguous in listings and easy to get wrong.
- **Stacking discounts:** more flexible but unpredictable for customers and easy to over-discount by accident.
- **A scheduled job that flips discounts on and off:** rejected in ADR 0005 (late or failed job means wrong prices).
- **Optional end date:** convenient for open-ended sales, but a forgotten discount would run forever; both ends are required for now.

## Consequences
- (+) Prices are always consistent; going live and ending are exact; one pricing function for catalogue, cart and checkout; invalid combinations are rejected in three layers.
- (-) Every product response needs one extra query for not-yet-ended discounts (a single query per list); a customer with a page already open sees a discount only after refreshing; the per-product "from" price and sale badge are derived, so any new endpoint returning products must go through the presenter.
