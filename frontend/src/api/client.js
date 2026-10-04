// The website's HTTP client: the shared factory, configured for the browser.
import { createApiClient } from '@isabella/core';

// "/api" in production (Netlify forwards it to the backend, which keeps the login cookie
// first-party); the local backend in development. Set VITE_API_URL to override.
export const BASE_URL = import.meta.env?.VITE_API_URL ?? 'http://localhost:8000';

/** The browser proves who is signed in by sending its httpOnly session cookie. */
export const api = createApiClient({ baseUrl: BASE_URL, credentials: 'include' });
