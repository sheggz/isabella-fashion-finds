// Thin fetch wrapper: the only place the frontend talks to the backend.
// Success resolves with parsed JSON; any failure rejects with the normalised error shape.
import { parseApiError, networkError } from './apiError.js';

export const BASE_URL = import.meta.env?.VITE_API_URL ?? 'http://localhost:8000';

export const api = async (path, options = {}) => {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      credentials: 'include', // send the httpOnly session cookie
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    });
  } catch {
    throw networkError(); // no response at all: offline, DNS, CORS, server down
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON body (e.g. a proxy error page): handled by the fallback below
  }

  if (!res.ok) throw parseApiError(res.status, body);
  return body;
};
