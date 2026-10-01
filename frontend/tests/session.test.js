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
    await loadSession();
    expect(session.get().user).toBeNull();
    expect(session.get().status).toBe('ready');
    expect(session.get().error).toBe('Cannot reach the server.');
  });

  it('signOut clears the user even if the server call fails', async () => {
    session.set({ status: 'ready', user: { id: 'u1' } });
    logout.mockRejectedValue({ status: 0, code: 'network_error', message: 'offline' });
    await signOut();
    expect(session.get().user).toBeNull();
  });
});
