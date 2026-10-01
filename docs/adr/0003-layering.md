# 0003. Layered backend: routers -> services -> repositories/integrations

Status: Accepted · Date: 2026-10-01

## Context
The store has real business rules (discounts, stock, order totals, payment states) that must stay testable and must not be tangled with HTTP or SQL.

## Decision
- `routers/`: HTTP only (parse/validate in, serialise out).
- `services/`: business logic; pure functions where possible; raises domain errors.
- `repositories/`: all database access. `integrations/`: Flutterwave, Mailgun, Google, Storage adapters.
- Dependencies point downward only.

## Alternatives considered
- Logic inside route handlers: fastest to write, but untestable without HTTP and hard to reuse.
- Full hexagonal/clean architecture: more ceremony than this project needs.

## Consequences
- (+) Pure logic is unit-tested in isolation; swapping a vendor touches one adapter.
- (-) More files and a little indirection for simple CRUD.
