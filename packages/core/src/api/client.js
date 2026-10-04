// The HTTP client factory shared by the website and the phone app.
// Success resolves with parsed JSON (or null for an empty body); any failure rejects with the
// normalised error shape from apiError.js, so screens handle one kind of error everywhere.
import { networkError, parseApiError } from './apiError.js';

/**
 * Build a `request(path, options)` function bound to one backend.
 *
 * The two platforms differ ONLY in how they prove who is signed in, and that is configuration:
 * - website: `credentials: 'include'` makes the browser send its httpOnly session cookie;
 * - phone:   `getAuthHeader` returns `{ Authorization: 'Bearer <token>' }` from secure storage.
 *
 * @param {object} config
 * @param {string} config.baseUrl         e.g. "https://api.example.com" or "/api" (a relative base)
 * @param {RequestCredentials} [config.credentials]
 * @param {() => object | Promise<object>} [config.getAuthHeader]
 * @param {typeof fetch} [config.fetchImpl]  injected in tests; defaults to the global fetch
 *
 * Per call: `{ json }` stringifies a body and sets the JSON content type. For file uploads pass a
 * FormData as `body` and the content type is left unset: a multipart body needs a "boundary"
 * inside the Content-Type header that only the platform knows, so setting it ourselves would
 * make the server unable to read the upload.
 */
export const createApiClient = ({ baseUrl, credentials, getAuthHeader, fetchImpl }) => {
  const root = baseUrl.replace(/\/+$/, '');
  const send = fetchImpl ?? ((...args) => globalThis.fetch(...args));

  return async (path, { json, headers, body, ...rest } = {}) => {
    let auth = {};
    try {
      auth = (await getAuthHeader?.()) ?? {};
    } catch {
      // Without a readable sign-in we must not quietly send an anonymous request.
      throw { status: 0, code: 'auth_unavailable', message: 'Could not read your sign-in. Please try again.', details: null, requestId: null };
    }

    const init = {
      ...(credentials ? { credentials } : {}),
      ...rest,
      // The auth header goes last so a caller's own headers can never replace it by accident.
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers, ...auth },
      body: json !== undefined ? JSON.stringify(json) : body,
    };

    let res;
    try {
      res = await send(`${root}${path}`, init);
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
};
