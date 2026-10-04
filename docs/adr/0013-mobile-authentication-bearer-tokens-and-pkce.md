# 0013. Mobile authentication: bearer tokens, one-time codes and PKCE

Status: Accepted · Date: 2026-10-05 · Builds on ADR 0002 (Google sign-in handled by FastAPI)

## Context
The website proves who is signed in with an httpOnly cookie. A phone app has no browser cookie jar and must keep its login in the phone's secure storage. Google sign-in happens in a browser window, and its result has to reach the app through a link such as `isabella://auth?...`. **Any other app on the phone can register to handle the same kind of link**, so whatever travels in that link can be stolen. Whatever we choose must also keep roles (owner/customer) identical on both clients.

## Decision
- **Same token, two transports.** The signed, expiring session token (7 days) is accepted either from the cookie (website) or from `Authorization: Bearer <token>` (phone). Roles and expiry therefore behave identically. If a bearer header is present it is used alone: a bad one is a 401, never a silent fall-back to a cookie.
- **The login link carries only a one-time code, never a token.** After Google, the backend redirects to the app's link with `code` (random, 32 bytes, **stored hashed**, single use, valid for 2 minutes) and the app's own `state`. The app trades it at `POST /auth/mobile/exchange` for the token.
- **PKCE (RFC 7636, S256).** At the start the app sends a `code_challenge` (SHA-256 of a secret `code_verifier` that never leaves the app until the exchange). The exchange must present the verifier; it must hash to the stored challenge. A stolen code is useless without the verifier.
- **Burn on any attempt.** The code is consumed atomically before the verifier is checked, so a thief gets at most one guess and the real app is only asked to sign in again. All failures return the same message.
- **Redirect allowlist.** The app's `redirect_uri` must start with a configured prefix (`MOBILE_REDIRECT_PREFIXES`, default `isabella://`). It is checked before Google is contacted and is carried through the Google round trip in a **signed cookie** with its own salt (so it cannot be mistaken for a session).
- **Expo Go during testing:** the sandbox app uses `exp://` links, so `exp://` is added to the allowlist on the hosted test backend only. This relies on PKCE for safety and is **removed before any standalone build is published**.
- **Sign-out** on the phone discards the token. Server-side revocation is a planned hardening step (tokens are signed and expire by themselves).

## Alternatives considered
- **Return the token directly in the redirect link:** simplest, but exposes a full login to any app that can read the link.
- **Authorization code without PKCE:** a stolen code would be redeemable by the thief.
- **Google's own native sign-in SDK on the phone and verify Google's ID token on our server:** a good standard, but it needs native modules unavailable in Expo Go and a second Google client per platform; it can replace this later without changing the token used afterwards.
- **A separate mobile-only token type:** more code and a risk of the two clients' permissions drifting apart.
- **Polling a "login finished" endpoint instead of redirecting to the app:** avoids deep links but is clumsier for the user and needs server-side state per attempt.

## Consequences
- (+) One identity and one role model across clients; a leaked link or database does not give a login; every rule is covered by tests (including the RFC test vector) and was verified against the real database.
- (-) A new table (`auth_codes`) and a little housekeeping (old rows are removed when new codes are made); `exp://` is a deliberate temporary loosening; no instant server-side logout of a stolen token yet; rate limiting on `/auth/*` is still to do (Block 9).
