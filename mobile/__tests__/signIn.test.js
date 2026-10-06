import { performSignIn } from '../src/auth/signIn';

const make = (over = {}) => {
  const calls = {};
  const deps = {
    apiBase: 'https://api.test',
    redirectUri: 'isabella://auth',
    createPkce: async () => ({ verifier: 'V'.repeat(43), challenge: 'CHALLENGE' }),
    randomState: () => 'STATE',
    openBrowser: async (url, redirect) => {
      calls.opened = { url, redirect };
      return { type: 'success', url: 'isabella://auth?code=ONE&state=STATE' };
    },
    exchange: async (code, verifier) => {
      calls.exchanged = { code, verifier };
      return { token: 'TOKEN', user: { id: 'u1', role: 'customer' } };
    },
    ...over,
  };
  return { deps, calls };
};

describe('performSignIn', () => {
  it('opens the backend login in the in-app browser with the PKCE challenge, then trades the code', async () => {
    const { deps, calls } = make();
    const result = await performSignIn(deps);
    expect(calls.opened.url).toContain('https://api.test/auth/google/login?');
    expect(calls.opened.url).toContain('code_challenge=CHALLENGE');
    expect(calls.opened.url).toContain('state=STATE');
    expect(calls.opened.redirect).toBe('isabella://auth');
    expect(calls.exchanged).toEqual({ code: 'ONE', verifier: 'V'.repeat(43) });
    expect(result).toEqual({ token: 'TOKEN', user: { id: 'u1', role: 'customer' } });
  });

  it('reports a closed browser as "cancelled" without calling the server', async () => {
    const exchange = jest.fn();
    const { deps } = make({ openBrowser: async () => ({ type: 'cancel' }), exchange });
    await expect(performSignIn(deps)).rejects.toMatchObject({ code: 'cancelled' });
    expect(exchange).not.toHaveBeenCalled();
  });

  it('refuses a link whose state is wrong and never trades its code', async () => {
    const exchange = jest.fn();
    const { deps } = make({ openBrowser: async () => ({ type: 'success', url: 'isabella://auth?code=X&state=EVIL' }), exchange });
    await expect(performSignIn(deps)).rejects.toMatchObject({ code: 'sign_in_failed' });
    expect(exchange).not.toHaveBeenCalled();
  });

  it('treats a Google "denied" as cancelled', async () => {
    const { deps } = make({ openBrowser: async () => ({ type: 'success', url: 'isabella://auth?error=access_denied&state=STATE' }) });
    await expect(performSignIn(deps)).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('passes server errors from the exchange through unchanged', async () => {
    const serverError = { status: 401, code: 'unauthorized', message: 'That sign-in code is not valid.' };
    const { deps } = make({ exchange: async () => { throw serverError; } });
    await expect(performSignIn(deps)).rejects.toBe(serverError);
  });
});
