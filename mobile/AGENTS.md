# AGENTS.md: mobile app (Expo / React Native, JavaScript)

Part of the Isabella Fashion Finds monorepo; the root `AGENTS.md` rules still apply (TDD, pure functions, shared logic in `packages/core`, errors at boundaries, no secrets in code).

- **Expo changes between releases. Do not trust memory.** Check the `expo` major version in `package.json` and read `https://docs.expo.dev/versions/v<major>.0.0/` (index: `https://docs.expo.dev/llms.txt`) before using an Expo API.
- Install Expo-related packages with `npx expo install <pkg>` (resolves SDK-compatible versions), never plain `npm add`.
- **Node 22.13+ is required** by the React Native tooling (the repo's default 22.8 is too old): `fnm use 22.23.3` before running anything here.
- Routes live in `app/` (Expo Router, file-based). Everything that is not a route lives in `src/`: `auth/` (token store, session state machine, sign-in flow), `api/` (client from `@isabella/core`), `components/`, `theme.js`.
- Logic is passed its dependencies (storage, network, browser) so it is tested without a phone; screens are thin. Colours come from the shared brand kit (`@isabella/core` theme), never hard-coded.
- The token lives only in `expo-secure-store`. Only a 401 deletes it; a network error or 5xx means "unreachable", not "signed out".
- React must stay a single copy (root `overrides` pin `react` and `react-test-renderer` to 19.2.3); a second copy breaks hooks in tests with "Cannot read properties of null (reading 'useState')".
- Tests: `npm test -w mobile` (Jest + jest-expo + React Native Testing Library 13). Run the app on a phone: `cd mobile && npm run phone` (tunnel mode, dependency check skipped), scan the QR with Expo Go. If Expo prints "Networking has been disabled" and falls back to a LAN URL, its slow version check timed out and switched the tunnel off; `npm run phone` avoids that. Stop any old `expo start` first (port 8081).
