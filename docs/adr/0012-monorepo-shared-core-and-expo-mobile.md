# 0012. One monorepo, a shared core package, and an Expo mobile app

Status: Accepted · Date: 2026-10-04

## Context
The store needs a mobile app that does everything the website does and shows the same live data. The developer is solo, new to mobile, works on Windows/Linux (no Mac), wants to test on an iPhone without paying Apple, and is learning JavaScript. The website's pure logic (money, prices and sales, cart rules, form validation, time) is already written and tested, and a price rule must never differ between clients.

## Decision
- **One repository (monorepo)** for backend, website, mobile app and shared code, with an **npm workspace** at the root (`frontend`, `packages/*`, and `mobile` later).
- **`packages/core` (`@isabella/core`)** holds everything that is the same on every client: the pure `lib/` modules, the error normaliser, `createApiClient` (cookies on the website, bearer token on the phone through configuration), one endpoint factory per API area (`createCartApi(request)` and so on), and a `createPoller` for live updates. Apps import only from the package root.
- **The mobile app uses Expo (React Native) in JavaScript.** It runs on an iPhone through the free Expo Go app (no Mac, no Apple account) and on Android, and it can import `@isabella/core` directly.
- **App state stays per app for now** (the website's `session` and `cart` stores are not shared). The shared surface is pure functions and the API layer; stores can become factories later if the duplication proves costly.
- Web-only code stays in the website (`lib/route.js`, DOM components).
- CI installs once at the root and tests all workspaces.

## Alternatives considered
- **Separate repositories per app:** useful when different teams own them; here it would mean duplicated API contracts, cross-repo pull requests and two CI setups.
- **Flutter (Dart):** polished, but an iPhone build needs a Mac or a paid Apple account plus a cloud build service, and nothing could be shared with the website, so every price and cart rule would be rewritten and kept in sync by hand.
- **PWA only (installable website):** cheapest, but not a native app and limited on iOS.
- **Copying the logic into the mobile app:** fastest on day one, but the copies drift; a wrong price on one client is the worst kind of bug in a shop.
- **Publishing `@isabella/core` to an npm registry:** unnecessary overhead for a private package consumed from the same repository.
- **Thin re-export shims** left in the website so imports did not change: rejected as permanent clutter; the imports were rewritten once, mechanically.

## Consequences
- (+) One implementation of every rule, one set of tests, one CI; a change to the API contract and its clients lands in one pull request; the mobile app starts with the whole tested toolbox.
- (-) A workspace adds tooling to learn (single root lockfile, hoisted dependencies); the shared package must stay free of browser- and phone-specific code; Expo Go is a sandbox with limits that affect sign-in redirects (handled in ADR 0013).
