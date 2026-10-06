import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { createPoller } from '@isabella/core';

export const REFRESH_INTERVAL_MS = 15000;

/**
 * Keep a screen fresh: run `refresh` every ~15 s while the app is in the foreground, and
 * immediately when the app comes back to the foreground. Stops when the screen unmounts.
 *
 * Subtleties:
 * - `refresh` is kept in a ref so the poller always calls the LATEST version without being
 *   torn down and restarted on every render (a classic stale-closure trap with hooks).
 * - A failed refresh is silent: the screen keeps what it has and the poller backs off and retries.
 *
 * @param {() => Promise<unknown>} refresh
 * @param {{enabled?: boolean, intervalMs?: number}} [options]
 */
export const useLive = (refresh, { enabled = true, intervalMs = REFRESH_INTERVAL_MS } = {}) => {
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    if (!enabled) return undefined;
    const poller = createPoller({
      task: () => latest.current(),
      intervalMs,
      isActive: () => AppState.currentState === 'active',
    });
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') poller.triggerNow();
    });
    poller.start();
    return () => {
      poller.stop();
      sub?.remove?.(); // optional: some test environments return nothing here
    };
  }, [enabled, intervalMs]);
};
