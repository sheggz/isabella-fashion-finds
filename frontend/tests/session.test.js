// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/api/auth.js', () => ({
  getMe: vi.fn(),
  logout: vi.fn(),
}));

import { getMe, logout } from '../src/api/auth.js';
import { session, loadSession, signOut } from '../src/state/session.js';

beforeEach(() => {
  vi.resetAllMocks();
  session.set({ status: 'loading', user: null });
});

describe('session', () => {
  it('starts in the loading state', () => {
    expect(session.get()).toEqual({ status: 'loading', user: null });
  });

  it('stores the signed-in user', async () => {
    getMe.mockResolvedValue({ id: 'u1', name: 'Ada', role: 'owner' });
    await loadSession();
    expect(session.get()).toEqual({ status: 'ready', user: { id: 'u1', name: 'Ada', role: 'owner' } });
  });

  it('treats 401 as "not signed in", which is normal and not an error', async () => {
    getMe.mockRejectedValue({ status: 401, code: 'unauthorized', message: 'Please sign in' });
    await loadSession();
    expect(session.get()).toEqual({ status: 'ready', user: null });
  });

  it('also continues as signed-out when the API is unreachable, and remembers why', async () => {
    getMe.mockRejectedValue({ status: 0, code: 'network_error', message: 'Cannot reach the server.' });
    await loadSession({ delayMs: 0 });
    expect(session.get().user).toBeNull();
    expect(session.get().status).toBe('ready');
    expect(session.get().error).toBe('Cannot reach the server.');
  });

  it('retries when the server is only waking up, and signs the user in once it answers', async () => {
    getMe
      .mockRejectedValueOnce({ status: 504, code: 'http_error', message: 'Gateway timeout' })
      .mockRejectedValueOnce({ status: 0, code: 'network_error', message: 'Cannot reach the server.' })
      .mockResolvedValue({ id: 'u1', name: 'Ada', role: 'customer' });
    await loadSession({ delayMs: 0 });
    expect(getMe).toHaveBeenCalledTimes(3);
    expect(session.get().user).toEqual({ id: 'u1', name: 'Ada', role: 'customer' });
    expect(session.get().error).toBeUndefined();
  });

  it('does not retry a 401: that is a real answer ("not signed in")', async () => {
    getMe.mockRejectedValue({ status: 401, code: 'unauthorized', message: 'Please sign in' });
    await loadSession({ delayMs: 0 });
    expect(getMe).toHaveBeenCalledTimes(1);
  });

  it('gives up after the attempts are used and reports why', async () => {
    getMe.mockRejectedValue({ status: 503, code: 'x', message: 'down' });
    await loadSession({ attempts: 3, delayMs: 0 });
    expect(getMe).toHaveBeenCalledTimes(3);
    expect(session.get().error).toBe('down');
  });

  it('signOut clears the user even if the server call fails', async () => {
    session.set({ status: 'ready', user: { id: 'u1' } });
    logout.mockRejectedValue({ status: 0, code: 'network_error', message: 'offline' });
    await signOut();
    expect(session.get().user).toBeNull();
  });
});
