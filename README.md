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

# JavaScript (website + shared core): ONE install at the repository root
npm install                     # installs every workspace
npm test                        # tests every workspace (website + packages/core)
npm run dev -w frontend         # website at http://localhost:5173
npm run build                   # production build of the website
```

## Layout
- `backend/`: FastAPI (routers, services, repositories, integrations)
- `frontend/`: the website: plain JavaScript + Vite + Vitest
- `packages/core/`: shared pure logic and API layer used by the website and (soon) the mobile app
- `docs/adr/`: architecture decision records
- `supabase/migrations/`: database schema (added in M1)

## Roadmap
Done: scaffold, catalogue, Google sign-in, photos, pricing and discounts, cart, order history, shared core package.
In progress: the mobile app (Expo) and hosting (Render for the API, Netlify for the website). See [docs/plans/2026-10-04-mobile-and-hosting.md](docs/plans/2026-10-04-mobile-and-hosting.md) and [pending.md](pending.md).
Later: Paystack checkout (test mode) and transactional email.
