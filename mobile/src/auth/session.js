// Who is signed in on this phone. A small state machine; every outside dependency is passed in
// so it is tested without storage or network.
import { createStore } from '@isabella/core';

/**
 * Statuses: loading (haven't looked yet) | signedOut | signingIn | signedIn | unreachable
 * (a token is saved but the server could not be asked: NOT the same as signed out).
 *
 * Subtlety: only a 401 means "the server says this token is no good", so only a 401 deletes it.
 * A timeout or 5xx (the free server waking up) leaves the token alone and reports `unreachable`;
 * wiping it would log people out every time the hosting naps. The website had exactly this bug.
 */
export const createSessionController = ({ readToken, saveToken, clearToken, getMe, signIn }) => {
  const store = createStore({ status: 'loading', user: null, error: null });

  const signedOut = (error = null) => store.set({ status: 'signedOut', user: null, error });

  return {
    store,

    async restore() {
      let token;
      try {
        token = await readToken();
      } catch {
        return signedOut();
      }
      if (!token) return signedOut();
      try {
        store.set({ status: 'signedIn', user: await getMe(), error: null });
      } catch (err) {
        if (err?.status === 401) {
          await clearToken().catch(() => {});
          return signedOut();
        }
        store.set({ status: 'unreachable', user: null, error: err?.message ?? 'Cannot reach the server.' });
      }
    },

    async signIn() {
      store.set({ status: 'signingIn', user: null, error: null });
      try {
        const { token, user } = await signIn();
        await saveToken(token);
        store.set({ status: 'signedIn', user, error: null });
      } catch (err) {
        signedOut(err?.code === 'cancelled' ? null : (err?.message ?? 'Sign-in failed. Please try again.'));
      }
    },

    async signOut() {
      // Tokens are signed and expire by themselves; signing out just forgets it on this phone.
      await clearToken().catch(() => {});
      signedOut();
    },
  };
};
