# 0001. Use a single monorepo

Status: Accepted · Date: 2026-10-01

## Context
One product with a FastAPI backend and a JavaScript frontend, built by one person (or a very small team) on a short deadline. Most features change both sides together (an API change plus the UI that uses it).

## Decision
One repository with `backend/`, `frontend/`, `docs/` and `supabase/`.

## Alternatives considered
- **Two repos (backend, frontend):** useful when separate teams own each side or the API serves many unrelated clients. Costs here: two PRs per feature, two CI setups, drifting API contracts.

## Consequences
- (+) One PR per feature, one CI pipeline, shared docs and ADRs.
- (-) Both apps share one history; deploys must be configured per folder. Splitting later is possible (`git subtree`/filter) if needed.
