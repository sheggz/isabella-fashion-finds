# Isabella Fashion Finds

Online store for a fashion brand. Owner manages the catalogue and discounts; customers sign in with Google, shop, pay with Flutterwave, get email receipts, and leave reviews.

See [AGENTS.md](AGENTS.md) for coding rules and [docs/adr/](docs/adr/) for the reasoning behind key decisions.

## Quick start
```bash
cp .env.example .env            # fill in values as accounts are set up

# backend  (http://localhost:8000, docs at /docs)
cd backend && uv sync
uv run uvicorn app.main:app --reload
uv run pytest                   # tests
uv run ruff check .             # lint

# frontend (http://localhost:5173)
cd frontend && npm install
npm run dev
npm test
```

## Layout
- `backend/`: FastAPI (routers, services, repositories, integrations)
- `frontend/`: plain JavaScript + Vite + Vitest
- `docs/adr/`: architecture decision records
- `supabase/migrations/`: database schema (added in M1)

## Roadmap
Each milestone is a vertical slice (backend + frontend + tests). See [pending.md](pending.md) for the full plan and status.

M0 scaffold ✅ · M1a catalogue API ✅ · M2 Google sign-in ✅ · **M1b images, storefront and owner dashboard** · D1 deploy checkpoint · M3 discounts · M4 cart and orders · M5 Flutterwave checkout · M6 Mailgun emails · M7 reviews · M8 hardening and final deploy
