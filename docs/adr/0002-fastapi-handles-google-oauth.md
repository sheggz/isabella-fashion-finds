# 0002. FastAPI handles Google OAuth and issues httpOnly session cookies

Status: Accepted · Date: 2026-10-01 · Replaces the earlier idea of using Supabase Auth

## Context
Customers must sign in with Google. Supabase is used for the database and file storage. The owner wants to keep auth logic in our own backend and learn how OAuth works.

## Decision
- FastAPI runs the Google OAuth (authorization code) flow and creates/updates our own `users` row.
- The session is a **signed token in an httpOnly, Secure, SameSite cookie**. JavaScript cannot read it, which limits damage from XSS.
- Roles live on the user: `customer` or `owner`. `OWNER_EMAILS` only bootstraps the first owner; owners can promote others later.
- Authorization is a FastAPI **dependency** per route (`current_user`, `require_owner`), not global middleware, because many routes are public.

## Alternatives considered
- **Supabase Auth + FastAPI verifies its JWT:** less code and less security surface; rejected by the owner's preference and learning goal.
- **Bearer token in localStorage:** simpler, but readable by any injected script.

## Implementation notes (M2)
- Authorization-code flow, backend-only. A random `state` is stored in an httpOnly `oauth_state` cookie and must equal the `state` Google returns (anti login-CSRF). PKCE is not used: this is a confidential client holding a client secret.
- The session cookie holds only a signed, expiring user id (7 days, `itsdangerous`). Role is read from the database on every request, so promotions and demotions apply immediately.
- Cookies: `HttpOnly`, `SameSite=Lax` (Lax, not Strict, so the cookie survives Google's redirect back), `Secure` when `APP_ENV=production`.
- CSRF for state-changing routes relies on `SameSite=Lax` (cross-site POST/PUT/PATCH/DELETE do not carry the cookie) plus the CORS origin allowlist. Revisit with explicit CSRF tokens if the frontend and API are ever served from different registrable domains in production (SameSite then needs `None`).
- Users are matched on Google's permanent `sub`, not the email. Unverified Google emails are refused.
- The post-login redirect target is fixed in config, never read from the request (no open redirect).
- `OWNER_EMAILS` can grant the owner role but never removes it.

## Consequences
- (+) Full control; one consistent session model; roles are ours.
- (-) More security-sensitive code to write and test (state/CSRF checks, cookie flags, token expiry). Needs CORS with credentials and CSRF protection on state-changing routes.
