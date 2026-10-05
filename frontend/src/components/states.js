// The three states every screen that loads data must handle: loading, empty, error.
import { el } from './dom.js';

/** After this long a loading placeholder admits the server may be waking from sleep. */
export const WAKING_AFTER_MS = 5000;

/**
 * Free hosting puts the server to sleep when idle, and the first request can then take about a
 * minute. A bare "Loading…" for that long looks broken, so the placeholder explains itself.
 * The timer only edits the node if it is still on screen (`isConnected`): a page that has been
 * replaced meanwhile must not be touched.
 */
export const loading = (message = 'Loading…') => {
  const node = el('p', { className: 'state', textContent: message, dataset: { loading: '' } });
  setTimeout(() => {
    if (node.isConnected) node.textContent = 'Waking the server up. This can take up to a minute the first time…';
  }, WAKING_AFTER_MS);
  return node;
};

export const emptyState = (title, hint) =>
  el('div', { className: 'state' }, el('p', { className: 'state-title', textContent: title }), hint && el('p', { textContent: hint }));

/** `error` is the normalised shape from @isabella/core (api/apiError.js); `onRetry` re-runs whatever failed. */
export const errorState = (error, onRetry) => {
  const retry = el('button', { type: 'button', textContent: 'Try again', dataset: { retry: '' } });
  retry.addEventListener('click', onRetry);
  return el(
    'div',
    { className: 'state error', attrs: { role: 'alert' } },
    el('p', { textContent: error?.message ?? 'Something went wrong. Please try again.' }),
    retry,
  );
};
