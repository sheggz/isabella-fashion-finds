// The phone's side of "Sign in with Google" (ADR 0013). Pure helpers: the platform pieces they
// need (random bytes, SHA-256) are passed in, so they are tested here with Node's crypto and
// used in the app with expo-crypto.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Base64 with the URL-safe alphabet and no "=" padding (RFC 4648 section 5), the form PKCE and
 * URLs need. Written by hand because React Native has no `Buffer` and `btoa` is not URL-safe.
 * @param {Uint8Array | number[]} bytes
 */
export const base64UrlEncode = (bytes) => {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    out += ALPHABET[a >> 2] + ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) out += ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) out += ALPHABET[c & 63];
  }
  return out;
};

const encoder = (text) => new Uint8Array([...text].map((ch) => ch.charCodeAt(0))); // verifiers are plain ASCII

/** PKCE S256: BASE64URL(SHA-256(verifier)). `sha256` takes text and resolves to the digest bytes. */
export const challengeFor = async (verifier, sha256) => base64UrlEncode(await sha256(verifier));

/**
 * Invent a one-time secret (`verifier`, kept in memory only) and its fingerprint (`challenge`,
 * sent to the server up front). 32 random bytes encode to exactly 43 characters, the minimum
 * length the standard allows and the backend accepts.
 * @param {{randomBytes: (n: number) => Uint8Array, sha256: (text: string) => Promise<Uint8Array>}} deps
 */
export const createPkce = async ({ randomBytes, sha256 }) => {
  const verifier = base64UrlEncode(randomBytes(32));
  return { verifier, challenge: await challengeFor(verifier, sha256) };
};

/** The address to open in the in-app browser to start a mobile sign-in. */
export const buildLoginUrl = (apiBase, { redirectUri, challenge, state }) => {
  const query = new URLSearchParams({ client: 'mobile', redirect_uri: redirectUri, code_challenge: challenge, state });
  return `${apiBase.replace(/\/+$/, '')}/auth/google/login?${query}`;
};

const safeDecode = (text) => {
  try {
    return decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    return null; // a malformed escape: treat the whole link as unusable, never throw
  }
};

/**
 * Read the link the backend sent the user back to. Checks the `state` we invented before the
 * trip (it must come back unchanged; otherwise the link did not start from our own request).
 * Never throws: every bad input becomes `{ ok: false, reason }`.
 * @returns {{ok: true, code: string} | {ok: false, reason: 'state_mismatch' | 'cancelled' | 'missing_code'}}
 */
export const parseSignInCallback = (url, expectedState) => {
  const query = typeof url === 'string' ? url.split('#')[0].split('?')[1] : undefined;
  const params = {};
  for (const pair of (query ?? '').split('&')) {
    if (!pair) continue;
    const [rawKey, rawValue = ''] = pair.split('=');
    const key = safeDecode(rawKey);
    const value = safeDecode(rawValue);
    if (key === null || value === null) return { ok: false, reason: 'missing_code' };
    params[key] = value;
  }
  if (!expectedState || params.state !== expectedState) return { ok: false, reason: 'state_mismatch' };
  if (params.error) return { ok: false, reason: 'cancelled' };
  if (!params.code) return { ok: false, reason: 'missing_code' };
  return { ok: true, code: params.code };
};
