import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import {
  base64UrlEncode, buildLoginUrl, challengeFor, createAuthApi, createPkce, parseSignInCallback,
} from '../src/index.js';

const sha256 = async (text) => new Uint8Array(createHash('sha256').update(text).digest());

describe('base64UrlEncode', () => {
  it('uses the URL-safe alphabet and no padding', () => {
    expect(base64UrlEncode(new Uint8Array([251, 255, 254]))).toBe('-__-'); // standard base64 would be "+//+"
    expect(base64UrlEncode(new Uint8Array([1]))).toBe('AQ'); // no "=="
    expect(base64UrlEncode(new Uint8Array([]))).toBe('');
  });
});

describe('PKCE', () => {
  it('matches the official test vector from RFC 7636 appendix B', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', sha256)).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
    );
  });

  it('makes a 43-character verifier from 32 random bytes and a matching challenge', async () => {
    const bytes = new Uint8Array(32).map((_, i) => i * 7);
    const { verifier, challenge } = await createPkce({ randomBytes: () => bytes, sha256 });
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43}$/);
    expect(challenge).toBe(await challengeFor(verifier, sha256));
    expect(challenge).toHaveLength(43);
  });

  it('gives a different verifier for different random bytes', async () => {
    const a = await createPkce({ randomBytes: () => new Uint8Array(32).fill(1), sha256 });
    const b = await createPkce({ randomBytes: () => new Uint8Array(32).fill(2), sha256 });
    expect(a.verifier).not.toBe(b.verifier);
  });
});

describe('buildLoginUrl', () => {
  it('asks the backend for a mobile sign-in with every value URL-encoded', () => {
    const url = buildLoginUrl('https://api.test/', { redirectUri: 'exp://1.2.3.4:8081/--/auth', challenge: 'CH', state: 'S T' });
    expect(url.startsWith('https://api.test/auth/google/login?')).toBe(true);
    expect(url).toContain('client=mobile');
    expect(url).toContain('redirect_uri=exp%3A%2F%2F1.2.3.4%3A8081%2F--%2Fauth');
    expect(url).toContain('code_challenge=CH');
    expect(url).toContain('state=S+T');
  });
});

describe('parseSignInCallback', () => {
  const base = 'isabella://auth';
  it('accepts a code whose state matches', () => {
    expect(parseSignInCallback(`${base}?code=abc&state=xyz`, 'xyz')).toEqual({ ok: true, code: 'abc' });
  });
  it('refuses a different state (a link that did not come from our own request)', () => {
    expect(parseSignInCallback(`${base}?code=abc&state=EVIL`, 'xyz')).toEqual({ ok: false, reason: 'state_mismatch' });
  });
  it('refuses a missing state', () => {
    expect(parseSignInCallback(`${base}?code=abc`, 'xyz')).toEqual({ ok: false, reason: 'state_mismatch' });
  });
  it('reports a cancelled sign-in', () => {
    expect(parseSignInCallback(`${base}?error=access_denied&state=xyz`, 'xyz')).toEqual({ ok: false, reason: 'cancelled' });
  });
  it('reports a link without a code', () => {
    expect(parseSignInCallback(`${base}?state=xyz`, 'xyz')).toEqual({ ok: false, reason: 'missing_code' });
  });
  it('copes with garbage and with undefined', () => {
    expect(parseSignInCallback(undefined, 'xyz').ok).toBe(false);
    expect(parseSignInCallback('%%%?code=%E0%A4%A&state=xyz', 'xyz').ok).toBe(false);
  });
  it('ignores a fragment and decodes escapes', () => {
    expect(parseSignInCallback(`${base}?code=a%2Bb&state=xyz#frag`, 'xyz')).toEqual({ ok: true, code: 'a+b' });
  });
});

describe('exchangeMobileCode', () => {
  it('posts the one-time code with the PKCE verifier', async () => {
    const calls = [];
    const api = createAuthApi(async (path, options) => { calls.push([path, options]); return { token: 't' }; });
    await api.exchangeMobileCode('CODE', 'VERIFIER');
    expect(calls[0]).toEqual(['/auth/mobile/exchange', { method: 'POST', json: { code: 'CODE', code_verifier: 'VERIFIER' } }]);
  });
});
