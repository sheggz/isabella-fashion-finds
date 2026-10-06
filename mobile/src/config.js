// Where the API lives. Expo inlines EXPO_PUBLIC_* variables at build time; override for local
// work with e.g. `EXPO_PUBLIC_API_URL=http://192.168.1.20:8000 npx expo start`. The default is
// the hosted API, so the app works on a phone with nothing else running.
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://isabella-api.onrender.com';

// The address that STARTS a Google sign-in. It must be the public address the backend was told
// about (its BACKEND_URL, which Google redirects back to), not the direct API address:
// the sign-in remembers things in cookies set on the address where it starts, and Google brings
// the browser back to BACKEND_URL, so both visits must be on the same address or the cookies
// are not sent back and the sign-in is refused. Every other call goes straight to API_URL
// (skipping the website's forwarding, which has a shorter time limit than a waking server needs).
export const AUTH_URL = process.env.EXPO_PUBLIC_AUTH_URL ?? 'https://splendorous-rabanadas-86ac55.netlify.app/api';
