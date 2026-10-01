// Thin fetch wrapper: the only place the frontend talks to the backend.
// Success resolves with parsed JSON (or null for an empty body); any failure rejects with the
// normalised error shape from apiError.js.
import { parseApiError, networkError } from './apiError.js';

export const BASE_URL = import.meta.env?.VITE_API_URL ?? 'http://localhost:8000';

/**
 * @param {string} path
 * @param {RequestInit & {json?: any}} [options]
 *   `json` is a convenience: the value is stringified and the JSON content type is set.
 *   For file uploads pass a FormData as `body` instead and the content type is left unset.
 *
 * Why the content type must stay unset for FormData: a multipart body needs a "boundary"
 * marker inside the Content-Type header, and only the browser knows it. If we set the header
 * ourselves the boundary is missing and the server cannot read the upload.
 */
export const api = async (path, { json, headers, body, ...rest } = {}) => {
  const init = {
    credentials: 'include', // send the httpOnly session cookie
    ...rest,
    headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : body,
  };

  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, init);
  } catch {
    throw networkError(); // no response at all: offline, DNS, CORS, server down
  }

  let parsed = null;
  try {
    parsed = await res.json();
  } catch {
    // empty body (e.g. 204) or a non-JSON page from a proxy: handled below
  }

  if (!res.ok) throw parseApiError(res.status, parsed);
  return parsed;
};
