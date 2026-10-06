import { createSessionController } from '../src/auth/session';

const user = { id: 'u1', email: 'a@x.test', name: 'Ada', role: 'customer' };

const make = (over = {}) => {
  let token = over.token ?? null;
  const deps = {
    readToken: jest.fn(async () => token),
    saveToken: jest.fn(async (t) => { token = t; }),
    clearToken: jest.fn(async () => { token = null; }),
    getMe: jest.fn(async () => user),
    signIn: jest.fn(async () => ({ token: 'NEW', user })),
    ...over.deps,
  };
  return { controller: createSessionController(deps), deps, tokenNow: () => token };
};

describe('session controller', () => {
  it('starts unknown until restore() has run', () => {
    expect(make().controller.store.get().status).toBe('loading');
  });

  it('restore: no saved token means signed out, without calling the server', async () => {
    const { controller, deps } = make();
    await controller.restore();
    expect(controller.store.get()).toMatchObject({ status: 'signedOut', user: null });
    expect(deps.getMe).not.toHaveBeenCalled();
  });

  it('restore: a valid saved token signs the user straight back in', async () => {
    const { controller } = make({ token: 'T' });
    await controller.restore();
    expect(controller.store.get()).toMatchObject({ status: 'signedIn', user });
  });

  it('restore: a rejected token (401) is thrown away', async () => {
    const { controller, tokenNow } = make({ token: 'OLD', deps: { getMe: jest.fn(async () => { throw { status: 401 }; }) } });
    await controller.restore();
    expect(controller.store.get().status).toBe('signedOut');
    expect(tokenNow()).toBeNull();
  });

  it('restore: a network failure keeps the token and reports offline (the lesson of the website bug)', async () => {
    const { controller, tokenNow } = make({
      token: 'T',
      deps: { getMe: jest.fn(async () => { throw { status: 0, code: 'network_error', message: 'Cannot reach the server.' }; }) },
    });
    await controller.restore();
    expect(controller.store.get()).toMatchObject({ status: 'unreachable', user: null, error: 'Cannot reach the server.' });
    expect(tokenNow()).toBe('T');
  });

  it('restore can be retried after an unreachable server and then signs in', async () => {
    const getMe = jest.fn().mockRejectedValueOnce({ status: 503, message: 'down' }).mockResolvedValue(user);
    const { controller } = make({ token: 'T', deps: { getMe } });
    await controller.restore();
    await controller.restore();
    expect(controller.store.get().status).toBe('signedIn');
  });

  it('signIn: stores the token and the user', async () => {
    const { controller, tokenNow } = make();
    await controller.signIn();
    expect(controller.store.get()).toMatchObject({ status: 'signedIn', user });
    expect(tokenNow()).toBe('NEW');
  });

  it('signIn: shows "signing in" while it runs', async () => {
    let release;
    const signIn = jest.fn(() => new Promise((r) => { release = () => r({ token: 'N', user }); }));
    const { controller } = make({ deps: { signIn } });
    const pending = controller.signIn();
    expect(controller.store.get().status).toBe('signingIn');
    release();
    await pending;
  });

  it('signIn: cancelling returns to signed out with no error message', async () => {
    const { controller } = make({ deps: { signIn: jest.fn(async () => { throw { code: 'cancelled' }; }) } });
    await controller.signIn();
    expect(controller.store.get()).toMatchObject({ status: 'signedOut', error: null });
  });

  it('signIn: a failure returns to signed out with the message', async () => {
    const { controller } = make({ deps: { signIn: jest.fn(async () => { throw { code: 'sign_in_failed', message: 'Sign-in failed.' }; }) } });
    await controller.signIn();
    expect(controller.store.get()).toMatchObject({ status: 'signedOut', error: 'Sign-in failed.' });
  });

  it('signOut: forgets the token and the user', async () => {
    const { controller, tokenNow } = make({ token: 'T' });
    await controller.restore();
    await controller.signOut();
    expect(controller.store.get()).toMatchObject({ status: 'signedOut', user: null });
    expect(tokenNow()).toBeNull();
  });

  it('signOut works even if clearing storage fails', async () => {
    const { controller } = make({ token: 'T', deps: { clearToken: jest.fn(async () => { throw new Error('x'); }) } });
    await controller.restore();
    await controller.signOut();
    expect(controller.store.get().status).toBe('signedOut');
  });
});
