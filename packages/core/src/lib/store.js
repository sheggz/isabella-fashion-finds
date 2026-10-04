/**
 * A tiny observable store: hold one value, let parts of the page subscribe to changes.
 *
 * Things worth knowing:
 * - `set` accepts a value OR an updater function `(current) => next`. Updaters should return
 *   a NEW object instead of editing the current one; the "unchanged" check below compares by
 *   identity (`===`), so mutating in place would be treated as "nothing changed" and nobody
 *   would be notified.
 * - A subscriber that throws is isolated, so one broken listener cannot stop the rest.
 *
 * @template T
 * @param {T} initial
 */
export const createStore = (initial) => {
  let value = initial;
  const listeners = new Set();

  return {
    get: () => value,
    set(next) {
      const resolved = typeof next === 'function' ? next(value) : next;
      if (resolved === value) return;
      value = resolved;
      for (const listener of [...listeners]) {
        try {
          listener(value);
        } catch (err) {
          console.error('Store subscriber failed', err);
        }
      }
    },
    /** @returns {() => void} a function that removes this subscription */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
