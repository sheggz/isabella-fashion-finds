// The three states every screen that loads data must handle: loading, empty, error.
import { el } from './dom.js';

export const loading = (message = 'Loading…') =>
  el('p', { className: 'state', textContent: message, dataset: { loading: '' } });

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
