# 0006. Access Supabase Postgres directly with SQLAlchemy + Alembic

Status: Accepted · Date: 2026-10-01

## Context
Supabase bundles Postgres, an auto-generated REST Data API (PostgREST), Auth and Storage. FastAPI is our only API, auth is handled by us (ADR 0002), and orders involve several writes that must succeed or fail together (order, stock decrement, payment record).

## Decision
- Supabase is used as **managed Postgres + Storage**. The Data API stays off ("automatically expose new tables" unchecked); the Supabase Auth product is unused.
- FastAPI connects with a **direct Postgres connection** (session-pooler connection string in `DATABASE_URL`) using **SQLAlchemy 2.x** with the `psycopg` driver.
- Schema changes are **Alembic migrations** committed in `backend/alembic/`.
- Every table enables **Row Level Security with no policies** (defense in depth: even if the Data API were ever exposed, anon/authenticated roles see nothing). Our server role bypasses RLS.
- `SUPABASE_SERVICE_KEY` is used only for Storage uploads and never leaves the server.

## Alternatives considered
- **psycopg + plain SQL migrations (Supabase CLI):** fully transparent and no ORM, but repetitive mapping code and manual migration bookkeeping.
- **supabase-py (Data API client):** fastest start, but no multi-statement transactions without writing Postgres functions, and it re-introduces the API surface we chose to disable.

## Consequences
- (+) Real transactions for stock and payments; versioned, reviewable migrations; transferable Python skills; Supabase can be swapped for any Postgres host.
- (-) More to learn up front (ORM sessions, migrations); the session pooler is required where IPv6 is unavailable (e.g. WSL).
