// Keeps a screen up to date with changes made elsewhere (another browser, the phone app).
import { createPoller } from '@isabella/core';

export const REFRESH_INTERVAL_MS = 15000;

/**
 * Run `refresh` every ~15 s while the tab is visible, and immediately when the shopper returns
 * to the tab or the network comes back. Returns a cleanup function; pages hand it to the router,
 * which calls it when the shopper navigates away (see router.js).
 *
 * Why this and not WebSockets: polling needs nothing special on the server and is enough for
 * "visible within seconds" at this scale. Switch to server push only if that stops being true.
 *
 * Subtlety: event listeners live on `document`/`window`, which outlive the page. They must be
 * removed in the cleanup, otherwise every visit to a page would leave one more refresher running.
 * `refresh` must be SILENT: on failure keep what is on screen (the poller backs off and retries).
 *
 * @param {() => Promise<unknown>} refresh
 * @param {{intervalMs?: number}} [options]
 * @returns {() => void}
 */
export const keepFresh = (refresh, { intervalMs = REFRESH_INTERVAL_MS } = {}) => {
  const poller = createPoller({
    task: refresh,
    intervalMs,
    isActive: () => document.visibilityState !== 'hidden',
  });
  const onVisible = () => {
    if (document.visibilityState !== 'hidden') poller.triggerNow();
  };
  const onOnline = () => poller.triggerNow();

  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  poller.start();

  return () => {
    poller.stop();
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
  };
};
