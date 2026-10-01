# 0005. Discounts are computed at read time from their schedule

Status: Accepted · Date: 2026-10-01

## Context
The owner schedules discounts; customers must see them as soon as they go live, and checkout must charge the right price.

## Decision
Store `starts_at` / `ends_at` on each discount. The effective price is calculated by a **pure function** from (price, discounts, now) whenever prices are shown or an order is priced. The server is the only authority on price at checkout; the order stores a price snapshot.

## Alternatives considered
- **Cron job that flips an `is_active` flag:** extra moving part; a late or failed job shows wrong prices.

## Consequences
- (+) Discounts go live exactly on time; nothing to monitor; trivially unit-testable.
- (-) Price is computed on every read (cheap at this scale; cache later if needed).
