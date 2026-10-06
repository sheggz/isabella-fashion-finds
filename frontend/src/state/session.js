// Who is signed in. The browser can't read the httpOnly session cookie, so it asks the server.
import { createStore } from '@isabella/core';
import { getMe, logout } from '../api/auth.js';

/** { status: 'loading' | 'ready', user: object | null, error?: string } */
export const session = createStore({ status: 'loading', user: null });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ask the server who is signed in.
 *
 * Subtlety (a real bug we hit): on the free hosting the API sleeps when idle and takes up to a
 * minute to wake, so the first request after a break can time out (a 5xx or network error).
 * That says NOTHING about whether the user is signed in; their cookie is still valid. Treating
 * it as "signed out" made people look logged out until they refreshed again. So only a 401 is
 * believed; anything else is retried, and if it still fails we stay "signed out" but keep the
 * reason (app.js keeps re-checking in the background, so the user is recovered automatically).
 */
export const loadSession = async ({ attempts = 3, delayMs = 3000 } = {}) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      session.set({ status: 'ready', user: await getMe() });
      return;
    } catch (err) {
      if (err?.status === 401) {
        session.set({ status: 'ready', user: null });
        return;
      }
      lastError = err;
      if (attempt < attempts) await wait(delayMs);
    }
  }
  session.set({ status: 'ready', user: null, error: lastError?.message });
};

export const signOut = async () => {
  try {
    await logout();
  } catch {
    // Clear locally regardless: the user asked to sign out.
  }
  session.set({ status: 'ready', user: null });
};
