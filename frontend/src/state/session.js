// Who is signed in. The browser can't read the httpOnly session cookie, so it asks the server.
import { createStore } from '../lib/store.js';
import { getMe, logout } from '../api/auth.js';

/** { status: 'loading' | 'ready', user: object | null, error?: string } */
export const session = createStore({ status: 'loading', user: null });

export const loadSession = async () => {
  try {
    session.set({ status: 'ready', user: await getMe() });
  } catch (err) {
    // 401 simply means "not signed in" (the normal case for visitors), not a failure.
    // Any other error also continues as signed-out so the storefront still works, but the
    // reason is kept for display.
    session.set(err?.status === 401 ? { status: 'ready', user: null } : { status: 'ready', user: null, error: err?.message });
  }
};

export const signOut = async () => {
  try {
    await logout();
  } catch {
    // Clear locally regardless: the user asked to sign out.
  }
  session.set({ status: 'ready', user: null });
};
