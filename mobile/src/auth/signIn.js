// One "Sign in with Google" attempt (the phone's half of ADR 0013). All platform pieces are
// passed in, so the whole flow is tested without a phone.
import { buildLoginUrl, parseSignInCallback } from '@isabella/core';

const failure = (code, message) => ({ status: 0, code, message, details: null, requestId: null });

/**
 * @param {object} deps
 * @param {string} deps.apiBase
 * @param {string} deps.redirectUri       where the backend sends the browser back to (our app link)
 * @param {() => Promise<{verifier: string, challenge: string}>} deps.createPkce
 * @param {() => string} deps.randomState
 * @param {(url: string, redirectUri: string) => Promise<{type: string, url?: string}>} deps.openBrowser
 * @param {(code: string, verifier: string) => Promise<{token: string, user: object}>} deps.exchange
 * @returns {Promise<{token: string, user: object}>}
 * @throws {{code: 'cancelled'} | {code: 'sign_in_failed'} | object} a normalised error
 */
export const performSignIn = async ({ apiBase, redirectUri, createPkce, randomState, openBrowser, exchange }) => {
  const { verifier, challenge } = await createPkce();
  const state = randomState();

  const result = await openBrowser(buildLoginUrl(apiBase, { redirectUri, challenge, state }), redirectUri);
  if (result.type !== 'success') throw failure('cancelled', 'Sign-in was cancelled.');

  const parsed = parseSignInCallback(result.url, state);
  if (!parsed.ok) {
    if (parsed.reason === 'cancelled') throw failure('cancelled', 'Sign-in was cancelled.');
    throw failure('sign_in_failed', 'Sign-in could not be completed. Please try again.');
  }
  // Server errors (invalid or expired code, network) propagate unchanged: they are already normalised.
  return exchange(parsed.code, verifier);
};
